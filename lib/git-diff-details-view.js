const {Range, CompositeDisposable} = require("atom")
const {decorateRange, repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")
const Diff = require("./diff")

module.exports = class GitDiffDetailsView {
  constructor(editor) {
    this.editor = editor
    this.enabled = false

    this.disposables = new CompositeDisposable(this.editor.onDidDestroy(() => this.destroy()))

    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.disposables.add(
        this.editor.onDidStopChanging(() => this.refreshDiff()),
        this.editor.onDidChangePath(() => this.refreshDiff()),
        atom.project.onDidChangePaths(() => this.subscribeToRepository()),
        atom.commands.add(this.editor.element, {
          "git-diff-details:toggle-git-diff-details": () => this.toggleDiff(),
          "core:close": () => this.hideDiff(),
          "core:cancel": () => this.hideDiff(),
          "git-diff-details:revert": () => this.revert(),
          "git-diff-details:undo": () => this.revert(),
          "git-diff-details:copy": () => this.copy(),
        })
      )
    }
  }

  destroy() {
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    clearImmediate(this.immediateId)
    this.destroyDiffs()
    this.disposables.dispose()
  }

  getHunkAtCursorRow() {
    const cursorRow = this.editor.getCursorBufferPosition().row
    return this.getHunks().find(hunk => hunk.containsRow(cursorRow))
  }

  getHunks() {
    if (!this.hunks) this.hunks = Diff.collect(this.editor)
    return this.hunks
  }

  refreshDiff() {
    if (this.editor.isAlive() && this.enabled) this.showDiff()
  }

  showDiff() {
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDiffs()
      this.getHunks().forEach(hunk => hunk.render())
    })
  }

  hideDiff() {
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDiffs()
    })
  }

  copy() {
    const hunk = this.getHunkAtCursorRow()
    if (hunk) atom.clipboard.write(hunk.getRemovedText())
  }

  // actually not undo, this is revert
  revert() {
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      const point = this.editor.getCursorBufferPosition()
      const marker = this.editor.markBufferPosition(point)

      hunk.revert()
      this.destroyHunk(hunk)

      if (hunk.kind === "modified" && hunk.needComputeRelativeChange) {
        this.editor.setCursorBufferPosition(point)
      }
      marker.destroy()
    }
  }

  destroyHunk(hunk) {
    hunk.destroy()
    if (this.hunks) {
      const index = this.hunks.indexOf(hunk)
      if (index >= 0) this.hunks.splice(index, 1)
    }
  }

  destroyDiffs() {
    if (this.hunks) this.hunks.forEach(hunk => hunk.destroy())
    this.hunks = null
  }

  toggleDiff() {
    this.enabled = !this.enabled
    if (this.enabled) {
      this.showDiff()
    } else {
      this.hideDiff()
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
    clearImmediate(this.immediateId)
    this.immediateId = setImmediate(() => this.refreshDiff())
  }
}
