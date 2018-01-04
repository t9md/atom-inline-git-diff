const GitDiffDetailsView = require("./git-diff-details-view")
const {repositoryForPath} = require("./utils")

module.exports = {
  activate() {
    this.views = new WeakMap()

    const withDiffView = (element, fn) => {
      const editor = element.getModel()
      if (repositoryForPath(editor.getPath())) {
        const diffView = this.getDiffViewForEditor(editor)
        if (diffView) fn(diffView)
      }
    }

    this.commandDisposable = atom.commands.add("atom-text-editor:not([mini])", {
      "git-diff-details:toggle-git-diff-details"() {
        withDiffView(this, diffView => diffView.toggleDiff())
      },
      "git-diff-details:revert"() {
        withDiffView(this, diffView => diffView.revert())
      },
      "git-diff-details:copy-removed-text"() {
        withDiffView(this, diffView => diffView.copyRemovedText())
      },
    })
  },

  getDiffViewForEditor(editor) {
    if (!this.views.has(editor)) {
      this.views.set(editor, new GitDiffDetailsView(editor))
    }
    return this.views.get(editor)
  },

  deactivate() {
    this.commandDisposable.dispose()
    atom.workspace.getTextEditors().forEach(editor => {
      if (this.views.has(editor)) {
        this.views.get(editor).destroy()
        this.views.delete(editor)
      }
    })
  },
}
