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

function getLineDiffDetails(editor) {
  const repo = repositoryForPath(editor.getPath()).getRepo()
  const options = {ignoreEolWhitespace: process.platform === "win32"}
  const diff = repo.getLineDiffDetails(repo.relativize(editor.getPath()), editor.getText(), options)

  const hunks = []
  if (!diff) return hunks

  let hunk
  for (let {newStart, oldLines, newLines, newLineNumber, line} of diff) {
    if (oldLines === 0 && newLines > 0) continue // "add" only change, we have no interests

    const startRow = newStart - 1
    if (!hunk || startRow !== hunk.startRow) {
      let endRow
      if (newLines === 0 && oldLines > 0) {
        kind = "removed"
        needComputeRelativeChange = false
        endRow = startRow
      } else {
        endRow = startRow + newLines - 1
        needComputeRelativeChange = newLines === oldLines
        kind = "modified"
      }
      hunk = {startRow, endRow, addedLines: [], removedLines: [], kind, needComputeRelativeChange}
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

module.exports = {decorateRange, getLineDiffDetails, repositoryForPath}
