const {Range, Point, TextEditor} = require("atom")
const getConfig = param => atom.config.get(`git-diff-details.${param}`)
const nullGrammar = atom.grammars.grammarForScopeName("text.plain.null-grammar")
const {decorateRange, repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")

// Line base diff
//-------------------------
// - compare two text then split text into three parts which is prefix-range, inner-range and sufix-range.l
// - Then finally return inner-range information as {start: start of inner-range, length: length of inner-range}.
// - Now we can highlight inner-range differently to display commonarily of two string.
// Borrowed and modified from GitHub's electron based app at desktop/desktop.
// https://github.com/desktop/desktop/pull/2461
function commonLength(textA, rangeA, textB, rangeB, reverse) {
  let max = Math.min(rangeA.length, rangeB.length)
  const startA = reverse ? textA.length - 1 : rangeA.start
  const startB = reverse ? textB.length - 1 : rangeB.start
  const stride = reverse ? -1 : 1

  let length = 0
  while (max-- && textA[startA + length] === textB[startB + length]) length += stride
  return Math.abs(length)
}

function computeChangeBetweenTwoText(textA, textB) {
  let rangeA = {start: 0, length: textA.length}
  let rangeB = {start: 0, length: textB.length}

  const prefixLength = commonLength(textA, rangeA, textB, rangeB, false)
  rangeA = {start: prefixLength, length: textA.length - prefixLength}
  rangeB = {start: prefixLength, length: textB.length - prefixLength}

  const suffixLength = commonLength(textA, rangeA, textB, rangeB, true)
  rangeB.length -= suffixLength
  rangeA.length -= suffixLength
  return [rangeA, rangeB]
}

class RemovedDiff {
  constructor(hostEditor, hunk) {
    if (hunk.kind === "added") {
      throw new Error("not allowed to call for 'added' kind hunk")
    }

    const grammar = getConfig("useFlatColorForRemovedLines") ? nullGrammar : hostEditor.getGrammar()
    const text = hunk.getRemovedText().replace(/[\r\n]$/, "")

    const editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    editor.setGrammar(grammar)
    editor.setText(text)
    this.editor = editor
  }

  get element() {
    const outer = document.createElement("div")
    outer.className = "git-diff-details-outer"

    const main = document.createElement("div")
    main.className = "git-diff-details-main-panel"
    outer.appendChild(main)
    main.appendChild(this.editor.element)

    main.addEventListener("mousedown", event => {
      event.preventDefault()
      event.stopPropagation()
    })
    return outer
  }

  destroy() {
    this.editor.destroy()
  }
}

module.exports = class Diff {
  static collect(editor) {
    const repo = repositoryForPath(editor.getPath()).getRepo()
    const options = {ignoreEolWhitespace: process.platform === "win32"}
    const diffs = repo.getLineDiffDetails(repo.relativize(editor.getPath()), editor.getText(), options)

    const hunks = []
    if (!diffs) return hunks

    let hunk
    for (let {newStart, oldLines, newLines, newLineNumber, oldLineNumber, line} of diffs) {
      const startRow = newStart - 1
      if (!hunk || startRow !== hunk.startRow) {
        hunk = new this(editor, startRow, oldLines, newLines)
        hunks.push(hunk)
      }
      if (newLineNumber >= 0) {
        hunk.addedLines.push(line)
      } else {
        hunk.removedLines.push(line)
      }
    }

    for (let hunk of hunks.filter(hunk => hunk.needComputeChange)) {
      hunk.relativeRangesForRemoved = []
      hunk.relativeRangesForAdded = []
      for (let i = 0, end = hunk.addedLines.length; i < end; i++) {
        const [rangeA, rangeB] = computeChangeBetweenTwoText(hunk.removedLines[i], hunk.addedLines[i])
        hunk.relativeRangesForRemoved.push(rangeA)
        hunk.relativeRangesForAdded.push(rangeB)
      }
    }
    return hunks
  }

  constructor(editor, startRow, oldLines, newLines) {
    this.editor = editor
    this.startRow = startRow

    if (oldLines === 0 && newLines > 0) {
      this.kind = "added"
      this.endRow = startRow + newLines - 1
    } else if (newLines === 0 && oldLines > 0) {
      this.kind = "removed"
      // HACK endRow is just used to detect hunk at cursor when cursor is at line above or below
      this.endRow = startRow + 1
    } else {
      this.kind = "modified"
      this.endRow = startRow + newLines - 1
    }
    this.addedLines = []
    this.removedLines = []
    this.needComputeChange = newLines === oldLines
    this.markers = []
  }

  destroy() {
    if (this.removedDiff) {
      this.removedDiff.destroy()
    }
    this.markers.forEach(marker => marker.destroy())
    this.markers = null
  }

  render() {
    const highlight = (...args) => this.markers.push(decorateRange(...args))

    if (this.getAddedText()) {
      highlight(this.editor, this.getAddedRange(), {type: "line", class: "git-diff-details-added"})
    }

    if (this.getRemovedText()) {
      this.removedDiff = new RemovedDiff(this.editor, this)

      const pointToInsert = new Point(this.startRow + (this.kind === "modified" ? 0 : 1), 0)
      highlight(this.editor, [pointToInsert, pointToInsert], {
        type: "block",
        position: "before",
        item: this.removedDiff,
      })

      if (this.needComputeChange) {
        this.getRangesForChange(this.startRow, this.relativeRangesForAdded).forEach(range => {
          highlight(this.editor, range, {type: "highlight", class: "git-diff-details-added"})
        })
        this.getRangesForChange(0, this.relativeRangesForRemoved).forEach(range => {
          highlight(this.removedDiff.editor, range, {type: "highlight", class: "git-diff-details-removed"})
        })
      }
    }
  }

  getAddedRange() {
    const {kind, startRow, endRow} = this
    if (kind === "added") {
      return new Range([startRow, 0], [endRow + 1, 0])
    } else if (kind === "modified") {
      return new Range([startRow, 0], [endRow + 1, 0])
    } else if (kind === "removed") {
      return new Range([startRow + 1, 0], [startRow + 1, 0])
    }
  }

  getAddedText() {
    return this.addedLines.join("")
  }

  getRemovedText() {
    return this.removedLines.join("")
  }

  containsRow(row) {
    return this.startRow <= row && row <= this.endRow
  }

  getRangesForChange(baseRow, relativeRanges) {
    const ranges = []
    for (let i = 0; i < relativeRanges.length; i++) {
      const {start, length} = relativeRanges[i]
      if (!length) continue
      ranges.push(Range.fromPointWithDelta([baseRow + i, start], 0, length))
    }
    return ranges
  }

  revert() {
    return this.editor.setTextInBufferRange(this.getAddedRange(), this.getRemovedText())
  }
}
