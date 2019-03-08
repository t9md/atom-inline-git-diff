const {Range} = require('atom')
JsDiff = require('diff')
const {repositoryForPath} = require('./utils')

// Line base diff
// -------------------------
// - compare two text then split text into three parts which is prefix-range, inner-range and sufix-range.l
// - Then finally return inner-range information as {start: start of inner-range, length: length of inner-range}.
// - Now we can highlight inner-range differently to display commonarily of two string.
// Borrowed and modified from GitHub's electron based app at desktop/desktop.
// https://github.com/desktop/desktop/pull/2461
function commonLength (textA, rangeA, textB, rangeB, reverse) {
  let max = Math.min(rangeA.length, rangeB.length)
  const startA = reverse ? textA.length - 1 : rangeA.start
  const startB = reverse ? textB.length - 1 : rangeB.start
  const stride = reverse ? -1 : 1

  let length = 0
  while (max-- && textA[startA + length] === textB[startB + length]) length += stride
  return Math.abs(length)
}

function computeChangeBetweenTwoText (textA, textB) {
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

module.exports = class Diff {
  static collect (buffer) {
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()
    const options = {ignoreEolWhitespace: process.platform === 'win32'}
    const rawDiffs = repo.getLineDiffDetails(repo.relativize(filePath), buffer.getText(), options)

    const diffs = []
    if (!rawDiffs) return diffs

    let diff
    for (const {newStart, oldLines, newLines, newLineNumber, line} of rawDiffs) {
      const startRow = newStart - 1
      if (!diff || startRow !== diff.startRow) {
        diff = new Diff(startRow, oldLines, newLines)
        diffs.push(diff)
      }
      diff.lines[newLineNumber >= 0 ? 'added' : 'removed'].push(line)
    }

    for (const diff of diffs.filter(diff => diff.needComputeInnerLineDiff)) {
      /* Based on the prepareWordDiffs method of class DiffDetailsDataManager 
      of package git-diff-details (C) 2014 Samuel Mueller - MIT license */

      diff.innerLineDiffs = []
      for (let i = 0; i < diff.lines.added.length; i++) {
        diff.innerLineDiffs.push({newWords: [], oldWords: []})
        var newCol = 0
        var oldCol = 0
        var wdiff = JsDiff.diffWordsWithSpace(diff.lines.removed[i], diff.lines.added[i])
        for (let j = 0; j < wdiff.length; j++) {
          var word = wdiff[j]
          word.offsetRow = i
          if (word.added) {
            word.startCol = newCol
            word.wordLength = word.value.length
            newCol += word.wordLength
            diff.innerLineDiffs[i].newWords.push(word)
          } else if (word.removed) {
            word.startCol = oldCol
            word.wordLength = word.value.length
            oldCol += word.value.length
            diff.innerLineDiffs[i].oldWords.push(word)
          } else {
            word.wordLength = word.value.length
            newCol += word.wordLength
            oldCol += word.wordLength
            diff.innerLineDiffs[i].newWords.push(word)
            diff.innerLineDiffs[i].oldWords.push(word)
          }
        }  
      }
    }
    return diffs
  }

  constructor (startRow, oldLines, newLines) {
    this.startRow = startRow
    this.lines = {added: [], removed: []}
    this.needComputeInnerLineDiff = newLines === oldLines

    if (oldLines === 0 && newLines > 0) {
      this.kind = 'added'
      this.endRow = startRow + newLines - 1
    } else if (newLines === 0 && oldLines > 0) {
      this.kind = 'removed'
      this.endRow = startRow + 1 // HACK endRow is just used to detect hunk at cursor when cursor is at line above or below
    } else {
      this.kind = 'modified'
      this.endRow = startRow + newLines - 1
    }
  }

  destroy () {}

  getRange () {
    const {kind, startRow, endRow} = this
    if (kind === 'added' || kind === 'modified') {
      return new Range([startRow, 0], [endRow + 1, 0])
    } else if (kind === 'removed') {
      return new Range([startRow + 1, 0], [startRow + 1, 0])
    }
  }

  getRemovedText () {
    return this.lines.removed.join('')
  }

  containsRow (row) {
    return this.startRow <= row && row <= this.endRow
  }
}
