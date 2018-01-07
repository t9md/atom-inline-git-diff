const {Emitter, CompositeDisposable} = require("atom")
const STOPPED_CHANGING_VISIBLE_PANE_ITEMS_TIMEOUT = 100

module.exports = class EventUtils {
  constructor() {
    this.emitter = new Emitter()
    this.disposableByPane = new WeakMap()
    this.disposables = new CompositeDisposable()

    this.lastVisibleItems = this.getVisibleItems()

    this.disposables.add(
      atom.workspace.getCenter().observePanes(pane => {
        this.disposableByPane.set(pane, this.observeActivePaneItemChange(pane))
      })
    )
  }

  observeActivePaneItemChange(pane) {
    return pane.onDidChangeActiveItem(item => {
      this.cancelStoppedChangingVisiblePaneItemsTimeout()

      this.stoppedChangingVisiblePaneItemsTimeout = setTimeout(() => {
        this.stoppedChangingVisiblePaneItemsTimeout = null
        const newVisibleItems = this.getVisibleItems()
        const oldVisibleItems = this.lastVisibleItems
        this.lastVisibleItems = newVisibleItems

        this.emitter.emit("did-stop-changing-visible-pane-items", {
          shownItems: newVisibleItems.filter(item => !oldVisibleItems.includes(item)),
          hiddenItems: oldVisibleItems.filter(item => !newVisibleItems.includes(item)),
        })
      }, STOPPED_CHANGING_VISIBLE_PANE_ITEMS_TIMEOUT)
    })
  }

  onDidStopChangingVisiblePaneItems(fn) {
    return this.emitter.on("did-stop-changing-visible-pane-items", fn)
  }

  cancelStoppedChangingVisiblePaneItemsTimeout() {
    if (this.stoppedChangingVisiblePaneItemsTimeout != null) {
      clearTimeout(this.stoppedChangingVisiblePaneItemsTimeout)
    }
  }

  getCenterPanes() {
    return atom.workspace.getCenter().getPanes()
  }

  destroy() {
    this.getCenterPanes().forEach(pane => this.disposableByPane.has(pane) && this.disposableByPane.get(pane).dispose())
    this.cancelStoppedChangingVisiblePaneItemsTimeout()
    this.disposable.dispose()
  }

  getVisibleItems() {
    return this.getCenterPanes().map(pane => pane.getActiveItem())
  }
}
