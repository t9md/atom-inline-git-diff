const {View} = require("atom-space-pen-views")
const {Range, Point, CompositeDisposable, TextEditor} = require("atom")
const _ = require("underscore-plus")

const {decorateRange, getLineDiffDetails, repositoryForPath} = require("./utils")

const getConfig = param => atom.config.get(`git-diff-details.${param}`)

module.exports = class GitDiffDetailsView extends View {
  static content() {
    return this.div({class: "git-diff-details-outer"}, () => {
      return this.div({class: "git-diff-details-main-panel", outlet: "mainPanel"}, () => {
        return this.div({class: "editor git-diff-editor", outlet: "contents"})
      })
    })
  }

  initialize(editor) {
    this.editor = editor
    this.showDiffDetails = false

    this.disposables = new CompositeDisposable(this.editor.onDidDestroy(() => this.destroy()))

    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.disposables.add(
        this.editor.onDidStopChanging(() => this.notifyContentsModified()),
        this.editor.onDidChangePath(() => this.notifyContentsModified()),
        this.editor.onDidChangeCursorPosition(event => {
          if (this.showDiffDetails && event.oldBufferPosition.row !== event.newBufferPosition.row) {
            this.showDiff()
          }
        }),
        atom.project.onDidChangePaths(() => this.subscribeToRepository()),
        this.registerCommands()
      )
    }

    this.mainPanel.on("mousedown", () => false) // avoid focus taken by embedded diffEditor
    this.diffEditor = this.buildDiffEditor()
    this.contents.html(this.diffEditor.element)
    this.markers = []
  }

  destroy() {
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    this.cancelUpdate()
    this.destroyDecorations()
    this.disposables.dispose()
  }

  buildDiffEditor() {
    const editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    editor.decorateMarker(editor.getLastCursor().getMarker(), {type: "cursor", style: {visibility: "hidden"}})
    editor.setGrammar(this.editor.getGrammar())
    return editor
  }

  registerCommands() {
    return atom.commands.add(this.editor.element, {
      "git-diff-details:toggle-git-diff-details": () => this.toggleDiff(),
      "core:close": event => this.hideDiff(),
      "core:cancel": event => this.hideDiff(),
      "git-diff-details:undo": event => {
        if (this.showDiffDetails) this.undo()
        else event.abortKeyBinding()
      },
      "git-diff-details:copy": event => {
        if (this.showDiffDetails) this.copy()
        else event.abortKeyBinding()
        this.scheduleUpdate()
      },
    })
  }

  getHunkAtCursorRow() {
    if (!this.lineDiffDetails) this.lineDiffDetails = getLineDiffDetails(this.editor)
    if (this.lineDiffDetails) {
      const line = this.editor.getCursorBufferPosition().row + 1
      return this.lineDiffDetails.find(hunk => hunk.start <= line && line <= hunk.end)
    }
  }

  notifyContentsModified() {
    this.lineDiffDetails = null
    if (this.editor.isAlive() && this.showDiffDetails) {
      this.showDiff()
    }
  }

  copy() {
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      atom.clipboard.write(hunk.oldString)
      if (getConfig("closeAfterCopy")) this.hideDiff()
    }
  }

  undo() {
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      const rangeToSetText =
        hunk.kind === "m" ? [[hunk.start - 1, 0], [hunk.end, 0]] : [[hunk.start, 0], [hunk.start, 0]]
      this.editor.setTextInBufferRange(rangeToSetText, hunk.oldString)
      if (!getConfig("keepViewToggled")) this.hideDiff()
    }
  }

  destroyDecorations() {
    this.markers.forEach(marker => marker.destroy())
    this.markers = []
  }

  // kind is 'old' or 'new'
  decorateLines(editor, start, end, kind) {
    const flatOrHighlight = getConfig("enableSyntaxHighlighting") ? "highlighted" : "flat"
    const decorationOptions = {type: "line", class: `git-diff-details-${kind}-${flatOrHighlight}`}
    const marker = decorateRange(editor, [[start, 0], [end, 0]], decorationOptions)
    this.markers.push(marker)
  }

  // kind is 'old' or 'new'
  decorateWords(editor, start, words, kind) {
    if (!words) return

    const flatOrHighlight = getConfig("enableSyntaxHighlighting") ? "highlighted" : "flat"
    const decorationOptions = {type: "highlight", class: `git-diff-details-${kind}-${flatOrHighlight}`}
    for (let word of words.filter(word => word.changed)) {
      const row = start + word.offsetRow
      const range = [[row, word.startCol], [row, word.endCol]]
      this.markers.push(decorateRange(editor, range, decorationOptions))
    }
  }

  display(hunk) {
    this.destroyDecorations()
    this.displayedHunk = hunk

    const flatOrHighlight = getConfig("enableSyntaxHighlighting") ? "highlighted" : "flat"

    // host editor
    {
      if (hunk.kind === "m") {
        this.decorateLines(this.editor, hunk.start - 1, hunk.end, "new")
        if (getConfig("showWordDiffs")) this.decorateWords(this.editor, hunk.start - 1, hunk.newWords, "new")
      }
    }

    // embedded diff-editor
    {
      this.diffEditor.setText(hunk.oldString.replace(/[\r\n]+$/g, ""))
      this.decorateLines(this.diffEditor, 0, hunk.oldLines.length, "old")
      if (getConfig("showWordDiffs")) this.decorateWords(this.diffEditor, 0, hunk.oldWords, "old")
    }

    // embeded diffEditor to host-editor as block-decoration
    const point = [hunk.end - 1, 0]
    this.markers.push(decorateRange(this.editor, [point, point], {type: "block", position: "after", item: this}))
  }

  showDiff() {
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      if (this.displayedHunk !== hunk) this.display(hunk)
    } else {
      this.hideDiff(getConfig("keepViewToggled"))
    }
  }

  hideDiff(once) {
    if (!once) this.showDiffDetails = false
    this.displayedHunk = null
    this.destroyDecorations()
  }

  toggleDiff() {
    this.showDiffDetails = !this.showDiffDetails
    if (this.showDiffDetails) {
      this.showDiff()
    } else {
      this.hideDiff()
    }
  }

  subscribeToRepository() {
    if (this.repositoryDisposables) {
      this.repositoryDisposables.dispose()
      this.repositoryDisposables = null
    }
    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.repositoryDisposables = new CompositeDisposable(
        repository.onDidChangeStatuses(() => this.scheduleUpdate()),
        repository.onDidChangeStatus(changedPath => {
          if (changedPath === this.editor.getPath()) this.scheduleUpdate()
        })
      )
    }
  }

  cancelUpdate() {
    clearImmediate(this.immediateId)
  }

  scheduleUpdate() {
    this.cancelUpdate()
    this.immediateId = setImmediate(() => this.notifyContentsModified())
  }
}
