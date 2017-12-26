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

    this.diffEditor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    this.contents.html(this.diffEditor.element)

    this.markers = []

    this.showDiffDetails = false
    this.lineDiffDetails = null
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
    this.updateDiffDetails()
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
      const buffer = this.editor.getBuffer()
      if (selectedHunk.kind === "m") {
        buffer.setTextInRange([[selectedHunk.start - 1, 0], [selectedHunk.end, 0]], selectedHunk.oldString)
      } else {
        buffer.insert([selectedHunk.start, 0], selectedHunk.oldString)
      }
      if (!atom.config.get("git-diff-details.keepViewToggled")) this.closeDiffDetails()
    }
  }

  destroyDecoration() {
    this.markers.forEach(marker => marker.destroy())
    this.markers = []
  }

  decorateLines(editor, start, end, type) {
    const marker = editor.markBufferRange([[start, 0], [end, 0]])
    editor.decorateMarker(marker, {type: "line", class: `git-diff-details-${type}`})
    this.markers.push(marker)
  }

  decorateWords(editor, start, words, type) {
    if (!words) return
    for (let word of words) {
      if (!word.changed) continue
      const row = start + word.offsetRow
      const marker = editor.markBufferRange([[row, word.startCol], [row, word.endCol]])
      editor.decorateMarker(marker, {type: "highlight", class: `git-diff-details-${type}`})
      this.markers.push(marker)
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

    const marker = this.editor.markBufferRange([[selectedHunk.end - 1, 0], [selectedHunk.end - 1, 0]])
    this.editor.decorateMarker(marker, {type: "block", position: "after", item: this})

    this.markers.push(marker)
    this.diffEditor.setGrammar(this.editor.getGrammar())
    this.diffEditor.setText(selectedHunk.oldString.replace(/[\r\n]+$/g, ""))
    this.decorateLines(this.diffEditor, 0, selectedHunk.oldLines.length, `old-${flatOrHighlight}`)
    if (atom.config.get("git-diff-details.showWordDiffs")) {
      this.decorateWords(this.diffEditor, 0, selectedHunk.oldWords, `old-${flatOrHighlight}`)
    }
  }

  updateDiffDetailsDisplay() {
    if (this.showDiffDetails) {
      const {selectedHunk, isDifferent} = this.getHunkAtCursorRow()
      if (!selectedHunk) {
        if (!atom.config.get("git-diff-details.keepViewToggled")) this.closeDiffDetails()
      } else if (isDifferent) {
        this.display(selectedHunk)
      }
    }
    this.destroyDecoration()
  }

  registerCommands() {
    return atom.commands.add(this.editor.element, {
      "git-diff-details:toggle-git-diff-details": () => {
        this.showDiffDetails = !this.showDiffDetails
        this.updateDiffDetails()
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
