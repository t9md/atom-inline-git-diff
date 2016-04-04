{View} = require 'atom-space-pen-views'
{Range, Point} = require 'atom'
_ = require 'underscore-plus'
DiffDetailsDataManager = require './data-manager'
Housekeeping = require './housekeeping'

module.exports = class AtomGitDiffDetailsView extends View
  Housekeeping.includeInto(this)

  @content: ->
    @div class: "git-diff-details-outer", =>
      @div class: "git-diff-details-main-panel", outlet: "mainPanel", =>
        @div class: "editor git-diff-editor", outlet: "contents"

  initialize: (@editor) ->
    @editorView = atom.views.getView(@editor)

    @initializeHousekeeping()
    @preventFocusOut()

    @diffDetailsDataManager = new DiffDetailsDataManager()
    @diffEditor = atom.workspace.buildTextEditor(lineNumberGutterVisible: false, scrollPastEnd: false)
    diffEditorElement = atom.views.getView(@diffEditor)
    @contents.html(diffEditorElement)

    @showDiffDetails = false
    @lineDiffDetails = null

    @updateCurrentRow()

  preventFocusOut: ->
    @mainPanel.on 'mousedown', () ->
      false

  getActiveTextEditor: ->
    atom.workspace.getActiveTextEditor()

  updateCurrentRow: ->
    newCurrentRow = @getActiveTextEditor()?.getCursorBufferPosition()?.row + 1
    if newCurrentRow != @currentRow
      @currentRow = newCurrentRow
      return true
    return false

  notifyContentsModified: =>
    return if @editor.isDestroyed()
    @diffDetailsDataManager.invalidate(@repositoryForPath(@editor.getPath()),
                                       @editor.getPath(),
                                       @editor.getText())
    if @showDiffDetails
      @updateDiffDetailsDisplay()

  updateDiffDetails: ->
    @diffDetailsDataManager.invalidatePreviousSelectedHunk()
    @updateCurrentRow()
    @updateDiffDetailsDisplay()

  toggleShowDiffDetails: ->
    @showDiffDetails = !@showDiffDetails
    @updateDiffDetails()

  closeDiffDetails: ->
    @showDiffDetails = false
    @updateDiffDetails()

  notifyChangeCursorPosition: ->
    if @showDiffDetails
      currentRowChanged = @updateCurrentRow()
      @updateDiffDetailsDisplay() if currentRowChanged

  copy: ->
    {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)
    if selectedHunk?
      atom.clipboard.write(selectedHunk.oldString)
      @closeDiffDetails() if atom.config.get('git-diff-details.closeAfterCopy')

  undo: ->
    {selectedHunk} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

    if selectedHunk? and buffer = @editor.getBuffer()
      if selectedHunk.kind is "m"
        buffer.setTextInRange([[selectedHunk.start - 1, 0], [selectedHunk.end, 0]], selectedHunk.oldString)
      else
        buffer.insert([selectedHunk.start, 0], selectedHunk.oldString)
      @closeDiffDetails() unless atom.config.get('git-diff-details.keepViewToggled')

  destroyDecoration: ->
    @newLinesMarker?.destroy()
    @newLinesMarker = null
    @oldBlockMarker?.destroy()
    @oldBlockMarker = null
    @oldLinesMarker?.destroy()
    @oldLinesMarker = null

  decorateLines: (editor, start, end, type) ->
    range = new Range(new Point(start, 0), new Point(end, 0))
    marker = editor.markBufferRange(range)
    editor.decorateMarker(marker, type: 'line', class: "git-diff-details-#{type}")
    marker

  display: (selectedHunk) ->
    @destroyDecoration()
    if selectedHunk.kind is "m"
      @newLinesMarker = @decorateLines(@editor, selectedHunk.start - 1, selectedHunk.end, "new")

    range = new Range(new Point(selectedHunk.end - 1, 0), new Point(selectedHunk.end - 1, 0))
    @oldBlockMarker = @editor.markBufferRange(range)
    @editor.decorateMarker(@oldBlockMarker, type: 'block', position: 'after', item: this)

    if atom.config.get('git-diff-details.enableSyntaxHighlighting')
      @diffEditor.setGrammar(@getActiveTextEditor()?.getGrammar())
    else
      @diffEditor.setGrammar(@diffEditor.grammarRegistry.grammarForScopeName("text.plain"))
    @diffEditor.setText(selectedHunk.oldString.replace(/[\r\n]+$/g, ""))
    @oldLinesMarker = @decorateLines(@diffEditor, 0, selectedHunk.oldLines.length, "old")

  updateDiffDetailsDisplay: ->
    if @showDiffDetails
      {selectedHunk, isDifferent} = @diffDetailsDataManager.getSelectedHunk(@currentRow)

      if selectedHunk?
        return unless isDifferent
        @display(selectedHunk)
        return
      else
        @closeDiffDetails() unless atom.config.get('git-diff-details.keepViewToggled')

      @previousSelectedHunk = selectedHunk

    @destroyDecoration()
    return
