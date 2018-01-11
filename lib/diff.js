const {Range, Point, CompositeDisposable, Emitter} = require("atom")
const {repositoryForPath} = require("./utils")
const Git = require("./git")

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

function splitByNewline(string) {
  const regex = /\r?\n/g
  let start = 0

  const results = []
  while (regex.exec(string)) {
    results.push(string.slice(start, regex.lastIndex))
    start = regex.lastIndex
  }
  if (start < string.length) {
    results.push(string.slice(start))
  }
  return results
}

function parseDiff(diffOutputText) {
  const regexHunkHeader = /^@@ -\d+,\d+ \+(\d+),\d+ @@.*$/m

  let diff
  let hunkNewStartLine, hunkNewStartLineOffset
  const diffs = []

  const saveDiff = () => {
    if (diff) {
      diffs.push(diff)
      diff = null
    }
  }
  const newDiff = startLine => {
    diff = {startLine, lines: {added: [], removed: []}}
  }

  const rawDiffLines = splitByNewline(diffOutputText).slice(4) // skp header rows
  for (const line of rawDiffLines) {
    const match = regexHunkHeader.exec(line)
    if (match) {
      saveDiff()
      hunkNewStartLine = Number(match[1])
      hunkNewStartLineOffset = 0
      continue
    }
    const lineText = line.slice(1)
    const firstChar = line[0]
    if (firstChar === "-") {
      if (!diff) newDiff(hunkNewStartLine + hunkNewStartLineOffset - 1)
      diff.lines.removed.push(lineText)
    } else if (firstChar === "+") {
      if (!diff) newDiff(hunkNewStartLine + hunkNewStartLineOffset)
      if (!diff.lines.added.length) diff.startLine = hunkNewStartLine + hunkNewStartLineOffset
      diff.lines.added.push(lineText)
    } else {
      saveDiff()
    }
    if (firstChar !== "-") hunkNewStartLineOffset++
  }
  saveDiff()

  return diffs.map(diff => new Diff(diff.startLine - 1, diff.lines))
}

class Diff {
  static async collect(buffer, diffBase) {
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()

    let diffs
    if (diffBase === "HEAD") {
      diffs = []
      const options = {ignoreEolWhitespace: process.platform === "win32"}
      const rawDiffs = repo.getLineDiffDetails(repo.relativize(filePath), buffer.getText(), options)
      if (!rawDiffs) return diffs

      // Spec:
      // - newStart: Line number of hunk start
      // - newLineNumber: Line number of `line`
      // - line: Line text
      let diff
      for (const {newStart, newLineNumber, line} of rawDiffs) {
        const startRow = newStart - 1
        if (!diff || startRow !== diff.startRow) {
          diff = new Diff(startRow)
          diffs.push(diff)
        }
        diff.lines[newLineNumber >= 0 ? "added" : "removed"].push(line)
      }
    } else {
      const git = new Git(repo)
      const diffOutput = await git.diffWithText(repo.relativize(filePath), diffBase, buffer.getText())
      diffs = parseDiff(diffOutput)
    }

    for (const diff of diffs) diff.finalize()
    return diffs
  }

  constructor(startRow, lines = {added: [], removed: []}) {
    this.startRow = startRow
    this.lines = lines
  }

  isEqual(diff) {
    const props = ["kind", "startRow", "endRow"]
    return (
      props.every(prop => this[prop] === diff[prop]) &&
      this.lines.added.join("") === diff.lines.added.join("") &&
      this.lines.removed.join("") === diff.lines.removed.join("")
    )
  }

  destroy() {}

  hasInnerLineDiff() {
    return !!this.innerLineDiffs
  }

  finalize() {
    const {added, removed} = this.lines
    const oldLines = removed.length
    const newLines = added.length

    if (oldLines === 0 && newLines > 0) {
      this.kind = "added"
      this.endRow = this.startRow + newLines - 1
    } else if (newLines === 0 && oldLines > 0) {
      this.kind = "removed"
      this.endRow = this.startRow + 1 // HACK endRow is just used to detect hunk at cursor when cursor is at line above or below
    } else {
      this.kind = "modified"
      this.endRow = this.startRow + newLines - 1
    }

    if (added.length === removed.length) {
      this.innerLineDiffs = []
      const {added, removed} = this.lines
      for (let i = 0; i < added.length; i++) {
        const [rangeA, rangeB] = computeChangeBetweenTwoText(added[i], removed[i])
        this.innerLineDiffs.push({added: rangeA, removed: rangeB})
      }
    }
  }

  getRange() {
    const {kind, startRow, endRow} = this
    if (kind === "added" || kind === "modified") {
      return new Range([startRow, 0], [endRow + 1, 0])
    } else if (kind === "removed") {
      return new Range([startRow + 1, 0], [startRow + 1, 0])
    }
  }

  getRemovedText() {
    return this.lines.removed.join("")
  }

  containsRow(row) {
    return this.startRow <= row && row <= this.endRow
  }
}

module.exports = Diff
