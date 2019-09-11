const {CompositeDisposable, TextEditor, Point, Range} = require('atom')
const {repositoryForPath, withKeepingRelativeScrollPosition, decorateRange} = require('./utils')
const Diff = require('./diff')
const WHOLE_RANGE = Object.freeze([[0, 0], [Infinity], [Infinity]])
const statusBar = require('./status-bar')
const GitHistoryView = require('./git-history-view')

//https://stackoverflow.com/questions/26246601/wildcard-string-comparison-in-javascript
function matchRuleShort(str, rule) {
  var escapeRegex = (str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")
  return new RegExp("^" + rule.split("*").map(escapeRegex).join(".*") + "$").test(str)
}

function buildEditorForRemovedDiff (grammar, diff, isSoftWrapped, preferredLineLength, softWrapAtPreferredLineLength) {
  const editor = new TextEditor({
    lineNumberGutterVisible: false,
    autoHeight: true, // disable scoll on this editor
    preferredLineLength: preferredLineLength,
    softWrapAtPreferredLineLength: softWrapAtPreferredLineLength,
  })
  editor.setSoftWrapped(isSoftWrapped)
  editor.element.classList.add('inline-git-diff-removed')
  editor.element.addEventListener('mousedown', event => {
    event.preventDefault()
    event.stopPropagation()
  })
  editor.setGrammar(grammar)
  // Want to disable scroll on editorInEditor.
  // But render removed text as-is and set editor's height manually didn't work.
  // So I choose remove last new line char as upstream git-diff-details pkg did.
  // HACK: Why replace with single space instead of just removing new line by complete blank('')?
  // This is for flash highlight on `inline-git-diff:copy-removed-text` command
  // `line` type highlight does not highight completely blank line so need at least one invisible char(' ').
  const SINGLE_SPACE = ' '
  editor.setText(diff.getRemovedText().replace(/\r?\n$/, SINGLE_SPACE), '')
  return editor
}

class InlineGitDiff {
  static init () {
    this.inlineGitDiffByEditor = new Map()
  }

  static get (editor) {
    if (!repositoryForPath(editor.getPath())) return
    if (!this.inlineGitDiffByEditor.has(editor)) {
      this.inlineGitDiffByEditor.set(editor, new InlineGitDiff(editor))
    }
    return this.inlineGitDiffByEditor.get(editor)
  }

  static destroyAll () {
    this.inlineGitDiffByEditor.forEach(inlineDiff => inlineDiff.destroy())
  }

  static invoke (editor, method) {
    const gitDiff = this.get(editor)
    if (gitDiff) {
      gitDiff[method]()
    }
  }

  constructor (editor) {
    this.enabled = false
    this.editor = editor
    this.markersByDiff = new Map()
    this.editorInEditorByDiff = new Map()
    this.subscribeToRepository()
    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.onDidStopChanging(() => this.refreshDiff()),
      this.editor.onDidChangePath(() => this.refreshDiff()),
      atom.project.onDidChangePaths(() => this.subscribeToRepository())
    )
  }

  destroy () {
    this.disposables.dispose()
    if (this.repositoryDisposable) this.repositoryDisposable.dispose()
    clearImmediate(this.immediateID)

    this.destroyDecorations()
    this.editor.element.classList.remove('has-inline-git-diff')
    this.constructor.inlineGitDiffByEditor.delete(this.editor)
    this.updateStatusBar()
  }

  updateOnEnabled (enabled) {
    this.enabled = enabled
    this.editor.element.classList.toggle('has-inline-git-diff', enabled)
    this.updateStatusBar()
    this.refreshDiff()
  }

  // Return boolean to indicate action was taken or not
  toggle (enabled = !this.enabled) {

    if (enabled === this.enabled) {
      return false
    }
    if (enabled) {
      var callbackOnConfirmed = (function(){
        this.updateOnEnabled(true)
      }).bind(this)
      new GitHistoryView(this.editor, callbackOnConfirmed)
    } else {
      this.updateOnEnabled(false)
    }
    return true
  }

  enable () {
    return this.toggle(true)
  }

  disable () {
    return this.toggle(false)
  }

  updateStatusBar () {
    if (atom.workspace.getActiveTextEditor() === this.editor) {
      statusBar.update(this.editor)
    }
  }

  getDiffs () {
    if (!this.diffs) this.diffs = Diff.collect(this.editor.buffer, this.getDiffStyle())
    return this.diffs
  }

  refreshDiff () {
    // [NOTE] Invalidate cached diff even while not enabled.
    // User can invoke `revert` and `copyRemovedText` without enabling inline-git-diff.
    // So invalidate old cache to these commands always get fresh diff state.
    // Essentially `inline-git-diff` is just decoration to give user a context.
    // Thus `revert`/`copyRemovedText` ommands must work without decoration.
    this.diffs = null

    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDecorations()

      if (this.enabled) {
        this.getDiffs().forEach(diff => {
          this.markersByDiff.set(diff, this.renderDiff(diff))
        })
      }
    })
  }

  destroyDecorations () {
    this.markersByDiff.forEach(markers => markers.forEach(marker => marker.destroy()))
    this.markersByDiff.clear()
  }

  renderDiff (diff) {
    const markers = []
    if (diff.lines.added.length) {
      markers.push(decorateRange(this.editor, diff.getRange(), {type: 'highlight', class: 'inline-git-diff-added'}))
    }

    if (diff.lines.removed.length) {
      const editorInEditor = buildEditorForRemovedDiff(this.editor.getGrammar(), diff, this.editor.isSoftWrapped, this.editor.preferredLineLength, this.editor.softWrapAtPreferredLineLength)
      this.editorInEditorByDiff.set(diff, editorInEditor)
      const marker = this.renderRemovedDiffEditor(diff, editorInEditor)
      marker.onDidDestroy(() => {
        this.editorInEditorByDiff.delete(diff)
        editorInEditor.destroy()
      })
      markers.push(marker)
      switch (this.getDiffStyle()) {
        case "inner line diff":
          if (diff.needComputeInnerLineDiff) {
            markers.push(...this.renderInnerLineDiff(diff, editorInEditor))
          }
          break
        case "word diff":
          markers.push(...this.renderWordDiff(diff, editorInEditor))
          break
        case "line diff":
        default:
      }
    }
    return markers
  }

  renderRemovedDiffEditor (diff, item) {
    const point = new Point(diff.startRow + (diff.kind === 'modified' ? 0 : 1), 0)
    return decorateRange(this.editor, [point, point], {type: 'block', position: 'before', item: item})
  }

  renderInnerLineDiff (diff, editorInEditor) {
    const toRange = (row, {start, length}) => Range.fromPointWithDelta([row, start], 0, length)
    const markers = []

    for (let i = 0; i < diff.innerLineDiffs.length; i++) {
      const {added, removed} = diff.innerLineDiffs[i]
      if (added.length) {
        const range = toRange(diff.startRow + i, added)
        markers.push(decorateRange(this.editor, range, {type: 'highlight', class: 'inline-git-diff-added-inner'}))
      }
      if (removed.length) {
        const range = toRange(i, removed)
        markers.push(decorateRange(editorInEditor, range, {type: 'highlight', class: 'inline-git-diff-removed-inner'}))
      }
    }
    return markers
  }

  renderWordDiff (diff, editorInEditor) {
    const toRange = (row, {startCol, length}) => Range.fromPointWithDelta([row, startCol], 0, length)
    const markers = []

    for (let i = 0; i < diff.wdiffLines.added.length; i++) {
      for (let j = 0; j < diff.wdiffLines.added[i].hunks.length; j++) {
        if (diff.wdiffLines.added[i].hunks[j].added) {
          const range = toRange(diff.startRow + i, diff.wdiffLines.added[i].hunks[j])
          var wordDiffText = this.editor.getTextInBufferRange(range)
          var isAtLineEnd = range.end.column === this.editor.lineTextForBufferRow(range.end.row).length
          if ( wordDiffText != " " || isAtLineEnd ){ // single space wdiffs not at the end of the line are due to text hard-wrapping, do not highlight them
            markers.push(decorateRange(this.editor, range, {type: 'highlight', class: 'inline-git-diff-added-inner'}))
          }
        }
      }
    }
    for (let i = 0; i < diff.wdiffLines.removed.length; i++) {
      for (let k = 0; k < diff.wdiffLines.removed[i].hunks.length; k++) {
        if (diff.wdiffLines.removed[i].hunks[k].removed) {
          const range = toRange(i, diff.wdiffLines.removed[i].hunks[k])
          var wordDiffText = editorInEditor.getTextInBufferRange(range)
          var isAtLineEnd = range.end.column === editorInEditor.lineTextForBufferRow(range.end.row).length - (editorInEditor.getLastBufferRow() === range.end.row ? 1 : 0) // Why '- 1'? Because removed diffs have a dummy space at the end of the last line
          if ( wordDiffText != " " || isAtLineEnd ){ // single space wdiffs not at the end of the line are due to text hard-wrapping, do not highlight them
            markers.push(decorateRange(editorInEditor, range, {type: 'highlight', class: 'inline-git-diff-removed-inner'}))
          }
        }
      }
    }
    return markers
  }

  flashRange (editor, range, duration, options) {
    if (this.flashTimeoutID) {
      clearTimeout(this.flashTimeoutID)
      this.flashTimeoutID = null
      this.flashMarker.destroy()
      editor.component.updateSync()
    }

    this.flashMarker = editor.markBufferRange(range)
    editor.decorateMarker(this.flashMarker, options)
    this.flashTimeoutID = setTimeout(() => {
      this.flashTimeoutID = null
      this.flashMarker.destroy()
    }, duration)
  }

  copyRemovedText () {
    const diff = this.getClosestDiff({excludeAdd: true})
    if (diff) {
      atom.clipboard.write(diff.getRemovedText())
      if (this.editorInEditorByDiff.has(diff)) {
        const editorInEditor = this.editorInEditorByDiff.get(diff)
        this.flashRange(editorInEditor, WHOLE_RANGE, 800, {type: 'line', class: 'inline-git-diff-flash-copy'})
      }
    }
  }

  getClosestDiff ({excludeAdd} = {}) {
    const cursorRow = this.editor.getCursorBufferPosition().row
    const diffs = this.getDiffs()
    return (
      diffs.find(diff => (!excludeAdd || diff.kind !== 'added') && diff.containsRow(cursorRow)) ||
      diffs.find(diff => diff.kind === 'modified' && diff.containsRow(cursorRow + 1))
    )
  }

  revert () {
    const diff = this.getClosestDiff()
    if (diff) {
      const originalPosition =
        diff.kind === 'modified' && diff.needComputeInnerLineDiff ? this.editor.getCursorBufferPosition() : undefined

      this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())
      if (this.markersByDiff.has(diff)) {
        this.markersByDiff.get(diff).forEach(marker => marker.destroy())
        this.markersByDiff.delete(diff)
      }
      if (originalPosition) this.editor.setCursorBufferPosition(originalPosition)
    }
  }

  subscribeToRepository () {
    clearImmediate(this.immediateID)

    if (this.repositoryDisposable) this.repositoryDisposable.dispose()
    const repo = repositoryForPath(this.editor.getPath())
    if (repo) {
      this.repositoryDisposable = repo.onDidChangeStatuses(() => {
        this.immediateID = setImmediate(() => this.refreshDiff())
      })
    }
  }

  isTextFile () {
    const textGrammarArray = atom.config.get("inline-git-diff.textFileGrammarList").split(",").map(
      function(item) {
        return item.trim()
      }
    )
    const currentGrammar = this.editor.getGrammar().scopeName
    var isText = false
    for (var i = 0; i < textGrammarArray.length; i++) {
      if (matchRuleShort(currentGrammar, textGrammarArray[i])) {
        isText = true
        break
      }
    }
    return isText
  }

  getDiffStyle () {
    if (this.isTextFile()) {
      return atom.config.get("inline-git-diff.diffStyleForTextFiles")
    } else {
      return atom.config.get("inline-git-diff.diffStyleForSourceFiles")
    }
  }

}

InlineGitDiff.init()

module.exports = InlineGitDiff
