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

module.exports = class AtomGitDiffDetailsView extends View {
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
    this.destroyDecoration()
    this.subscriptions.dispose()
  }

  initialize(editor) {
    this.editor = editor
    this.diffDetailsDataManager = new DiffDetailsDataManager()

    this.subscriptions = new CompositeDisposable(this.editor.onDidDestroy(() => this.destroy()))

    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.subscriptions.add(
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
      if (atom.config.get("git-diff-details.closeAfterCopy")) this.closeDiffDetails()
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
      if (!atom.config.get("git-diff-details.keepViewToggled")) {
        this.closeDiffDetails()
      }
    }
  }

  destroyDecoration() {
    this.markers.forEach(marker => marker.destroy())
    this.markers = []
  }

  decorateLines(editor, start, end, type) {
    const marker = decorateRange(editor, [[start, 0], [end, 0]], {type: "line", class: `git-diff-details-${type}`})
    this.markers.push(marker)
  }

  decorateWords(editor, start, words, type) {
    if (!words) return
    const decorationOptions = {type: "highlight", class: `git-diff-details-${type}`}
    for (let word of words.filter(word => word.changed)) {
      const row = start + word.offsetRow
      const range = [[row, word.startCol], [row, word.endCol]]
      this.markers.push(decorateRange(editor, range, decorationOptions))
    }
  }

  display(selectedHunk) {
    this.destroyDecoration()

    const flatOrHighlight = atom.config.get("git-diff-details.enableSyntaxHighlighting") ? "highlighted" : "flat"

    if (selectedHunk.kind === "m") {
      this.decorateLines(this.editor, selectedHunk.start - 1, selectedHunk.end, `new-${flatOrHighlight}`)
      if (atom.config.get("git-diff-details.showWordDiffs")) {
        this.decorateWords(this.editor, selectedHunk.start - 1, selectedHunk.newWords, `new-${flatOrHighlight}`)
      }
    }

    const point = [selectedHunk.end - 1, 0]
    this.markers.push(decorateRange(this.editor, [point, point], {type: "block", position: "after", item: this}))

    this.diffEditor.setText(selectedHunk.oldString.replace(/[\r\n]+$/g, ""))
    this.decorateLines(this.diffEditor, 0, selectedHunk.oldLines.length, `old-${flatOrHighlight}`)
    if (atom.config.get("git-diff-details.showWordDiffs")) {
      this.decorateWords(this.diffEditor, 0, selectedHunk.oldWords, `old-${flatOrHighlight}`)
    }
  }

  updateDiffDetailsDisplay() {
    if (this.showDiffDetails) {
      const {selectedHunk, isDifferent} = this.getHunkAtCursorRow()
      if (selectedHunk) {
        if (isDifferent) this.display(selectedHunk)
        return
      } else {
        if (!atom.config.get("git-diff-details.keepViewToggled")) this.closeDiffDetails()
      }
    }
    this.destroyDecoration()
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
