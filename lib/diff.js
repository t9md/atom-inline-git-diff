const {Range} = require('atom')
JsDiff = require('diff')
const {repositoryForPath} = require('./utils')


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
      diff.wlines[newLineNumber >= 0 ? 'added' : 'removed'].push({hunks: []})
    }

    for (const diff of diffs) {
      var newRow = 0
      var newCol = 0
      var oldRow = 0
      var oldCol = 0
      var linesRemoved = diff.lines.removed.join(" \n")
      var linesAdded = diff.lines.added.join(" \n")

      var wdiff = JsDiff.diffWordsWithSpace(linesRemoved, linesAdded)
      for (var hunk of wdiff) {
        var hunkValue = hunk.value.replace(/\s\n/g, "\n")
        hunkValue = hunkValue.replace(/\n\n/g, "\n")
        var subHunks = hunkValue.split("\n")
        if (hunk.added) {
          for (let j = 0; j < subHunks.length; j++) {
            if (subHunks[j]) {
              diff.wlines.added[newRow].hunks.push({
                added: true, 
                value: subHunks[j], 
                startCol: newCol,
                length: subHunks[j].length
              })
              newCol += subHunks[j].length
            }
            if ((subHunks.length > 1) && (j < (subHunks.length - 1))) {
              newRow += 1
              newCol = 0
            }            
          }
        } else if (hunk.removed) {
          for (let j = 0; j < subHunks.length; j++) {
            if (subHunks[j]) {
              diff.wlines.removed[oldRow].hunks.push({
                removed: true, 
                value: subHunks[j], 
                startCol: oldCol,
                length: subHunks[j].length
              })
              oldCol += subHunks[j].length
            }
            if ((subHunks.length > 1) && (j < (subHunks.length - 1))) {
              oldRow += 1
              oldCol = 0
            }            
          }
        } else {
          for (let j = 0; j < subHunks.length; j++) {
            if (subHunks[j]) {
              var subHunk = {
                value: subHunks[j], 
                length: subHunks[j].length
              }
              diff.wlines.added[newRow].hunks.push(subHunk)
              diff.wlines.removed[oldRow].hunks.push(subHunk)
              oldCol += subHunks[j].length
              newCol += subHunks[j].length
            }
            if ((subHunks.length > 1) && (j < (subHunks.length - 1))) {
              newRow += 1
              newCol = 0
              oldRow += 1
              oldCol = 0
            }            
          }
        }
      }
    }
    return diffs
  }

  constructor (startRow, oldLines, newLines) {
    this.startRow = startRow
    this.lines = {added: [], removed: []}
    this.wlines = {added: [], removed: []}

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
