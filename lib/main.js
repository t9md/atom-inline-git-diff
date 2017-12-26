const AtomGitDiffDetailsView = require("./git-diff-details-view")

module.exports = {
  activate() {
    atom.workspace.observeTextEditors(editor => new AtomGitDiffDetailsView(editor))
  },
}
