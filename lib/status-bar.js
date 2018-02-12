let InlineGitDiff
const {Disposable, CompositeDisposable} = require('atom')
const {repositoryForPath} = require('./utils')

class StatusBar {
  constructor () {
    this.container = document.createElement('div')
    this.container.className = 'inline-git-diff-status inline-block'
    this.element = document.createElement('div')
    this.element.className = 'icon icon-octoface'
    this.container.appendChild(this.element)
  }

  setStyle (value) {
    const classList = [
      value.includes('icon') && 'icon icon-octoface',
      this.element.classList.contains('enabled') && 'enabled'
    ].filter(v => v)

    this.element.className = classList.join(' ')
    this.element.textContent = value.includes('text') ? 'Inline Git Diff' : ''
  }

  setEnabled (value) {
    if (value) {
      if (!this.service) {
        this.pendingEnable = () => this.setEnabled(true)
        return
      }
      this.pendingEnable = null

      // HACK: Force show status bar while user change setting in setting-view
      // Normally statusBar item are hidden when setting-view focused
      // This method called only from setting-view, and showing item when enabled would
      // be helpful for user decide what config value is best for them.
      this.element.style.display = ''
      this.element.classList.toggle('enabled', false)

      const onClick = this.onClick.bind(this)
      this.container.addEventListener('click', onClick)
      const tile = this.service.addLeftTile({item: this.container, priority: 20})

      this.disposables = new CompositeDisposable(
        atom.workspace.onDidChangeActiveTextEditor(editor => this.update(editor)),
        atom.tooltips.add(this.container, {title: 'Inline Git Diff'}),
        new Disposable(() => {
          this.container.removeEventListener('click', onClick)
          tile.destroy()
        })
      )
    } else {
      this.pendingEnable = null
      if (this.disposables) this.disposables.dispose()
    }
  }

  init (service) {
    this.service = service
    if (this.pendingEnable) this.pendingEnable()
    this.update(atom.workspace.getActiveTextEditor())
  }

  onClick (event) {
    event.preventDefault()
    event.stopPropagation()
    const editor = atom.workspace.getActiveTextEditor()
    if (editor) {
      const gitDiff = this.getGitDiff(editor)
      if (gitDiff) gitDiff.toggle()
    }
  }

  getGitDiff (editor) {
    if (!InlineGitDiff) InlineGitDiff = require('./inline-git-diff')
    return InlineGitDiff.get(editor)
  }

  update (editor) {
    const enabled = editor && editor.element.classList.contains('has-inline-git-diff')
    const hide = !editor || (!enabled && !repositoryForPath(editor.getPath()))
    if (hide) {
      this.element.style.display = 'none'
    } else {
      this.element.style.display = ''
      this.element.classList.toggle('enabled', enabled)
    }
  }
}

module.exports = new StatusBar()
