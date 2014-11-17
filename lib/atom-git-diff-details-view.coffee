{View} = require 'atom'
DiffDetailsDataManager = require './diff-details-data-manager'
Highlights = require 'highlights'

module.exports =
class AtomGitDiffDetailsView extends View

  @content: ->
    @div class: "diff-details-outer", =>
      @div class: "diff-details-main-panel", outlet: "mainPanel", =>
        @div class: "diff-details-main-panel-contents", outlet: "contents"
      @div class: "diff-details-button-panel", outlet: "buttonPanel", =>
        @button class: 'btn btn-primary inline-block-tight', click: "copy", 'Copy'
        @button class: 'btn btn-error inline-block-tight', click: "undo", 'Undo'

  constructor: (@editorView) ->
    {@editor} = @editorView

    @subscribe @editorView, 'editor:path-changed', @subscribeToBuffer

    @subscribe atom.project.getRepo(), 'statuses-changed', =>
      @scheduleUpdate()

    @subscribe atom.project.getRepo(), 'status-changed', (path) =>
      @scheduleUpdate() if path is @editor.getPath()

    @subscribeToCommand @editorView, 'git-diff:toggle-diff-details', =>
      @toggleShowDiffDetails()

    @subscribe @editorView, 'editor:will-be-removed', =>
      @cancelUpdate()
      @unsubscribe()
      @unsubscribeFromBuffer()

    @subscribeToBuffer()
    @subscribeToCursor()

    # Prevent focusout event
    @buttonPanel.on 'mousedown', () ->
      false

    @mainPanel.on 'mousedown', () ->
      false

    @highlighter = new Highlights()
    @diffDetailsDataManager = new DiffDetailsDataManager()

    @showDiffDetails = false
    @lineDiffDetails = null

    @updateCurrentRow()

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

  notifyContentsModified: ->
    return if @editor.isDestroyed()
    @diffDetailsDataManager.invalidate(atom.project.getRepo(),
                                       @buffer.getPath(),
                                       @buffer.getText())
    if @showDiffDetails
      @updateDiffDetailsDisplay()

  toggleShowDiffDetails: ->
    @showDiffDetails = !@showDiffDetails
    @updateCurrentRow()
    @updateDiffDetailsDisplay()

  removeDecorations: ->

  notifyChangeCursorPosition: ->
    if @showDiffDetails
      currentRowChanged = @updateCurrentRow()
      @updateDiffDetailsDisplay() if currentRowChanged

  attach: ->
    @editorView.appendToLinesView(this)

  setPosition: (top) ->
    {left, top} = @editorView.pixelPositionForBufferPosition(row: top - 1, col: 0)
    @css(top: top + @editorView.lineHeight)

  populate: (selectedHunk) ->
    html = @highlighter.highlightSync
      fileContents: selectedHunk.oldString
      scopeName: 'source.coffee'

    html = html.replace('<pre class="editor editor-colors">', '').replace('</pre>', '')
    @contents.html(html)
    @contents.css(height: selectedHunk.oldLines.length * @editorView.lineHeight)

  copy: (e) ->
    console.log "copy"

  undo: (e) ->
    selectedHunk = @diffDetailsDataManager.getSelectedHunk(@currentRow)

    if buffer = @editor.getBuffer()
      if selectedHunk.kind is "m"
        buffer.deleteRows(selectedHunk.start - 1, selectedHunk.end - 1)
        buffer.insert([selectedHunk.start - 1, 0], selectedHunk.oldString)
      else
        buffer.insert([selectedHunk.start, 0], selectedHunk.oldString)

  getActiveTextEditor: ->
    atom.workspace.getActiveTextEditor()

  updateDiffDetailsDisplay: ->
    if @showDiffDetails
      selectedHunk = @diffDetailsDataManager.getSelectedHunk(@currentRow)

      if selectedHunk?
        @attach()
        @setPosition(selectedHunk.end)
        @populate(selectedHunk)
        return

    @detach()
    return

  updateCurrentRow: ->
    newCurrentRow = @getActiveTextEditor()?.getCursorBufferPosition()?.row + 1
    if newCurrentRow != @currentRow
      @currentRow = newCurrentRow
      return true
    return false
