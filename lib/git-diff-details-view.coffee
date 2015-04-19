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

  notifyChangeCursorPosition: ->
    if @showDiffDetails
      currentRowChanged = @updateCurrentRow()
      @updateDiffDetailsDisplay() if currentRowChanged

  attach: (position) ->
    @destroyDecoration()
    range = new Range(new Point(position - 1, 0), new Point(position - 1, 0))
    @marker = @editor.markBufferRange(range)
    @editor.decorateMarker @marker,
      type: 'overlay'
      item: this

  populate: (selectedHunk) ->
    html = @highlighter.highlightSync
      filePath: @editor.getPath()
      fileContents: selectedHunk.oldString

    html = html.replace('<pre class="editor editor-colors">', '').replace('</pre>', '')
    @contents.html(html)

  copy: (e) ->
    if @showDiffDetails
      {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)
      if selectedHunk?
        atom.clipboard.write(selectedHunk.oldString)
        @closeDiffDetails()
    else
      e.abortKeyBinding()

  undo: (e) ->
    if @showDiffDetails
      {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

      if selectedHunk? and buffer = @editor.getBuffer()
        if selectedHunk.kind is "m"
          buffer.deleteRows(selectedHunk.start - 1, selectedHunk.end - 1)
          buffer.insert([selectedHunk.start - 1, 0], selectedHunk.oldString)
        else
          buffer.insert([selectedHunk.start, 0], selectedHunk.oldString)
    else
      e.abortKeyBinding()

  getActiveTextEditor: ->
    atom.workspace.getActiveTextEditor()

  destroyDecoration: ->
    @marker?.destroy()
    @marker = null

  updateDiffDetailsDisplay:  ->
    if  @showDiffDetails
      {selectedHunk, isDifferent} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

      if selectedHunk?
        return unless isDifferent
        @attach(selectedHunk.end)
        @populate(selectedHunk)
        return

      @previousSelectedHunk = selectedHunk

    @destroyDecoration()
    return

  updateCurrentRow: ->
    newCurrentRow = @getActiveTextEditor()?.getCursorBufferPosition()?.row + 1
    if newCurrentRow != @currentRow
      @currentRow = newCurrentRow
      return true
    return false
