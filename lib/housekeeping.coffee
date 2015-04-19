{CompositeDisposable} = require 'atom'
fs = require "fs-plus"
path = require "path"

Mixin = require 'mixto'

module.exports = class Housekeeping extends Mixin
  initializeHousekeeping: ->
    if repository = @repositoryForPath(@editor.getPath())
      @subscriptions = new CompositeDisposable()
      @subscribeToRepository(repository)

      @subscriptions.add(@editor.onDidStopChanging(@notifyContentsModified))
      @subscriptions.add(@editor.onDidChangePath(@notifyContentsModified))
      @subscriptions.add(@editor.onDidChangeCursorPosition(=> @notifyChangeCursorPosition()))

      @subscriptions.add atom.project.onDidChangePaths => @subscribeToRepository()

      @subscriptions.add @editor.onDidDestroy =>
        @cancelUpdate()
        # @removeDecorations() # taken from git-diff
        # TODO do i have to clean up something?
        @subscriptions.dispose()

      @subscriptions.add atom.commands.add "atom-text-editor", 'git-diff-details:toggle-git-diff-details', =>
        @toggleShowDiffDetails()

      @subscriptions.add atom.commands.add "atom-text-editor", 'git-diff-details:close-git-diff-details', (e) =>
        @closeDiffDetails(e)

      @subscriptions.add atom.commands.add "atom-text-editor", 'git-diff-details:undo', (e) =>
        @undo()

      @scheduleUpdate()

  repositoryForPath: (goalPath) ->
    for directory, i in atom.project.getDirectories()
      if goalPath is directory.getPath() or directory.contains(goalPath)
        return atom.project.getRepositories()[i]
    null

  subscribeToRepository: (repository) ->
    @subscriptions.add repository.onDidChangeStatuses =>
      @scheduleUpdate()
    @subscriptions.add repository.onDidChangeStatus (changedPath) =>
      @scheduleUpdate() if changedPath is @editor.getPath()

  unsubscribeFromCursor: ->
    @cursorSubscription?.dispose()
    @cursorSubscription = null

  cancelUpdate: ->
    clearImmediate(@immediateId)

  scheduleUpdate: ->
    @cancelUpdate()
    @immediateId = setImmediate(@notifyContentsModified)
