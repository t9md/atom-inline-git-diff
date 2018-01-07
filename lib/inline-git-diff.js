const {CompositeDisposable, TextEditor, Point, Range} = require("atom")
const {repositoryForPath, withKeepingRelativeScrollPosition, decorateRange} = require("./utils")
const Diff = require("./diff")

function buildEditorForRemovedDiff(grammar, diff) {
  const editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
  editor.element.classList.add("inline-git-diff-removed")
  editor.element.addEventListener("mousedown", event => {
    event.preventDefault()
    event.stopPropagation()
  })
  editor.setGrammar(grammar)
  editor.setText(diff.getRemovedText().replace(/[\r\n]$/, ""))
  return editor
}

module.exports = class InlineGitDiff {
  constructor(editor) {
    this.editor = editor
    this.markersByDiff = new Map()
    this.disposables = new CompositeDisposable(
      this.editor.onDidDestroy(() => this.destroy()),
      this.editor.onDidStopChanging(() => this.refreshDiff())
    )
    this.enabled = false
  }

  toggle() {
    this.enabled = !this.enabled
    this.editor.element.classList.toggle("has-inline-git-diff", this.enabled)
    this.refreshDiff()
  }

  getDiffs() {
    if (!this.diffs) {
      this.diffs = Diff.collect(this.editor.buffer)
    }
    return this.diffs
  }

  refreshDiff() {
    withKeepingRelativeScrollPosition(this.editor, () => {
      this.destroyDecorations()
      if (this.enabled) {
        this.diffs = null
        this.getDiffs().forEach(diff => this.renderDiff(diff))
      }
    })
  }

  destroyDecorations() {
    this.markersByDiff.forEach(markers => markers.forEach(marker => marker.destroy()))
    this.markersByDiff.clear()
  }

  destroy() {
    this.editor.element.classList.remove("has-inline-git-diff")
    this.destroyDecorations()
    this.disposables.dispose()
  }

  renderDiff(diff) {
    this.lastRenderedDiff = diff
    if (!this.markersByDiff.has(diff)) this.markersByDiff.set(diff, [])
    const markers = this.markersByDiff.get(diff)

    const highlight = (...args) => {
      const marker = decorateRange(...args)
      markers.push(marker)
      return marker
    }

    if (diff.lines.added.length) {
      highlight(this.editor, diff.getRange(), {type: "line", class: "inline-git-diff-added"})
    }

    if (diff.lines.removed.length) {
      const editorForRemovedDiff = buildEditorForRemovedDiff(this.editor.getGrammar(), diff)

      const pointToInsert = new Point(diff.startRow + (diff.kind === "modified" ? 0 : 1), 0)
      const marker = highlight(this.editor, [pointToInsert, pointToInsert], {
        type: "block",
        position: "before",
        item: editorForRemovedDiff.element,
      })
      marker.onDidDestroy(() => editorForRemovedDiff.destroy())

      if (diff.needComputeInnerLineDiff) {
        const toRange = (row, {start, length}) => Range.fromPointWithDelta([row, start], 0, length)

        for (let i = 0; i < diff.innerLineDiffs.length; i++) {
          const {added, removed} = diff.innerLineDiffs[i]
          if (added.length) {
            const range = toRange(diff.startRow + i, added)
            highlight(this.editor, range, {type: "highlight", class: "inline-git-diff-added-inner"})
          }
          if (removed.length) {
            const range = toRange(i, removed)
            highlight(editorForRemovedDiff, range, {type: "highlight", class: "inline-git-diff-removed-inner"})
          }
        }
      }
    }
  }

  getDiffAtCursorRow() {
    const cursorRow = this.editor.getCursorBufferPosition().row
    return this.getDiffs().find(diff => diff.containsRow(cursorRow))
  }

  copyRemovedText() {
    const diff = this.getDiffAtCursorRow()
    if (diff) atom.clipboard.write(diff.getRemovedText())
  }

  revert() {
    const diff = this.getDiffAtCursorRow()
    if (diff) {
      const originalPosition =
        diff.kind === "modified" && diff.needComputeInnerLineDiff ? this.editor.getCursorBufferPosition() : undefined

      this.editor.setTextInBufferRange(diff.getRange(), diff.getRemovedText())

      this.markersByDiff.get(diff).forEach(marker => marker.destroy())
      this.markersByDiff.delete(diff)

      if (originalPosition) this.editor.setCursorBufferPosition(originalPosition)
    }
  }
}
