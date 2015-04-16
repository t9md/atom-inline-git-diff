AtomGitDiffDetailsView = require './git-diff-details-view'

module.exports =
  atomGitDiffDetailsView: null

  # activate: ->
  #   atom.workspaceView.eachEditorView (editorView) ->
  #     if atom.project.getRepo()? and editorView.attached and editorView.getPane()?
  #       new AtomGitDiffDetailsView(editorView)

  activate: ->
    atom.workspace.observeTextEditors (editor) ->
      # TODO pass editor directly
      # editorView = atom.views.getView(editor)
      new AtomGitDiffDetailsView(editor)
