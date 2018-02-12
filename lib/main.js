let InlineGitDiff
const {CompositeDisposable} = require('atom')
const statusBar = require('./status-bar')

function loadInlineGitDiff () {
  if (!InlineGitDiff) InlineGitDiff = require('./inline-git-diff')
}

module.exports = {
  activate () {
    const invoke = (element, method) => {
      loadInlineGitDiff()
      InlineGitDiff.invoke(element.getModel(), method)
    }
    this.disposables = new CompositeDisposable(
      // prettier-ignore
      atom.commands.add('atom-text-editor:not([mini])', {
        'inline-git-diff:toggle' () { invoke(this, 'toggle') },
        'inline-git-diff:revert' () { invoke(this, 'revert') },
        'inline-git-diff:copy-removed-text' () { invoke(this, 'copyRemovedText') }
      }),
      atom.config.observe('inline-git-diff.showInStatusBar', value => statusBar.setEnabled(value)),
      atom.config.observe('inline-git-diff.statusBarStyle', value => statusBar.setStyle(value))
    )
  },

  deactivate () {
    this.disposables.dispose()
    if (InlineGitDiff) InlineGitDiff.destroyAll()
    statusBar.setEnabled(false)
  },

  consumeStatusBar (service) {
    statusBar.init(service, this.getInlineGitDiff)
  },

  // bound, since it's used without receiver in different places
  getInlineGitDiff: editor => {
    loadInlineGitDiff()
    return InlineGitDiff.get(editor)
  },

  provideInlineGitDiff () {
    return {getInlineGitDiff: this.getInlineGitDiff}
  }
}
