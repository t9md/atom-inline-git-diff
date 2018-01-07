const {Range, Point, CompositeDisposable, Emitter} = require("atom")
const {repositoryForPath} = require("./utils")

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

class Diff {
  constructor(startRow, oldLines, newLines) {
    this.startRow = startRow
    this.lines = {added: [], removed: []}
    this.needComputeInnerLineDiff = newLines === oldLines
    this.valid = true
    this.emitter = new Emitter()

    if (oldLines === 0 && newLines > 0) {
      this.kind = "added"
      this.endRow = startRow + newLines - 1
    } else if (newLines === 0 && oldLines > 0) {
      this.kind = "removed"
      this.endRow = startRow + 1 // HACK endRow is just used to detect hunk at cursor when cursor is at line above or below
    } else {
      this.kind = "modified"
      this.endRow = startRow + newLines - 1
    }
  }

  invalidate() {
    this.valid = false
  }

  isValid() {
    return this.valid
  }

  onDidDestroy(fn) {
    this.emitter.on("did-destroy", fn)
  }

  destroy() {
    this.emitter.emit("did-destroy")
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

class Diffs {
  static initClass() {
    this.diffsByBuffer = new Map()
  }
  static get(buffer) {
    if (!this.has(buffer)) this.set(buffer, new this(buffer))
    return this.diffsByBuffer.get(buffer)
  }
  static has(buffer) {
    this.diffsByBuffer.has(buffer)
  }
  static delete(buffer) {
    this.diffsByBuffer.delete(buffer)
  }
  static set(buffer, diffs) {
    this.diffsByBuffer.set(buffer, diffs)
  }
  static destroyAll() {
    this.diffsByBuffer.forEach(diffs => diffs.destroy())
    this.diffsByBuffer.clear()
  }

  constructor(buffer) {
    this.stale = true
    this.buffer = buffer
    this.disposables = new CompositeDisposable(buffer.onDidDestroy(() => this.destroy()))
    this.diffs = this.collect()
  }

  markStale() {
    this.stale = true
  }

  destroy() {
    this.disposables.dispose()
    this.constructor.delete(this.buffer)
  }

  getInvalidatedDiffs() {
    return this.diffs.filter(diff => !diff.isValid())
  }

  getDiffAtRow(row) {
    return this.diffs.find(diff => diff.containsRow(row))
  }

  collectIfStale() {
    if (this.stale) {
      this.diffs.filter(diff => !diff.isValid()).forEach(diff => diff.destroy())
      this.diffs = this.collect(this.diffs.filter(diff => diff.isValid()))
    }
  }

  collect(existingDiffs = []) {
    this.stale = false
    const filePath = this.buffer.getPath()
    const repo = repositoryForPath(filePath).getRepo()
    const options = {ignoreEolWhitespace: process.platform === "win32"}
    const rawDiffs = repo.getLineDiffDetails(repo.relativize(filePath), this.buffer.getText(), options)

    const diffs = []
    if (!rawDiffs) return diffs

    let diff
    for (const {newStart, oldLines, newLines, newLineNumber, line} of rawDiffs) {
      const startRow = newStart - 1
      if (existingDiffs.find(diff => diff.startRow === startRow)) {
        continue
      }

      if (!diff || startRow !== diff.startRow) {
        diff = new Diff(startRow, oldLines, newLines)
        diffs.push(diff)
      }
      diff.lines[newLineNumber >= 0 ? "added" : "removed"].push(line)
    }

    for (const diff of diffs.filter(diff => diff.needComputeInnerLineDiff)) {
      diff.innerLineDiffs = []
      for (let i = 0; i < diff.lines.added.length; i++) {
        const [rangeA, rangeB] = computeChangeBetweenTwoText(diff.lines.added[i], diff.lines.removed[i])
        diff.innerLineDiffs.push({added: rangeA, removed: rangeB})
      }
    }
    return diffs.concat(existingDiffs)
  }
}
Diffs.initClass()
module.exports = Diffs
