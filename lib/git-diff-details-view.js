const {View} = require("atom-space-pen-views")
const {Range, Point, CompositeDisposable, TextEditor} = require("atom")
const _ = require("underscore-plus")
const DiffDetailsDataManager = require("./data-manager")

function repositoryForPath(goalPath) {
  let i = 0
  for (const directory of atom.project.getDirectories()) {
    if (goalPath === directory.getPath() || directory.contains(goalPath)) {
      return atom.project.getRepositories()[i]
    }
    i++
  }
}

// return marker
function decorateRange(editor, range, decorationOptions) {
  const marker = editor.markBufferRange(range)
  editor.decorateMarker(marker, decorationOptions)
  return marker
}

function getConfig(param) {
  return atom.config.get(`git-diff-details.${param}`)
}

module.exports = class GitDiffDetailsView extends View {
  static content() {
    return this.div({class: "git-diff-details-outer"}, () => {
      return this.div({class: "git-diff-details-main-panel", outlet: "mainPanel"}, () => {
        return this.div({class: "editor git-diff-editor", outlet: "contents"})
      })
    })
  }

  destroy() {
    if (this.repositoryDisposables) {
      this.repositoryDisposables.dispose()
    }
    this.cancelUpdate()
    this.destroyDecorations()
    this.disposables.dispose()
  }

  initialize(editor) {
    this.editor = editor
    this.diffDetailsDataManager = new DiffDetailsDataManager()

    this.disposables = new CompositeDisposable(this.editor.onDidDestroy(() => this.destroy()))

    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.disposables.add(
        this.editor.onDidStopChanging(() => this.notifyContentsModified()),
        this.editor.onDidChangePath(() => this.notifyContentsModified()),
        this.observeCursorMove(),
        atom.project.onDidChangePaths(() => this.subscribeToRepository()),
        this.registerCommands()
      )
    }

    // avoid focus taken by embedded diffEditor
    this.mainPanel.on("mousedown", () => false)
    this.diffEditor = this.buildDiffEditor()
    this.contents.html(this.diffEditor.element)

    this.markers = []

    this.showDiffDetails = false
    this.lineDiffDetails = null
  }

  buildDiffEditor() {
    const editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    editor.decorateMarker(editor.getLastCursor().getMarker(), {type: "cursor", style: {visibility: "hidden"}})
    editor.setGrammar(this.editor.getGrammar())
    return editor
  }

  observeCursorMove() {
    return this.editor.onDidChangeCursorPosition(event => {
      if (this.showDiffDetails && event.oldBufferPosition.row !== event.newBufferPosition.row) {
        this.updateDiffDetailsDisplay()
      }
    })
  }

  getHunkAtCursorRow() {
    const lineNumber = this.editor.getCursorBufferPosition().row + 1
    return this.diffDetailsDataManager.getSelectedHunk(lineNumber)
  }

  notifyContentsModified() {
    if (this.editor.isDestroyed()) return

    this.diffDetailsDataManager.invalidate(
      repositoryForPath(this.editor.getPath()),
      this.editor.getPath(),
      this.editor.getText()
    )
    if (this.showDiffDetails) this.updateDiffDetailsDisplay()
  }

  updateDiffDetails() {
    this.diffDetailsDataManager.invalidatePreviousSelectedHunk()
    this.updateDiffDetailsDisplay()
  }

  closeDiffDetails() {
    this.showDiffDetails = false
    this.diffDetailsDataManager.invalidatePreviousSelectedHunk()
    this.updateDiffDetailsDisplay()
  }

  copy() {
    const {selectedHunk} = this.getHunkAtCursorRow()
    if (selectedHunk) {
      atom.clipboard.write(selectedHunk.oldString)
      if (getConfig("closeAfterCopy")) {
        this.closeDiffDetails()
      }
    }
  }

  undo() {
    const {selectedHunk} = this.getHunkAtCursorRow()
    if (selectedHunk) {
      const rangeToSetText =
        selectedHunk.kind === "m"
          ? [[selectedHunk.start - 1, 0], [selectedHunk.end, 0]]
          : [[selectedHunk.start, 0], [selectedHunk.start, 0]]
      this.editor.setTextInBufferRange(rangeToSetText, selectedHunk.oldString)
      if (!getConfig("keepViewToggled")) {
        this.closeDiffDetails()
      }
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

    // embed diffEditor to host-editor as block-decoration
    const point = [hunk.end - 1, 0]
    this.markers.push(decorateRange(this.editor, [point, point], {type: "block", position: "after", item: this}))
  }

  updateDiffDetailsDisplay() {
    if (this.showDiffDetails) {
      const {selectedHunk, isSameHunk} = this.getHunkAtCursorRow()
      if (selectedHunk) {
        if (!isSameHunk) this.display(selectedHunk)
        return
      } else {
        if (!getConfig("keepViewToggled")) this.closeDiffDetails()
      }
    }
    this.destroyDecorations()
  }

  registerCommands() {
    return atom.commands.add(this.editor.element, {
      "git-diff-details:toggle-git-diff-details": () => {
        this.showDiffDetails = !this.showDiffDetails
        this.diffDetailsDataManager.invalidatePreviousSelectedHunk()
        this.updateDiffDetailsDisplay()
      },
      "core:close": event => this.closeDiffDetails(),
      "core:cancel": event => this.closeDiffDetails(),
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

  subscribeToRepository() {
    if (this.repositoryDisposables) {
      this.repositoryDisposables.dispose()
      this.repositoryDisposables = null
    }
    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.repositoryDisposables = new CompositeDisposable(
        repository.onDidChangeStatuses(() => this.scheduleUpdate()),
        repository.onDidChangeStatus(changedPath => changedPath === this.editor.getPath() && this.scheduleUpdate())
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
