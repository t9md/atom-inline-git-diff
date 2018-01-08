const {CompositeDisposable, TextEditor, Point, Range} = require("atom")
const {repositoryForPath, withKeepingRelativeScrollPosition, decorateRange} = require("./utils")
const Diff = require("./diff")

function buildEditorForRemovedDiff(grammar, diff, lineHeightInPixels) {
  const editor = new TextEditor({
    lineNumberGutterVisible: false,
    autoHeight: false,
  })
  editor.element.classList.add("inline-git-diff-removed")
  editor.element.addEventListener("mousedown", event => {
    event.preventDefault()
    event.stopPropagation()
  })
  editor.element.setHeight(lineHeightInPixels * diff.lines.removed.length)
  editor.setGrammar(grammar)
  editor.setText(diff.getRemovedText(), "")
  return editor
}

module.exports = class InlineGitDiff {
  static init() {
    this.disposables = new CompositeDisposable()
    this.inlineGitDiffByEditor = new Map()
  }

  static get(editor) {
    if (!repositoryForPath(editor.getPath())) return
    if (!this.inlineGitDiffByEditor.has(editor)) {
      this.inlineGitDiffByEditor.set(editor, new InlineGitDiff(editor))
    }
    return this.inlineGitDiffByEditor.get(editor)
  }

  static destroyAll() {
    this.disposables.dispose()
    this.inlineGitDiffByEditor.forEach(inlineDiff => inlineDiff.destroy())
  }

  constructor(editor) {
    this.enabled = false
    this.editor = editor
    this.markersByDiff = new Map()
    this.editorInEditorByDiff = new Map()
    this.subscribeToRepository()
    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.onDidStopChanging(() => this.refreshDiff()),
      this.editor.onDidChangePath(() => this.refreshDiff()),
      atom.project.onDidChangePaths(() => this.subscribeToRepository())
    )
  }

  destroy() {
    this.disposables.dispose()
    if (this.repositoryDisposable) this.repositoryDisposable.dispose()
    clearImmediate(this.immediateID)

    this.destroyDecorations()
    this.editor.element.classList.remove("has-inline-git-diff")
    this.constructor.inlineGitDiffByEditor.delete(this.editor)
  }

  toggle() {
    this.enabled = !this.enabled
    this.editor.element.classList.toggle("has-inline-git-diff", this.enabled)
    this.refreshDiff()
  }

  getDiffs() {
    if (!this.diffs) this.diffs = Diff.collect(this.editor.buffer)
    return this.diffs
  }

  refreshDiff() {
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDecorations()
      if (this.enabled) {
        this.diffs = null
        this.getDiffs().forEach(diff => {
          this.markersByDiff.set(diff, this.renderDiff(diff))
        })
      }
    })
  }

  destroyDecorations() {
    this.markersByDiff.forEach(markers => markers.forEach(marker => marker.destroy()))
    this.markersByDiff.clear()
  }

  renderDiff(diff) {
    const markers = []
    if (diff.lines.added.length) {
      markers.push(decorateRange(this.editor, diff.getRange(), {type: "highlight", class: "inline-git-diff-added"}))
    }

    if (diff.lines.removed.length) {
      const editorInEditor = buildEditorForRemovedDiff(
        this.editor.getGrammar(),
        diff,
        this.editor.getLineHeightInPixels()
      )
      this.editorInEditorByDiff.set(diff, editorInEditor)
      const marker = this.renderRemovedDiffEditor(diff, editorInEditor)
      marker.onDidDestroy(() => {
        this.editorInEditorByDiff.delete(diff)
        editorInEditor.destroy()
      })
      markers.push(marker)
      if (diff.needComputeInnerLineDiff) {
        markers.push(...this.renderInnerLineDiff(diff, editorInEditor))
      }
    }
    return markers
  }

  renderRemovedDiffEditor(diff, item) {
    const point = new Point(diff.startRow + (diff.kind === "modified" ? 0 : 1), 0)
    return decorateRange(this.editor, [point, point], {type: "block", position: "before", item: item})
  }

  renderInnerLineDiff(diff, editorInEditor) {
    const toRange = (row, {start, length}) => Range.fromPointWithDelta([row, start], 0, length)
    const markers = []

    for (let i = 0; i < diff.innerLineDiffs.length; i++) {
      const {added, removed} = diff.innerLineDiffs[i]
      if (added.length) {
        const range = toRange(diff.startRow + i, added)
        markers.push(decorateRange(this.editor, range, {type: "highlight", class: "inline-git-diff-added-inner"}))
      }
      if (removed.length) {
        const range = toRange(i, removed)
        markers.push(decorateRange(editorInEditor, range, {type: "highlight", class: "inline-git-diff-removed-inner"}))
      }
    }
    return markers
  }

  flashRange(editor, range, duration, options) {
    if (this.flashTimeoutID) {
      clearTimeout(this.flashTimeoutID)
      this.flashTimeoutID = null
      this.flashMarker.destroy()
      editor.component.updateSync()
    }

    this.flashMarker = editor.markBufferRange(range)
    editor.decorateMarker(this.flashMarker, options)
    this.flashTimeoutID = setTimeout(() => {
      this.flashTimeoutID = null
      this.flashMarker.destroy()
    }, duration)
  }

  getDiffAtCursorRow() {
    const cursorRow = this.editor.getCursorBufferPosition().row
    return this.getDiffs().find(diff => diff.containsRow(cursorRow))
  }

  copyRemovedText() {
    const diff = this.getDiffAtCursorRow()
    if (diff) {
      atom.clipboard.write(diff.getRemovedText())
      const editorInEditor = this.editorInEditorByDiff.get(diff)
      const rangeToFlash = editorInEditor.getBuffer().getRange()
      this.flashRange(editorInEditor, rangeToFlash, 800, {type: "line", class: "inline-git-diff-flash-copy"})
    }
  }

  revert() {
    const diff = this.getDiffAtCursorRow()
    if (diff) {
      const originalPosition =
        diff.kind === "modified" && diff.needComputeInnerLineDiff ? this.editor.getCursorBufferPosition() : undefined

      const newRange = this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())
      this.markersByDiff.get(diff).forEach(marker => marker.destroy())
      this.markersByDiff.delete(diff)

      // this.flashRange(this.editor, newRange, 800, {type: "line", class: "inline-git-diff-flash-revert"})

      if (originalPosition) this.editor.setCursorBufferPosition(originalPosition)
    }
  }

  subscribeToRepository() {
    clearImmediate(this.immediateID)

    if (this.repositoryDisposable) this.repositoryDisposable.dispose()
    const repo = repositoryForPath(this.editor.getPath())
    if (repo) {
      this.repositoryDisposable = repo.onDidChangeStatuses(() => {
        this.immediateID = setImmediate(() => this.refreshDiff())
      })
    }
  }
}
