{Subscriber} = require 'emissary'

module.exports =
class AtomGitDiffDetailsView
  constructor: (@editorView) ->
    {@editor} = @editorView

    @subscribe @editorView, 'editor:path-changed', @subscribeToBuffer

    @subscribe atom.project.getRepo(), 'statuses-changed', =>
      @scheduleUpdate()

    @subscribe atom.project.getRepo(), 'status-changed', (path) =>
      @scheduleUpdate() if path is @editor.getPath()

    @subscribeToBuffer()

    @subscribe @editorView, 'editor:will-be-removed', =>
      @cancelUpdate()
      @unsubscribe()
      @unsubscribeFromBuffer()

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

  scheduleUpdate: ->
    @cancelUpdate()
    @immediateId = setImmediate(@notifyContentsModified)

  cancelUpdate: ->
    clearImmediate(@immediateId)

  notifyContentsModified: =>
    return if @editor.isDestroyed()
    @diffDetailsView.notifyContentsModified()

  removeDecorations: ->
