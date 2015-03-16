Mixin = require 'mixto'

module.exports = class Housekeeping extends Mixin
  initializeHousekeeping: ->
    @subscribe @editorView, 'editor:path-changed', @subscribeToBuffer

    @subscribe atom.project.getRepo(), 'statuses-changed', =>
      @scheduleUpdate()

    @subscribe atom.project.getRepo(), 'status-changed', (path) =>
      @scheduleUpdate() if path is @editor.getPath()

    @subscribeToCommand @editorView, 'git-diff-details:toggle-git-diff-details', =>
      @toggleShowDiffDetails()

    @subscribeToCommand @editorView, 'git-diff-details:close-git-diff-details', =>
      @closeDiffDetails()

    @subscribe @editorView, 'editor:will-be-removed', =>
      @cancelUpdate()
      @unsubscribe()
      @unsubscribeFromBuffer()

    @subscribeToBuffer()

    @subscribeToCursor()

  subscribeToBuffer: =>
    @unsubscribeFromBuffer()

    if @buffer = @editor.getBuffer()
      @scheduleUpdate()
      @buffer.on 'contents-modified', @notifyContentsModified

  unsubscribeFromBuffer: ->
    if @buffer?
      @removeDecorations()
      @buffer.off 'contents-modified', @notifyContentsModified
      @buffer = null

  subscribeToCursor: ->
    @cursorSubscription?.dispose()
    @cursorSubscription = @getActiveTextEditor()?.onDidChangeCursorPosition =>
      @notifyChangeCursorPosition()

  unsubscribeFromCursor: ->
    @cursorSubscription?.dispose()
    @cursorSubscription = null

  scheduleUpdate: ->
    @cancelUpdate()
    @immediateId = setImmediate(@notifyContentsModified)

  cancelUpdate: ->
    clearImmediate(@immediateId)
