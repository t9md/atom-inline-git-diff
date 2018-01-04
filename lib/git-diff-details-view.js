const {View} = require("atom-space-pen-views")
const {Range, CompositeDisposable, TextEditor} = require("atom")
const {decorateRange, getHunks, repositoryForPath, withKeepingRelativeScrollPosition} = require("./utils")

const getConfig = param => atom.config.get(`git-diff-details.${param}`)
const nullGrammar = atom.grammars.grammarForScopeName("text.plain.null-grammar")

class DiffView extends View {
  static content() {
    return this.div({class: "git-diff-details-outer"}, () => {
      return this.div({class: "git-diff-details-main-panel", outlet: "mainPanel"}, () => {
        return this.div({class: "editor git-diff-editor", outlet: "contents"})
      })
    })
  }

  initialize(hostEditor, hunk) {
    this.editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    this.editor.setGrammar(getConfig("useFlatColorForRemovedLines") ? nullGrammar : hostEditor.getGrammar())
    this.editor.setText(hunk.getRemovedText().replace(/[\r\n]+$/, ""))
    this.contents.html(this.editor.element)

    const whichToShow = getConfig("positionToShowRemoved")
    const point = hunk.getPointToInsertBlockDecoration(whichToShow)
    this.decoration = decorateRange(hostEditor, [point, point], {type: "block", position: whichToShow, item: this})
  }

  destroy() {
    this.decoration.destroy()
    this.editor.destroy()
  }
}

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
    this.markers = []
    this.diffEditors = []

    this.disposables = new CompositeDisposable(this.editor.onDidDestroy(() => this.destroy()))

    const repository = repositoryForPath(this.editor.getPath())
    if (repository) {
      this.subscribeToRepository()

      this.disposables.add(
        this.editor.onDidStopChanging(() => this.refreshDiff()),
        this.editor.onDidChangePath(() => this.refreshDiff()),
        this.editor.onDidChangeCursorPosition(event => {
          if (getConfig("showAllChanges")) return
          if (this.showDiffDetails && event.oldBufferPosition.row !== event.newBufferPosition.row) {
            this.showDiff()
          }
        }),
        atom.project.onDidChangePaths(() => this.subscribeToRepository()),
        atom.commands.add(this.editor.element, {
          "git-diff-details:toggle-git-diff-details": () => this.toggleDiff(),
          "core:close": () => this.hideDiff(),
          "core:cancel": () => this.hideDiff(),
          "git-diff-details:revert": () => this.revert(),
          "git-diff-details:undo": () => this.revert(),
          "git-diff-details:copy": () => this.copy(),
        })
      )
    }

    this.mainPanel.on("mousedown", () => false) // avoid focus taken by embedded diffEditor
    this.disposables.add(
      atom.config.observe("git-diff-details.useFlatColorForAddedLines", enabled => {
        this.editor.element.classList.toggle("use-flat-color-for-added-lines", enabled)
      })
    )
  }

  destroy() {
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    clearImmediate(this.immediateId)
    this.destroyDecorations()
    this.disposables.dispose()
  }

  getHunkAtCursorRow() {
    const row = this.editor.getCursorBufferPosition().row
    return this.getHunks().find(hunk => hunk.containsRow(row))
  }

  getHunks() {
    if (!this.hunks) this.hunks = getHunks(this.editor)
    return this.hunks
  }

  refreshDiff() {
    this.hunks = null
    if (this.editor.isAlive() && this.showDiffDetails) this.showDiff()
  }

  copy() {
    if (!this.showDiffDetails) return
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      atom.clipboard.write(hunk.getRemovedText())
      if (getConfig("closeAfterCopy")) this.hideDiff()
    }
  }

  // actually not undo, this is revert
  revert() {
    if (!this.showDiffDetails) return
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      const point = this.editor.getCursorBufferPosition()
      this.destroyDecorations()
      this.editor.setTextInBufferRange(hunk.getAddedRange(), hunk.getRemovedText())
      if (!getConfig("keepViewToggled")) this.hideDiff()
      this.editor.setCursorBufferPosition(point)
    }
  }

  destroyDecorations() {
    this.markers.forEach(marker => marker.destroy())
    this.diffEditors.forEach(diffEditor => diffEditor.destroy())
    this.diffEditors = []
    this.markers = []
  }

  display(hunk) {
    this.displayedHunk = hunk

    const highlight = (...args) => this.markers.push(decorateRange(...args))

    // host editor
    if (hunk.getAddedText()) {
      highlight(this.editor, hunk.getAddedRange(), {type: "line", class: "git-diff-details-added"})
    }

    // embedded diff-editor
    if (hunk.getRemovedText()) {
      const diffView = new DiffView(this.editor, hunk)
      this.diffEditors.push(diffView)

      if (getConfig("showWordDiffs") && hunk.needComputeRelativeChange) {
        hunk.getRangesForRelativeChangeForAdded(hunk.startRow).forEach(range => {
          highlight(this.editor, range, {type: "highlight", class: "git-diff-details-added"})
        })
        hunk.getRangesForRelativeChangeForRemoved(0).forEach(range => {
          highlight(diffView.editor, range, {type: "highlight", class: "git-diff-details-removed"})
        })
      }
    }
  }

  async showDiff() {
    if (getConfig("showAllChanges")) {
      withKeepingRelativeScrollPosition(this.editor, () => {
        this.destroyDecorations()
        this.getHunks().forEach(hunk => this.display(hunk))
      })
    } else {
      const hunk = this.getHunkAtCursorRow()
      if (hunk) {
        if (this.displayedHunk !== hunk) {
          this.destroyDecorations()
          this.display(hunk)
        }
      } else {
        this.hideDiff(getConfig("keepViewToggled"))
      }
    }
  }

  hideDiff(once) {
    withKeepingRelativeScrollPosition(this.editor, () => {
      if (!once) this.showDiffDetails = false
      this.displayedHunk = null
      this.destroyDecorations()
    })
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

  scheduleUpdate() {
    clearImmediate(this.immediateId)
    this.immediateId = setImmediate(() => this.refreshDiff())
  }
}
