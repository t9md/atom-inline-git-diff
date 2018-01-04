const getConfig = param => atom.config.get(`git-diff-details.${param}`)
const nullGrammar = atom.grammars.grammarForScopeName("text.plain.null-grammar")
const {decorateRange} = require("./utils")

module.exports = class RemovedDiff {
  constructor(hostEditor, hunk) {
    const grammar = getConfig("useFlatColorForRemovedLines") ? nullGrammar : hostEditor.getGrammar()
    const text = hunk.getRemovedText().replace(/[\r\n]+$/, "")

    this.editor = new TextEditor({lineNumberGutterVisible: false, scrollPastEnd: false})
    this.editor.setGrammar(grammar)
    this.editor.setText(text)

    const point = hunk.getPointToInsertBlockDecoration()
    this.decoration = decorateRange(hostEditor, [point, point], {
      type: "block",
      position: "before",
      item: this.buildElement(),
    })
  }

  buildElement() {
    const outer = document.createElement("div")
    outer.className = "git-diff-details-outer"

    const main = document.createElement("div")
    main.className = "git-diff-details-main-panel"
    outer.appendChild(main)
    main.appendChild(this.editor.element)

    main.addEventListener("mousedown", event => {
      event.preventDefault()
      event.stopPropagation()
    })
    return outer
  }

  destroy() {
    this.decoration.destroy()
    this.editor.destroy()
  }
}
