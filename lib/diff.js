const {Range} = require('atom')
JsDiff = require('diff')
const {repositoryForPath} = require('./utils')

const { execSync } = require('child_process')

const { mkdtempSync, mkdirSync, writeFileSync, accessSync } = require('fs')
const { join, relative, basename, dirname } = require('path')
const sysTmpDir = String(require('os').tmpdir)

const mkdirIfNotExist = function(dirname){
  try {
    mkdirSync(dirname, { recursive: true } )
  } 
  catch(err) {
    if (! err.message.startsWith("EEXIST") ) {throw err}
  }
}

const noLinebrkCmd = function(command) {
  return String(execSync(command)).replace(/\r?\n|\r/g, "")
}

const checkNewline = function(str, linebrk) {
  if(!str.endsWith(linebrk)) { str = str + linebrk}
  return str
}

const tmpDirPrefix = join(sysTmpDir, 'inlinegitworddiff-')
const tmpDir = mkdtempSync(tmpDirPrefix)
//console.log("tmpDir is "+tmpDir)
const author = noLinebrkCmd("git config user.email")
//console.log("author is "+author)


module.exports = class Diff {

  static init(buffer) {
    this.linebrk = (buffer.getText().indexOf('\r\n')>=0) ? '\r\n' : '\n'
    this.lbRegexp = (this.linebrk == '\r\n') ? /\s\r\n/g : /\s\n/g
    //console.log("INIT: linebreak is "+(this.linebrk=='\r\n' ? '\\r\\n' : '\\n'))
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()    
    const relFilePath = relative(repo.workingDirectory, filePath)
    //console.log("INIT: relFilePath is "+relFilePath)
    const fileBasename = basename(filePath)
    const tmpFileDir = join(tmpDir, dirname(relFilePath))
    //console.log("INIT: mkdir "+tmpFileDir)
    mkdirIfNotExist(tmpFileDir)
    const tmpFile = join(tmpFileDir, fileBasename)
    //console.log("INIT: tmpFile is: "+tmpFile)
    var lastCommitHash = noLinebrkCmd(
      'git -C "' + repo.workingDirectory + '" log --author=' + author +
      ' -1 --pretty=format:"%H" "' + relFilePath + '"'
    )
    if (!lastCommitHash) { 
      // author has not commited anything yet, falling back to last commit
      lastCommitHash = noLinebrkCmd(
        'git -C "' + repo.workingDirectory + '" log'+
        ' -1 --pretty=format:"%H"'
      )
    }
    //console.log("lastCommitHash is:"+lastCommitHash)
    const tmpFileContent = checkNewline(String(execSync(
      'git -C "' + repo.workingDirectory + '" show ' + 
      lastCommitHash + ':"' + relFilePath + '"'
    )), this.linebrk) /* adds a newline at the end if it is missing to avoid 
    git-diff error 'No newline at end of file' */
    writeFileSync(tmpFile, tmpFileContent)
    //console.log("INIT: saved tmpFile")    
  }

  static collect (buffer) {
    const filePath = buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()
    //console.log("REFRESH: linebreak is "+(this.linebrk=='\r\n' ? '\\r\\n' : '\\n'))
    const relFilePath = relative(repo.workingDirectory, filePath)
    //console.log("REFRESH: relFilePath is "+relFilePath)
    const fileBasename = basename(filePath)
    const tmpFileDir = join(tmpDir, dirname(relFilePath))
    const tmpFile = join(tmpFileDir, fileBasename)
    //console.log("REFRESH: tmpFile is: "+tmpFile)
    try { 
      accessSync(tmpFile) 
    } 
    catch(err) { 
      //console.log("tmpFile not found, calling init again")
      Diff.init(buffer) 
    }
    var gitDiff
    try { 
      gitDiff = String(execSync(
        'git -C "'+ repo.workingDirectory + '" --no-pager diff -U0 --no-color '+
        '--diff-algorithm=patience '+
        '--no-index "'+ tmpFile + '" -',
        {input: checkNewline(buffer.getText(), this.linebrk), timeout: 10000}
    ))}
    catch(err) {
      /* apparently, when called by atom, git-diff always returns exit code 1
      if diffs are found (like diff) so we have to handle output in this way */
      gitDiff = String(err.stdout) 
    }
    //console.log("Diff:\n"+gitDiff)
    var rawDiffs = []
    var newLineNumber, newStart, newLines, oldLineNumber, oldStart, oldLines
    const errMsg = "cannot interpret the following git diff output:\n"+gitDiff
    if (gitDiff != "\n" && gitDiff != '\r\n' && gitDiff != "") {
      var gitDiffLines = gitDiff.split(this.linebrk)
      if (gitDiffLines < 5) { throw errMsg }
      for (var i = 4; i < gitDiffLines.length; i++) {
        var line = gitDiffLines[i]
        if (!line) { continue }
        var startChar = line.charAt(0) 
        line = line.substr(1)+this.linebrk
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


/*    const options = {ignoreEolWhitespace: process.platform === 'win32'}
    const rawDiffs = repo.getLineDiffDetails(repo.relativize(filePath), buffer.getText(), options)*/

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
      var linesRemoved = diff.lines.removed.join(" ")
      var linesAdded = diff.lines.added.join(" ")
      var wdiff = JsDiff.diffWordsWithSpace(linesRemoved, linesAdded)
      /* adding a space before the end of the line is needed in order to allow
      diffWordsWithSpace method to keep the last word at the end of the line 
      separate from the first word at the beginning of the next line 
      (a little bit hacky; to get a cleaner solution, diffWordsWithSpace should
      be rewritten to handle newlines)*/
      for (var hunk of wdiff) {
        
        var subHunks = hunk.value.replace(this.lbRegexp, this.linebrk).split(this.linebrk)
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
