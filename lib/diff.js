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
      diff.wdiffLines[newLineNumber >= 0 ? 'added' : 'removed'].push({hunks: []})
    }

    for (const diff of diffs) {
      var newRow = 0
      var newCol = 0
      var oldRow = 0
      var oldCol = 0
      var linesRemoved = diff.lines.removed.join(" \n")
      var linesAdded = diff.lines.added.join(" \n")
      var wdiff = JsDiff.diffWordsWithSpace(linesRemoved, linesAdded)
      /* adding a space before the end of the line is needed in order to allow
      diffWordsWithSpace method to keep the last word at the end of the line 
      separate from the first word at the beginning of the next line 
      (a little bit hacky; to get a cleaner solution, diffWordsWithSpace should
      be rewritten to handle newlines)*/
      for (var hunk of wdiff) {
        var subHunks = hunk.value.replace(/\s\n/g, "\n").replace(/\n\n/g, "\n").split("\n")
        /* diffWordsWithSpace returns hunks with doubled newlines, we need to 
        clean them before splitting them in subHunks */
        for (let j = 0; j < subHunks.length; j++) {
          if (subHunks[j]) {
            var subHunk = {
              added: hunk.added,
              removed: hunk.removed, 
              startCol: hunk.added ? newCol : oldCol,
              length: subHunks[j].length
            }
            if (!hunk.removed){
              diff.wdiffLines.added[newRow].hunks.push(subHunk)
              newCol += subHunks[j].length
            }
            if (!hunk.added){
              diff.wdiffLines.removed[oldRow].hunks.push(subHunk)
              oldCol += subHunks[j].length
            }
          }
          var newLine = (subHunks.length > 1) && (j < (subHunks.length - 1))
          if (newLine) {
            if (!hunk.removed) {
              newRow += 1
              newCol = 0
            }
            if (!hunk.added) {
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
    this.wdiffLines = {added: [], removed: []}

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
