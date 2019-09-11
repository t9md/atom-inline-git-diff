const {Range} = require('atom')
JsDiff = require('diff')
const {repositoryForPath} = require('./utils')

const { execSync } = require('child_process')

const { mkdtempSync, writeFileSync, accessSync } = require('fs')
const { ensureDirSync } = require('fs-extra')
const { join, relative, basename, dirname } = require('path')
const sysTmpDir = String(require('os').tmpdir)

const checkNewline = function(str, linebrk) {
  if(!str.endsWith(linebrk)) { str = str + linebrk}
  return str
}

const tmpDirPrefix = join(sysTmpDir, 'inlinegitworddiff-')
const tmpDir = mkdtempSync(tmpDirPrefix)

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

function parseGitDiff(gitDiff, linebrk) {
  var rawDiffs = []
  var newLineNumber, newStart, newLines, oldLineNumber, oldStart, oldLines
  const errMsg = "cannot interpret the following git diff output:\n"+gitDiff
  if (gitDiff != "\n" && gitDiff != '\r\n' && gitDiff != "") {
    var gitDiffLines = gitDiff.split(linebrk)
    if (gitDiffLines < 5) { throw errMsg }
    for (var i = 4; i < gitDiffLines.length; i++) {
      var line = gitDiffLines[i]
      if (!line) { continue }
      var startChar = line.charAt(0)
      line = line.substr(1)+linebrk
      switch (startChar){
        case "@":
          var items = line.split(" ")
          if ( !items[1].startsWith("-") || !items[2].startsWith("+") ) {
            throw errMsg
          }
          for (var j = 1; j < 3; j++) {
            items[j] = items[j].substr(1)
            if(items[j].indexOf(",") === -1) { items[j] += ",1"; }
          }
          var oldSL = items[1].split(",")
          var newSL = items[2].split(",")
          oldStart = parseInt(oldSL[0])
          oldLines = parseInt(oldSL[1])
          newStart = parseInt(newSL[0])
          newLines = parseInt(newSL[1])
          newLineNumber = newStart
          oldLineNumber = oldStart
          break
        case "-":
          rawDiffs.push({
            line: line,
            newLineNumber: -1,
            newLines: newLines,
            newStart: newStart,
            oldLineNumber: oldLineNumber,
            oldLines: oldLines,
            oldStart: oldStart
          })
          oldLineNumber += 1
          break
        case "+":
          rawDiffs.push({
            line: line,
            newLineNumber: newLineNumber,
            newLines: newLines,
            newStart: newStart,
            oldLineNumber: -1,
            oldLines: oldLines,
            oldStart: oldStart
          })
          newLineNumber += 1
          break
        default:
          throw errMsg
      }
    }
  }
  return rawDiffs
}

module.exports = class Diff {

  static init(buffer, selectedCommitHash) {
    const linebrk = (buffer.getText().indexOf('\r\n')>=0) ? '\r\n' : '\n'
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()
    const relFilePath = relative(repo.workingDirectory, filePath)
    const fileBasename = basename(filePath)
    const tmpFileDir = join(tmpDir, dirname(relFilePath))
    ensureDirSync(tmpFileDir)
    const tmpFile = join(tmpFileDir, fileBasename)
    const tmpFileContent = checkNewline(String(execSync(
      'git -C "' + repo.workingDirectory + '" show ' +
      selectedCommitHash + ':"' + relFilePath + '"'
    )), linebrk) /* adds a newline at the end if it is missing to avoid
    git-diff error 'No newline at end of file' */
    writeFileSync(tmpFile, tmpFileContent)
  }

  static collect (buffer, diffStyle) {
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()
    const relFilePath = relative(repo.workingDirectory, filePath)
    const fileBasename = basename(filePath)
    const tmpFileDir = join(tmpDir, dirname(relFilePath))
    const tmpFile = join(tmpFileDir, fileBasename)
    const linebrk = (buffer.getText().indexOf('\r\n')>=0) ? '\r\n' : '\n'
    const lbRegexp = (linebrk == '\r\n') ? /\r\n\s/g : /\n\s/g

    try {
      accessSync(tmpFile)
    }
    catch(err) {
      throw "inline-git-diff: cannot access tmp file to compute diff"
    }
    var gitDiff
    try {
      gitDiff = String(execSync(
        'git -C "'+ repo.workingDirectory + '" --no-pager diff -U0 --no-color '+
        '--diff-algorithm=patience '+
        '--no-index "'+ tmpFile + '" -',
        {input: checkNewline(buffer.getText(), linebrk), timeout: 10000}
    ))}
    catch(err) {
      /* apparently, when called by atom, git-diff always returns exit code 1
      if diffs are found (like diff) so we have to handle output in this way */
      gitDiff = String(err.stdout)
    }
    var rawDiffs = parseGitDiff(gitDiff, linebrk)
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
      if (diffStyle == "word diff"){
        diff.wdiffLines[newLineNumber >= 0 ? 'added' : 'removed'].push({hunks: []})
      }
    }
    switch (diffStyle) {
      case "inner line diff":
        for (const diff of diffs.filter(diff => diff.needComputeInnerLineDiff)) {
          diff.innerLineDiffs = []
          for (let i = 0; i < diff.lines.added.length; i++) {
            const [rangeA, rangeB] = computeChangeBetweenTwoText(diff.lines.added[i], diff.lines.removed[i])
            diff.innerLineDiffs.push({added: rangeA, removed: rangeB})
          }
        }
        break
      case "word diff":
        for (const diff of diffs) {
          var newRow = 0
          var newCol = 0
          var oldRow = 0
          var oldCol = 0
          var linesRemoved = diff.lines.removed.join(" ")
          var linesAdded = diff.lines.added.join(" ")
          var wdiff = JsDiff.diffWordsWithSpace(linesRemoved, linesAdded)
          /* adding a space after the end of the line is needed in order to allow
          diffWordsWithSpace method to keep the last word at the end of the line
          separate from the first word at the beginning of the next line
          (a little bit hacky; to get a cleaner solution, diffWordsWithSpace should
          be rewritten to handle newlines)*/
          for (var hunk of wdiff) {

            var subHunks = hunk.value.replace(lbRegexp, linebrk).split(linebrk)
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
        break
      case "line diff":
      default:
    }
    return diffs
  }

  constructor (startRow, oldLines, newLines) {
    this.startRow = startRow
    this.lines = {added: [], removed: []}
    this.wdiffLines = {added: [], removed: []}
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
