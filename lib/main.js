const InlineGitDiff = require("./inline-git-diff")
const EventUtils = require("./event-utils")
const {repositoryForPath} = require("./utils")

module.exports = {
  activate() {
    this.views = new WeakMap()
    this.enabled = false
    this.eventUtils = new EventUtils()

    this.commandDisposable = atom.commands.add("atom-text-editor:not([mini])", {
      "inline-git-diff:toggle": () => this.toggle(),
      "inline-git-diff:revert"() {
        const gitDiff = InlineGitDiff.get(this.getModel())
        if (gitDiff) gitDiff.revert()
      },
      "inline-git-diff:copy-removed-text"() {
        const gitDiff = InlineGitDiff.get(this.getModel())
        if (gitDiff) gitDiff.copyRemovedText()
      },
    })
  },

  toggle() {
    this.enabled = !this.enabled
    if (this.enabled) {
      this.editorObserver = atom.workspace.observeTextEditors(editor => {
        if (!editor.isMini() && repositoryForPath(editor.getPath())) {
          new InlineGitDiff(editor).enable()
        }
      })
      this.paneItemObserver = this.eventUtils.onDidStopChangingVisiblePaneItems(event => {
        InlineGitDiff.refresh(event)
      })
    } else {
      this.disable()
    }
  },

  disable() {
    if (this.editorObserver) this.editorObserver.dispose()
    if (this.paneItemObserver) this.paneItemObserver.dispose()
    InlineGitDiff.destroyAll()
  },

  deactivate() {
    this.commandDisposable.dispose()
    this.disable()
  },
}
