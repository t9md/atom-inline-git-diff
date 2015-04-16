{CompositeDisposable} = require 'atom'
# {repositoryForPath} = require './helpers'
fs = require "fs-plus"
path = require "path"

module.exports =


Mixin = require 'mixto'

module.exports = class Housekeeping extends Mixin
  initializeHousekeeping: ->
    @subscriptions = new CompositeDisposable()

    # @subscribe @editorView, 'editor:path-changed', @subscribeToBuffer
    #
    # @subscribe atom.project.getRepo(), 'statuses-changed', =>
    #   @scheduleUpdate()
    #
    # @subscribe atom.project.getRepo(), 'status-changed', (path) =>
    #   @scheduleUpdate() if path is @editor.getPath()
    #
    # @subscribeToCommand @editorView, 'git-diff-details:toggle-git-diff-details', =>
    #   @toggleShowDiffDetails()
    #
    # @subscribeToCommand @editorView, 'git-diff-details:close-git-diff-details', =>
    #   @closeDiffDetails()
    #
    # @subscribe @editorView, 'editor:will-be-removed', =>
    #   @cancelUpdate()
    #   @unsubscribe()
    #   @unsubscribeFromBuffer()
    #
    # @subscribeToBuffer()
    #
    # @subscribeToCursor()

    @subscriptions.add(@editor.onDidStopChanging(@notifyContentsModified))
    @subscriptions.add(@editor.onDidChangePath(@notifyContentsModified))

    @subscribeToRepository()
    @subscriptions.add atom.project.onDidChangePaths => @subscribeToRepository()


    @subscriptions.add @editor.onDidDestroy =>
      @cancelUpdate()
      # @removeDecorations() # taken from git-diff
      # TODO what do i need to remove at this point?
      @subscriptions.dispose()

    # editorView = atom.views.getView(@editor)

    @subscriptions.add atom.commands.add @editorView, 'git-diff-details:toggle-git-diff-details', =>
      @toggleShowDiffDetails()

    @subscriptions.add atom.commands.add @editorView, 'git-diff-details:close-git-diff-details', =>
      @closeDiffDetails()

    # OK

    # @subscriptions.add atom.config.onDidChange 'git-diff.showIconsInEditorGutter', =>
    #   @updateIconDecoration()

    # @subscriptions.add atom.config.onDidChange 'editor.showLineNumbers', =>
    #   @updateIconDecoration()

    # editorElement = atom.views.getView(@editor)
    # @subscriptions.add editorElement.onDidAttach =>
    #   @updateIconDecoration()

    # @updateIconDecoration()
    @scheduleUpdate()

  repositoryForPath: (goalPath) ->
    for directory, i in atom.project.getDirectories()
      if goalPath is directory.getPath() or directory.contains(goalPath)
        return atom.project.getRepositories()[i]
    null

  subscribeToRepository: ->
    if @repository = @repositoryForPath(@editor.getPath())
      @subscriptions.add @repository.onDidChangeStatuses =>
        @scheduleUpdate()
      @subscriptions.add @repository.onDidChangeStatus (changedPath) =>
        @scheduleUpdate() if changedPath is @editor.getPath()

  # subscribeToBuffer: =>
  #   @unsubscribeFromBuffer()
  #
  #   if @buffer = @editor.getBuffer()
  #     @scheduleUpdate()
  #     @buffer.on 'contents-modified', @notifyContentsModified

  # unsubscribeFromBuffer: ->
  #   if @buffer?
  #     @removeDecorations()
  #     @buffer.off 'contents-modified', @notifyContentsModified
  #     @buffer = null

  subscribeToCursor: ->
    @cursorSubscription?.dispose()
    @cursorSubscription = @getActiveTextEditor()?.onDidChangeCursorPosition =>
      @notifyChangeCursorPosition()


  unsubscribeFromCursor: ->
    @cursorSubscription?.dispose()
    @cursorSubscription = null

  # cancelUpdate: ->
  #   clearImmediate(@immediateId)

  # scheduleUpdate: ->
  #   @cancelUpdate()
  #   @immediateId = setImmediate(@notifyContentsModified)

  cancelUpdate: ->
    clearImmediate(@immediateId)

  scheduleUpdate: ->
    @cancelUpdate()
    @immediateId = setImmediate(@updateDiffs)
