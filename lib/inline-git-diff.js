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
    this.diffBase = "HEAD"
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

  static setDiffBase(sha) {
    this.diffBase = sha
  }

  static getDiffBase() {
    // return "master"

    return this.diffBase
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

  async getDiffs() {
    if (!this.diffs) {
      this.diffs = await Diff.collect(this.editor.buffer, this.constructor.getDiffBase())
    }
    return this.diffs
  }

  refreshDiff() {
    withKeepingRelativeScrollPosition(this.editor, async () => {
      this.destroyDecorations()
      if (this.enabled) {
        this.diffs = null
        const diffs = await this.getDiffs()
        diffs.forEach(diff => {
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
      if (diff.hasInnerLineDiff()) {
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

  async getClosestEditorInEditor() {
    const cursorRow = this.editor.getCursorBufferPosition().row
    const diffs = await this.getDiffs()
    const diff =
      diffs.find(diff => diff.kind !== "added" && diff.containsRow(cursorRow)) ||
      diffs.find(diff => diff.kind === "modified" && diff.containsRow(cursorRow + 1))
    if (diff) {
      return this.editorInEditorByDiff.get(diff)
    }
  }

  async copyRemovedText() {
    const editorInEditor = await this.getClosestEditorInEditor()
    if (editorInEditor) {
      atom.clipboard.write(editorInEditor.getText())
      const range = editorInEditor.getBuffer().getRange()
      this.flashRange(editorInEditor, range, 800, {type: "highlight", class: "inline-git-diff-flash-copy"})
    }
  }

  async getClosestDiff() {
    const cursorRow = this.editor.getCursorBufferPosition().row
    const diffs = await this.getDiffs()
    return (
      diffs.find(diff => diff.containsRow(cursorRow)) ||
      diffs.find(diff => diff.kind === "modified" && diff.containsRow(cursorRow + 1))
    )
  }

  async revert() {
    const diff = await this.getClosestDiff()
    if (diff) {
      const originalPosition =
        diff.kind === "modified" && diff.hasInnerLineDiff() ? this.editor.getCursorBufferPosition() : undefined

      const newRange = this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())
      this.markersByDiff.get(diff).forEach(marker => marker.destroy())
      this.markersByDiff.delete(diff)

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
