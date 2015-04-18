AtomGitDiffDetailsView = require './git-diff-details-view'

module.exports =
  atomGitDiffDetailsView: null

  activate: ->
    atom.workspace.observeTextEditors (editor) ->
      new AtomGitDiffDetailsView(editor)
