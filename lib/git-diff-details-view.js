const {View} = require("atom-space-pen-views")
const {Range, CompositeDisposable, TextEditor} = require("atom")
const {decorateRange, getLineDiffDetails, repositoryForPath} = require("./utils")

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

  initialize(grammar, hunk) {
    this.editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    this.editor.setGrammar(grammar)
    this.editor.setText(hunk.removedLines.join("").replace(/[\r\n]+$/, ""))
    this.contents.html(this.editor.element)
  }

  destroy() {
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
          "git-diff-details:undo": () => this.undo(),
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
    this.markers = []
    this.diffEditors = []
  }

  destroy() {
    if (this.repositoryDisposables) this.repositoryDisposables.dispose()
    clearImmediate(this.immediateId)
    this.destroyDecorations()
    this.disposables.dispose()
  }

  getHunkAtCursorRow() {
    const row = this.editor.getCursorBufferPosition().row
    return this.getHunks().find(hunk => hunk.startRow <= row && row <= hunk.endRow)
  }

  getHunks() {
    if (!this.lineDiffDetails) this.lineDiffDetails = getLineDiffDetails(this.editor)
    return this.lineDiffDetails
  }

  refreshDiff() {
    this.lineDiffDetails = null
    if (this.editor.isAlive() && this.showDiffDetails) this.showDiff()
  }

  copy() {
    if (!this.showDiffDetails) return
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      atom.clipboard.write(hunk.removedLines.join(""))
      if (getConfig("closeAfterCopy")) this.hideDiff()
    }
  }

  undo() {
    if (!this.showDiffDetails) return
    const hunk = this.getHunkAtCursorRow()
    if (hunk) {
      const {kind, startRow, endRow, removedLines} = hunk
      if (kind === "modified") {
        this.editor.setTextInBufferRange([[startRow, 0], [endRow + 1, 0]], removedLines.join(""))
      } else {
        this.editor.setTextInBufferRange([[startRow, 0], [startRow, 0]], removedLines.join(""))
      }
      if (!getConfig("keepViewToggled")) this.hideDiff()
    }
  }

  destroyDecorations() {
    this.markers.forEach(marker => marker.destroy())
    this.diffEditors.forEach(diffEditor => diffEditor.destroy())
    this.diffEditors = []
    this.markers = []
  }

  decorateRange(...args) {
    this.markers.push(decorateRange(...args))
  }

  decorateLines(editor, startRow, endRow, className) {
    this.decorateRange(editor, [[startRow, 0], [endRow, Infinity]], {type: "line", class: className})
  }

  decorateWords(editor, row, changes, className, which) {
    if (changes && changes.length) {
      const options = {type: "highlight", class: className}
      for (let i = 0; i < changes.length; i++) {
        const {start, length} = changes[i]
        if (!length) continue
        this.decorateRange(editor, Range.fromPointWithDelta([row + i, start], 0, length), options)
      }
    }
  }

  display(hunk) {
    this.displayedHunk = hunk

    const {kind, startRow, endRow, needComputeRelativeChange, newRelativeChanges, oldRelativeChanges} = hunk
    const needRenderWordDiff = getConfig("showWordDiffs") && needComputeRelativeChange

    // host editor
    if (kind === "modified") {
      const className = "git-diff-details-added"
      this.decorateLines(this.editor, startRow, endRow, className)
      if (needRenderWordDiff) {
        this.decorateWords(this.editor, startRow, newRelativeChanges, className, "added")
      }
    }

    // embedded diff-editor
    const grammar = getConfig("useFlatColorForRemovedLines") ? nullGrammar : this.editor.getGrammar()
    const diffView = new DiffView(grammar, hunk)
    this.diffEditors.push(diffView)
    if (needRenderWordDiff) {
      this.decorateWords(diffView.editor, 0, oldRelativeChanges, "git-diff-details-removed", "removed")
    }

    // embeded diffEditor to host-editor as block-decoration
    const position = getConfig("positionToShowRemoved")
    let rowToInsert
    if (kind === "modified") {
      rowToInsert = position === "before" ? startRow : endRow
    } else {
      rowToInsert = position === "before" ? startRow + 1 : startRow
    }
    const point = [rowToInsert, Infinity]
    this.decorateRange(this.editor, [point, point], {type: "block", position, item: diffView})
  }

  async showDiff() {
    if (getConfig("showAllChanges")) {
      this.withKeepingRelativeScrollPosition(() => {
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

  pixelPositionForBufferPosition(point) {
    return this.editor.element.pixelPositionForBufferPosition(point)
  }

  async withKeepingRelativeScrollPosition(fn) {
    const cursorPosition = this.editor.getCursorBufferPosition()
    const oldPixelTop = this.pixelPositionForBufferPosition(cursorPosition).top
    await fn()
    await this.editor.component.getNextUpdatePromise()
    const newPixelTop = this.pixelPositionForBufferPosition(cursorPosition).top
    const amountOfScrolledPixels = newPixelTop - oldPixelTop
    if (amountOfScrolledPixels) {
      this.editor.element.setScrollTop(this.editor.element.getScrollTop() + amountOfScrolledPixels)
      this.editor.component.updateSync()
    }
  }

  hideDiff(once) {
    this.withKeepingRelativeScrollPosition(() => {
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
