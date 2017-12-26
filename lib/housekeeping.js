let Housekeeping
const {CompositeDisposable} = require("atom")
const fs = require("fs-plus")
const path = require("path")

const Mixin = require("mixto")

module.exports = Housekeeping = class Housekeeping extends Mixin {
  initializeHousekeeping() {
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(
      this.editor.onDidDestroy(() => {
        this.cancelUpdate()
        this.destroyDecoration()
        return this.subscriptions.dispose()
      })
    )

    if (this.repositoryForPath(this.editor.getPath())) {
      this.subscribeToRepository()

      this.subscriptions.add(this.editor.onDidStopChanging(this.notifyContentsModified))
      this.subscriptions.add(this.editor.onDidChangePath(this.notifyContentsModified))
      this.subscriptions.add(this.editor.onDidChangeCursorPosition(() => this.notifyChangeCursorPosition()))

      this.subscriptions.add(atom.project.onDidChangePaths(() => this.subscribeToRepository()))

      this.subscriptions.add(
        atom.commands.add(this.editorView, "git-diff-details:toggle-git-diff-details", () => {
          return this.toggleShowDiffDetails()
        })
      )

      this.subscriptions.add(
        atom.commands.add(this.editorView, {
          "core:close": e => this.closeDiffDetails(),
          "core:cancel": e => this.closeDiffDetails(),
        })
      )

      this.subscriptions.add(
        atom.commands.add(this.editorView, "git-diff-details:undo", e => {
          if (this.showDiffDetails) {
            return this.undo()
          } else {
            return e.abortKeyBinding()
          }
        })
      )

      this.subscriptions.add(
        atom.commands.add(this.editorView, "git-diff-details:copy", e => {
          if (this.showDiffDetails) {
            return this.copy()
          } else {
            return e.abortKeyBinding()
          }
        })
      )

      return this.scheduleUpdate()
    } else {
      // bypass all keybindings
      this.subscriptions.add(
        atom.commands.add(this.editorView, "git-diff-details:toggle-git-diff-details", e => e.abortKeyBinding())
      )

      this.subscriptions.add(atom.commands.add(this.editorView, "git-diff-details:undo", e => e.abortKeyBinding()))

      return this.subscriptions.add(
        atom.commands.add(this.editorView, "git-diff-details:copy", e => e.abortKeyBinding())
      )
    }
  }

  repositoryForPath(goalPath) {
    const iterable = atom.project.getDirectories()
    for (let i = 0; i < iterable.length; i++) {
      const directory = iterable[i]
      if (goalPath === directory.getPath() || directory.contains(goalPath)) {
        return atom.project.getRepositories()[i]
      }
    }
    return null
  }

  subscribeToRepository() {
    let repository
    if ((repository = this.repositoryForPath(this.editor.getPath()))) {
      this.subscriptions.add(
        repository.onDidChangeStatuses(() => {
          return this.scheduleUpdate()
        })
      )
      return this.subscriptions.add(
        repository.onDidChangeStatus(changedPath => {
          if (changedPath === this.editor.getPath()) {
            return this.scheduleUpdate()
          }
        })
      )
    }
  }

  unsubscribeFromCursor() {
    if (this.cursorSubscription != null) {
      this.cursorSubscription.dispose()
    }
    return (this.cursorSubscription = null)
  }

  cancelUpdate() {
    return clearImmediate(this.immediateId)
  }

  scheduleUpdate() {
    this.cancelUpdate()
    return (this.immediateId = setImmediate(this.notifyContentsModified))
  }
}
