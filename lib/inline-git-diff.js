const {CompositeDisposable, TextEditor, Point, Range} = require("atom")
const {repositoryForPath, withKeepingRelativeScrollPosition, decorateRange} = require("./utils")
const Diffs = require("./diff")

function buildEditorForRemovedDiff(grammar, diff) {
  const editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
  editor.element.classList.add("inline-git-diff-removed")
  editor.element.addEventListener("mousedown", event => {
    event.preventDefault()
    event.stopPropagation()
  })
  editor.setGrammar(grammar)
  editor.setText(diff.getRemovedText().replace(/[\r\n]$/, ""))
  return editor
}

class InlineGitDiff {
  static initClass() {
    this.inlineGitDiffByEditor = new Map()
  }

  // static refresh({shownItems, hiddenItems}) {
  //   shownItems.filter(item => {
  //     if (this.has(item)) this.get(item).refreshDiff()
  //   })
  //   hiddenItems.filter(item => {
  //     if (this.has(item)) this.get(item).refreshDiff()
  //   })
  // }

  static get(editor) {
    return this.inlineGitDiffByEditor.get(editor)
  }

  static has(editor) {
    return this.inlineGitDiffByEditor.has(editor)
  }

  static destroyAll() {
    this.inlineGitDiffByEditor.forEach(inlineDiff => inlineDiff.destroy())
    this.inlineGitDiffByEditor.clear()
    Diffs.destroyAll()
  }

  constructor(editor) {
    this.editor = editor
    this.markersByDiff = new Map()
    this.diffs = Diffs.get(editor.buffer)

    const someMarkerIntersectsWithRange = (markers, range) =>
      markers.some(marker => marker.getBufferRange().intersectsWith(range))

    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.buffer.onDidChangeText(event => {
        this.diffs.markStale()
        const {oldRange, newRange} = event
        for (const [diff, markers] of this.markersByDiff) {
          if (someMarkerIntersectsWithRange(markers, oldRange) || someMarkerIntersectsWithRange(markers, newRange)) {
            diff.invalidate()
          }
        }
      }),
      this.editor.onDidStopChanging(() => {
        this.diffs.getInvalidatedDiffs().forEach(diff => this.destroyDecorationForDiff(diff))
        this.diffs.collectIfStale()
        for (const diff of this.diffs.diffs) {
          if (!this.markersByDiff.has(diff)) this.renderDiff(diff)
        }
      })
    )
    this.constructor.inlineGitDiffByEditor.set(this.editor, this)

    this.editor.element.classList.add("has-inline-git-diff")
    this.diffs.diffs.forEach(diff => this.renderDiff(diff))
  }

  destroy() {
    this.editor.element.classList.remove("has-inline-git-diff")
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()

    this.markersByDiff.forEach(markers => markers.forEach(marker => marker.destroy()))
    this.markersByDiff.clear()

    this.disposables.dispose()
    this.constructor.inlineGitDiffByEditor.delete(this.editor)
  }

  destroyDecorationForDiff(diff) {
    if (this.markersByDiff.has(diff)) {
      this.markersByDiff.get(diff).forEach(marker => marker.destroy())
      this.markersByDiff.delete(diff)
    }
  }

  renderDiff(diff) {
    if (!this.markersByDiff.has(diff)) this.markersByDiff.set(diff, [])
    const markers = this.markersByDiff.get(diff)

    const highlight = (...args) => markers.push(decorateRange(...args))

    if (diff.lines.added.length) {
      highlight(this.editor, diff.getRange(), {type: "line", class: "inline-git-diff-added"})
    }

    if (diff.lines.removed.length) {
      const editorForRemovedDiff = buildEditorForRemovedDiff(this.editor.getGrammar(), diff)
      diff.onDidDestroy(() => editorForRemovedDiff.destroy())

      const pointToInsert = new Point(diff.startRow + (diff.kind === "modified" ? 0 : 1), 0)
      const range = [pointToInsert, pointToInsert]
      highlight(this.editor, range, {type: "block", position: "before", item: editorForRemovedDiff.element})

      if (diff.needComputeInnerLineDiff) {
        const toRange = (row, {start, length}) => Range.fromPointWithDelta([row, start], 0, length)

        for (let i = 0; i < diff.innerLineDiffs.length; i++) {
          const {added, removed} = diff.innerLineDiffs[i]
          if (added.length) {
            const range = toRange(diff.startRow + i, added)
            highlight(this.editor, range, {type: "highlight", class: "inline-git-diff-added-inner"})
          }
          if (removed.length) {
            const range = toRange(i, removed)
            highlight(editorForRemovedDiff, range, {type: "highlight", class: "inline-git-diff-removed-inner"})
          }
        }
      }
    }
  }

  copyRemovedText() {
    const diff = this.diffs.getDiffAtRow(this.editor.getCursorBufferPosition().row)
    if (diff) atom.clipboard.write(diff.getRemovedText())
  }

  revert() {
    const diff = this.diffs.getDiffAtRow(this.editor.getCursorBufferPosition().row)
    if (diff) {
      const originalPosition =
        diff.kind === "modified" && diff.needComputeInnerLineDiff ? this.editor.getCursorBufferPosition() : undefined

      this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())
      this.destroyDecorationForDiff(diff)
      if (originalPosition) this.editor.setCursorBufferPosition(originalPosition)
    }
  }
}
InlineGitDiff.initClass()

module.exports = InlineGitDiff
