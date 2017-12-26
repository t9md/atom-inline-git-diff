const JsDiff = require("diff")

module.exports = class DiffDetailsDataManager {
  constructor() {
    this.invalidate()
  }

  getHunkAtLine(lineNumber) {
    if (!this.lineDiffDetails) {
      this.lineDiffDetails = this.getLineDiffDetails(this.repo, this.path, this.text)
      if (this.lineDiffDetails) this.annotateWordDiffs(this.lineDiffDetails)
    }
    const hunks = this.lineDiffDetails || []
    return hunks.find(hunk => hunk.start <= lineNumber && lineNumber <= hunk.end)
  }

  getLineDiffDetails(repo, path, text) {
    repo = repo.getRepo(path)
    const options = {ignoreEolWhitespace: process.platform === "win32"}
    const rawLineDiffDetails = repo.getLineDiffDetails(repo.relativize(path), text, options)
    if (!rawLineDiffDetails) return

    const lineDiffDetails = []
    let hunk
    for (let {oldStart, newStart, oldLines, newLines, oldLineNumber, newLineNumber, line} of rawLineDiffDetails) {
      // process modifications and deletions only
      if (oldLines !== 0 || !(newLines > 0)) {
        // create a new hunk entry if the hunk start of the previous line
        // is different to the current
        if (!hunk || newStart !== hunk.start) {
          let newEnd, kind
          if (newLines === 0 && oldLines > 0) {
            newEnd = newStart
            kind = "d"
          } else {
            newEnd = newStart + newLines - 1
            kind = "m"
          }

          hunk = {
            start: newStart,
            end: newEnd,
            oldLines: [],
            newLines: [],
            newString: "",
            oldString: "",
            kind,
          }
          lineDiffDetails.push(hunk)
        }

        if (newLineNumber >= 0) {
          hunk.newLines.push(line)
          hunk.newString += line
        } else {
          hunk.oldLines.push(line)
          hunk.oldString += line
        }
      }
    }
    return lineDiffDetails
  }

  annotateWordDiffs(lineDiffDetails) {
    for (let hunk of lineDiffDetails) {
      if (hunk.kind !== "m" || hunk.newLines.length !== hunk.oldLines.length) {
        continue
      }
      hunk.newWords = []
      hunk.oldWords = []
      for (let i = 0, end = hunk.newLines.length; i < end; i++) {
        var oldCol
        let newCol = (oldCol = 0)
        const diff = JsDiff.diffWordsWithSpace(hunk.oldLines[i], hunk.newLines[i])
        for (let word of diff) {
          word.offsetRow = i
          if (word.added) {
            word.changed = true
            word.startCol = newCol
            newCol += word.value.length
            word.endCol = newCol
            hunk.newWords.push(word)
          } else if (word.removed) {
            word.changed = true
            word.startCol = oldCol
            oldCol += word.value.length
            word.endCol = oldCol
            hunk.oldWords.push(word)
          } else {
            newCol += word.value.length
            oldCol += word.value.length
            hunk.newWords.push(word)
            hunk.oldWords.push(word)
          }
        }
      }
    }
  }

  invalidate(repo, path, text) {
    this.repo = repo
    this.path = path
    this.text = text
    this.lineDiffDetails = null
  }
}
