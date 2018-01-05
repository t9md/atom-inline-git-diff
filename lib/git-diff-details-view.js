const {CompositeDisposable} = require("atom")
const {repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")
const Diff = require("./diff")

module.exports = class GitDiffDetailsView {
  constructor(editor) {
    this.editor = editor
    this.enabled = false

    this.subscribeToRepository()
    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.onDidStopChanging(() => this.refreshDiff()),
      this.editor.onDidChangePath(() => this.refreshDiff()),
      atom.project.onDidChangePaths(() => this.subscribeToRepository())
    )
  }

  destroy() {
    this.editor.element.classList.remove("has-git-diff-details")
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    clearImmediate(this.immediateID)
    this.destroyDiffs()
    this.disposables.dispose()
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
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDiffs()
      if (this.enabled) {
        this.getDiffs().forEach(diff => diff.render())
      }
    })
  }

  toggleDiff() {
    this.enabled = !this.enabled
    this.editor.element.classList.toggle("has-git-diff-details", this.enabled)
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
        diff.kind === "modified" && diff.needComputeChange ? this.editor.getCursorBufferPosition() : undefined

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
