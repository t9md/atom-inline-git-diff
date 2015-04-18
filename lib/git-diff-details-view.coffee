{View} = require 'atom-space-pen-views'
{Range, Point} = require 'atom'
Highlights = require 'highlights'
DiffDetailsDataManager = require './data-manager'
Housekeeping = require './housekeeping'

module.exports = class AtomGitDiffDetailsView extends View
  Housekeeping.includeInto(this)

  @content: ->
    @div class: "git-diff-details-outer", =>
      @div class: "git-diff-details-main-panel", outlet: "mainPanel", =>
        @div class: "editor", outlet: "contents"
      @div class: "git-diff-details-button-panel", outlet: "buttonPanel", =>
        @button class: 'btn btn-primary inline-block-tight', click: "copy", 'Copy'
        @button class: 'btn btn-error inline-block-tight', click: "undo", 'Undo'

  initialize: (@editor) ->
    @editorView = atom.views.getView(@editor)

    @initializeHousekeeping()
    @preventFocusOut()

    @highlighter = new Highlights()
    @diffDetailsDataManager = new DiffDetailsDataManager()

    @showDiffDetails = false
    @lineDiffDetails = null

    @updateCurrentRow()

  preventFocusOut: ->
    @buttonPanel.on 'mousedown', () ->
      false

    @mainPanel.on 'mousedown', () ->
      false

  notifyContentsModified: =>
    return if @editor.isDestroyed()
    @diffDetailsDataManager.invalidate(@repositoryForPath(@editor.getPath()),
                                       @editor.getPath(),
                                       @editor.getText())
    if @showDiffDetails
      @updateDiffDetailsDisplay()

  toggleShowDiffDetails: ->
    @showDiffDetails = !@showDiffDetails
    @updateDiffDetails()

  closeDiffDetails: (e) ->
    if @showDiffDetails
      @showDiffDetails = false
      @updateDiffDetails()
    else
      e.abortKeyBinding()

  updateDiffDetails: ->
    @diffDetailsDataManager.invalidatePreviousSelectedHunk()
    @updateCurrentRow()
    @updateDiffDetailsDisplay()

  removeDecorations: ->

  notifyChangeCursorPosition: ->
    if @showDiffDetails
      currentRowChanged = @updateCurrentRow()
      @updateDiffDetailsDisplay() if currentRowChanged

  attach: (position) ->
    range = new Range(new Point(position - 1, 0), new Point(position - 1, 0))
    @marker = @editor.markBufferRange(range)
    @decoration = @editor.decorateMarker @marker,
      type: 'overlay'
      item: this

  setPosition: (top) ->
    {left, top} = @editorView.pixelPositionForBufferPosition(row: top - 1, col: 0)
    @css(top: top + @editorView.lineHeight)

  populate: (selectedHunk) ->
    html = @highlighter.highlightSync
      filePath: @editor.getPath()
      fileContents: selectedHunk.oldString

    html = html.replace('<pre class="editor editor-colors">', '').replace('</pre>', '')
    @contents.html(html)
    @contents.css(height: selectedHunk.oldLines.length * @editorView.lineHeight)

  copy: (e) ->
    {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)
    atom.clipboard.write(selectedHunk.oldString)
    @closeDiffDetails()

  undo: (e) ->
    if @showDiffDetails
      {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

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
      {selectedHunk, isDifferent} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

      if selectedHunk?
        return unless isDifferent
        @attach(selectedHunk.end)
        @setPosition(selectedHunk.end)
        @populate(selectedHunk)
        return

      @previousSelectedHunk = selectedHunk

    @decoration?.destroy()
    @marker?.destroy()
    return

  updateCurrentRow: ->
    newCurrentRow = @getActiveTextEditor()?.getCursorBufferPosition()?.row + 1
    if newCurrentRow != @currentRow
      @currentRow = newCurrentRow
      return true
    return false
