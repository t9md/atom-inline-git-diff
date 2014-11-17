AtomGitDiffDetailsView = require './atom-git-diff-details-view'

module.exports =
  atomGitDiffDetailsView: null

  activate: (state) ->
    @atomGitDiffDetailsView = new AtomGitDiffDetailsView(state.atomGitDiffDetailsViewState)

  deactivate: ->
    @atomGitDiffDetailsView.destroy()

  serialize: ->
    atomGitDiffDetailsViewState: @atomGitDiffDetailsView.serialize()
