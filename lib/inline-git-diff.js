const {CompositeDisposable} = require("atom")
const {repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")
const Diff = require("./diff")

class InlineGitDiff {
  static initClass() {
    this.inlineGitDiffByEditor = new Map()
  }

  static refresh({shownItems, hiddenItems}) {
    shownItems.filter(item => {
      if (this.has(item)) this.get(item).refreshDiff()
    })
    hiddenItems.filter(item => {
      if (this.has(item)) this.get(item).refreshDiff()
    })
  }

  static get(editor) {
    return this.inlineGitDiffByEditor.get(editor)
  }

  static has(editor) {
    return this.inlineGitDiffByEditor.has(editor)
  }

  static destroyAll() {
    this.inlineGitDiffByEditor.forEach(inlineDiff => inlineDiff.destroy())
    this.inlineGitDiffByEditor.clear()
  }

  constructor(editor) {
    this.editor = editor
    this.subscribeToRepository()
    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.onDidStopChanging(() => this.refreshDiff()),
      this.editor.onDidChangePath(() => this.refreshDiff()),
      atom.project.onDidChangePaths(() => this.subscribeToRepository())
    )
    this.constructor.inlineGitDiffByEditor.set(this.editor, this)
  }

  destroy() {
    this.editor.element.classList.remove("has-inline-git-diff")
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    clearImmediate(this.immediateID)
    this.destroyDiffs()
    this.disposables.dispose()
    this.constructor.inlineGitDiffByEditor.delete(this.editor)
  }

  getDiffs() {
    if (!this.diffs) this.diffs = Diff.collect(this.editor)
    return this.diffs
  }

  destroyDiffs() {
    if (this.diffs) this.diffs.forEach(diff => diff.destroy())
    this.diffs = null
  }

  refreshDiff() {
    this.destroyDiffs()
    this.getDiffs().forEach(diff => diff.render())
  }

  enable() {
    this.editor.element.classList.add("has-inline-git-diff")
    this.refreshDiff()
  }

  getDiffAtCursorRow() {
    const row = this.editor.getCursorBufferPosition().row
    return this.getDiffs().find(diff => diff.containsRow(row))
  }

  copyRemovedText() {
    const diff = this.getDiffAtCursorRow()
    if (diff) atom.clipboard.write(diff.getRemovedText())
  }

  revert() {
    const diff = this.getDiffAtCursorRow()
    if (diff) {
      const originalPosition =
        diff.kind === "modified" && diff.needComputeInnerLineDiff ? this.editor.getCursorBufferPosition() : undefined

      this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())
      diff.destroy()
      this.diffs.splice(this.diffs.indexOf(diff), 1)

      if (originalPosition) this.editor.setCursorBufferPosition(originalPosition)
    }
  }

  subscribeToRepository() {
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    const repo = repositoryForPath(this.editor.getPath())
    if (repo) {
      this.repositoryDisposables = new CompositeDisposable(
        repo.onDidChangeStatuses(() => this.scheduleUpdate()),
        repo.onDidChangeStatus(changedPath => {
          if (changedPath === this.editor.getPath()) this.scheduleUpdate()
        })
      )
    }
  }

  scheduleUpdate() {
    clearImmediate(this.immediateID)
    this.immediateID = setImmediate(() => this.refreshDiff())
  }
}
InlineGitDiff.initClass()

module.exports = InlineGitDiff
