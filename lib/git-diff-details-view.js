const {Range, CompositeDisposable, TextEditor} = require("atom")
const {decorateRange, getHunks, repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")
const {RemovedDiff} = require("./removed-diff")

module.exports = class GitDiffDetailsView {
  constructor(editor) {
    this.editor = editor
    this.enabled = false
    this.markers = []
    this.removedDiffs = []

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
    if (!this.hunks) this.hunks = getHunks(this.editor)
    return this.hunks
  }

  refreshDiff() {
    this.hunks = null
    if (this.editor.isAlive() && this.enabled) this.showDiff()
  }

  showDiff() {
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDiffs()
      this.getHunks().forEach(hunk => this.display(hunk))
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
      hunk.revert(this.editor)
      this.editor.setCursorBufferPosition(point)
    }
  }

  destroyDiffs() {
    this.markers.forEach(marker => marker.destroy())
    this.markers = []

    this.removedDiffs.forEach(removedDiff => removedDiff.destroy())
    this.removedDiffs = []
  }

  display(hunk) {
    const highlight = (...args) => this.markers.push(decorateRange(...args))

    if (hunk.getAddedText()) {
      highlight(this.editor, hunk.getAddedRange(), {type: "line", class: "git-diff-details-added"})
    }

    if (hunk.getRemovedText()) {
      const removedDiff = new RemovedDiff(this.editor, hunk)
      this.removedDiffs.push(removedDiff)

      if (hunk.needComputeRelativeChange) {
        hunk.getRangesForRelativeChangeForAdded(hunk.startRow).forEach(range => {
          highlight(this.editor, range, {type: "highlight", class: "git-diff-details-added"})
        })
        hunk.getRangesForRelativeChangeForRemoved(0).forEach(range => {
          highlight(removedDiff.editor, range, {type: "highlight", class: "git-diff-details-removed"})
        })
      }
    }
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
