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
    const cursorRow = this.editor.getCursorBufferPosition().row
    return this.getDiffs().find(diff => diff.containsRow(cursorRow))
  }

  copyRemovedText() {
    const diff = this.getDiffAtCursorRow()
    if (diff) atom.clipboard.write(diff.getRemovedText())
  }

  revert() {
    const diff = this.getDiffAtCursorRow()
    if (diff) {
      const point = this.editor.getCursorBufferPosition()
      const marker = this.editor.markBufferPosition(point)

      diff.revert()
      diff.destroy()
      const index = this.diffs.indexOf(diff)
      if (index >= 0) this.diffs.splice(index, 1)

      if (diff.kind === "modified" && diff.needComputeChange) {
        this.editor.setCursorBufferPosition(point)
      }
      marker.destroy()
    }
  }

  subscribeToRepository() {
    if (this.repositoryDisposables) {
      this.repositoryDisposables.dispose()
      this.repositoryDisposables = null
    }
    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.repositoryDisposables = new CompositeDisposable(
        repository.onDidChangeStatuses(() => this.scheduleUpdate()),
        repository.onDidChangeStatus(changedPath => {
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
