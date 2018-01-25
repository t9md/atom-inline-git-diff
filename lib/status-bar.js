let InlineGitDiff
const {Disposable} = require('atom')

class StatusBar {
  constructor() {
    this.container = document.createElement('div')
    this.container.id = 'inline-git-diff-status'
    this.container.className = 'inline-block'
    this.element = document.createElement('div')
    this.element.className = 'icon icon-octoface'
    this.container.appendChild(this.element)
  }

  initialize(service) {
    const onClick = this.onClick.bind(this)
    this.element.addEventListener('click', onClick)
    const tile = service.addLeftTile({item: this.container, priority: 20})
    const disposable = atom.workspace.onDidChangeActiveTextEditor(editor => this.update(editor))
    return new Disposable(() => {
      this.element.removeEventListener('click', onClick)
      disposable.dispose()
      tile.destroy()
    })
  }

  onClick(event) {
    event.preventDefault()
    event.stopPropagation()
    const gitDiff = this.getGitDiff(atom.workspace.getActiveTextEditor())
    if (gitDiff) {
      gitDiff.toggle()
    }
  }

  getGitDiff(editor) {
    if (!InlineGitDiff) InlineGitDiff = require('./inline-git-diff')
    return InlineGitDiff.get(editor)
  }

  update(editor) {
    if (editor) {
      this.element.style.display = ''
      const enabled = editor.element.classList.contains('has-inline-git-diff')
      this.element.classList.toggle('enabled', enabled)
    } else {
      this.element.style.display = 'none'
    }
  }
}

module.exports = new StatusBar()
