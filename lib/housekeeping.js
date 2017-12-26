const {CompositeDisposable} = require("atom")
const Mixin = require("mixto")

module.exports = class Housekeeping extends Mixin {
  initializeHousekeeping() {
    this.subscriptions = new CompositeDisposable(
      this.editor.onDidDestroy(() => {
        this.cancelUpdate()
        this.destroyDecoration()
        this.subscriptions.dispose()
      })
    )
    const repository = this.repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.subscriptions.add(
        this.editor.onDidStopChanging(this.notifyContentsModified),
        this.editor.onDidChangePath(this.notifyContentsModified),
        this.editor.onDidChangeCursorPosition(() => this.notifyChangeCursorPosition()),
        atom.project.onDidChangePaths(() => this.subscribeToRepository()),
        this.registerCommands()
      )
    }
  }

  registerCommands() {
    return atom.commands.add(this.editor.element, {
      "git-diff-details:toggle-git-diff-details": () => this.toggleShowDiffDetails(),
      "core:close": event => this.closeDiffDetails(),
      "core:cancel": event => this.closeDiffDetails(),
      "git-diff-details:undo": event => {
        if (this.showDiffDetails) this.undo()
        else event.abortKeyBinding()
      },
      "git-diff-details:copy": event => {
        if (this.showDiffDetails) this.copy()
        else event.abortKeyBinding()
        this.scheduleUpdate()
      },
    })
  }

  repositoryForPath(goalPath) {
    let i = 0
    for (const directory of atom.project.getDirectories()) {
      if (goalPath === directory.getPath() || directory.contains(goalPath)) {
        return atom.project.getRepositories()[i]
      }
      i++
    }
  }

  subscribeToRepository() {
    const repository = this.repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscriptions.add(
        repository.onDidChangeStatuses(() => this.scheduleUpdate()),
        repository.onDidChangeStatus(changedPath => changedPath === this.editor.getPath() && this.scheduleUpdate())
      )
    }
  }

  cancelUpdate() {
    clearImmediate(this.immediateId)
  }

  scheduleUpdate() {
    this.cancelUpdate()
    this.immediateId = setImmediate(this.notifyContentsModified)
  }
}
