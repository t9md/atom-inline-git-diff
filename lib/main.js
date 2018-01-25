const InlineGitDiff = require('./inline-git-diff')
const {repositoryForPath} = require('./utils')
const statusBar = require('./status-bar')

module.exports = {
  activate() {
    InlineGitDiff.init()

    const withGitDiff = (element, fn) => {
      const gitDiff = InlineGitDiff.get(element.getModel())
      if (gitDiff) fn(gitDiff)
    }

    this.commandDisposable = atom.commands.add('atom-text-editor:not([mini])', {
      'inline-git-diff:toggle'() {
        withGitDiff(this, gitDiff => gitDiff.toggle())
      },
      'inline-git-diff:revert'() {
        withGitDiff(this, gitDiff => gitDiff.revert())
      },
      'inline-git-diff:copy-removed-text'() {
        withGitDiff(this, gitDiff => gitDiff.copyRemovedText())
      },
    })
  },

  deactivate() {
    this.commandDisposable.dispose()
    if (this.statusBarDisposable) this.statusBarDisposable.dispose()
    InlineGitDiff.destroyAll()
  },

  consumeStatusBar(service) {
    this.statusBarDisposable = statusBar.initialize(service)
  },
}
