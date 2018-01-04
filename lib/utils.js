const {Range, Point} = require("atom")

// return marker
function decorateRange(editor, range, decorationOptions) {
  const marker = editor.markBufferRange(range)
  editor.decorateMarker(marker, decorationOptions)
  return marker
}

function repositoryForPath(goalPath) {
  let i = 0
  for (const directory of atom.project.getDirectories()) {
    if (goalPath === directory.getPath() || directory.contains(goalPath)) {
      return atom.project.getRepositories()[i]
    }
    i++
  }
}

class Hunk {
  constructor(startRow, oldLines, newLines) {
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
    this.needComputeRelativeChange = newLines === oldLines
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

  getRangesForRelativeChange(baseRow, changes) {
    const ranges = []
    for (let i = 0; i < changes.length; i++) {
      const {start, length} = changes[i]
      if (!length) continue
      ranges.push(Range.fromPointWithDelta([baseRow + i, start], 0, length))
    }
    return ranges
  }

  getRangesForRelativeChangeForAdded(baseRow) {
    return this.getRangesForRelativeChange(baseRow, this.newRelativeChanges)
  }

  getRangesForRelativeChangeForRemoved(baseRow) {
    return this.getRangesForRelativeChange(baseRow, this.oldRelativeChanges)
  }

  getPointToInsertBlockDecoration() {
    if (this.kind === "added") {
      throw new Error("not allowed to call for 'added' kind hunk")
    }
    return new Point(this.startRow + (this.kind === "modified" ? 0 : 1), 0)
  }

  revert(editor) {
    return editor.setTextInBufferRange(this.getAddedRange(), this.getRemovedText())
  }
}

function getHunks(editor) {
  const repo = repositoryForPath(editor.getPath()).getRepo()
  const options = {ignoreEolWhitespace: process.platform === "win32"}
  const diffs = repo.getLineDiffDetails(repo.relativize(editor.getPath()), editor.getText(), options)

  const hunks = []
  if (!diffs) return hunks

  let hunk
  for (let {newStart, oldLines, newLines, newLineNumber, oldLineNumber, line} of diffs) {
    const startRow = newStart - 1
    if (!hunk || startRow !== hunk.startRow) {
      hunk = new Hunk(startRow, oldLines, newLines)
      hunks.push(hunk)
    }
    if (newLineNumber >= 0) {
      hunk.addedLines.push(line)
    } else {
      hunk.removedLines.push(line)
    }
  }

  for (let hunk of hunks.filter(hunk => hunk.needComputeRelativeChange)) {
    hunk.oldRelativeChanges = []
    hunk.newRelativeChanges = []
    for (let i = 0, end = hunk.addedLines.length; i < end; i++) {
      const [rangeA, rangeB] = getRelativeChangeRanges(hunk.removedLines[i], hunk.addedLines[i])
      hunk.oldRelativeChanges.push(rangeA)
      hunk.newRelativeChanges.push(rangeB)
    }
  }
  return hunks
}

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

function getRelativeChangeRanges(textA, textB) {
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

async function withKeepingRelativeScrollPosition(editor, fn) {
  const pixelPositionForBufferPosition = point => editor.element.pixelPositionForBufferPosition(point)

  const cursorPosition = editor.getCursorBufferPosition()
  const oldPixelTop = pixelPositionForBufferPosition(cursorPosition).top
  await fn()
  await editor.component.getNextUpdatePromise()
  const newPixelTop = pixelPositionForBufferPosition(cursorPosition).top
  const amountOfScrolledPixels = newPixelTop - oldPixelTop
  if (amountOfScrolledPixels) {
    editor.element.setScrollTop(editor.element.getScrollTop() + amountOfScrolledPixels)
    editor.component.updateSync()
  }
}

module.exports = {decorateRange, getHunks, repositoryForPath, withKeepingRelativeScrollPosition}
