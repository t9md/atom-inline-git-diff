let InlineGitDiff
const {CompositeDisposable} = require('atom')
const statusBar = require('./status-bar')

module.exports = {
  activate() {
    const invoke = (element, method) => {
      if (!InlineGitDiff) InlineGitDiff = require('./inline-git-diff')
      InlineGitDiff.invoke(element.getModel(), method)
    }
    // prettier-ignore
    this.disposables = new CompositeDisposable(
      atom.commands.add('atom-text-editor:not([mini])', {
        'inline-git-diff:toggle'() { invoke(this, 'toggle') },
        'inline-git-diff:revert'() { invoke(this, 'revert') },
        'inline-git-diff:copy-removed-text'() { invoke(this, 'copyRemovedText') },
      }),
      atom.config.observe('inline-git-diff.showInStatusBar', value => statusBar.setEnabled(value)),
      atom.config.observe('inline-git-diff.statusBarStyle', value => statusBar.setStyle(value))
    )
  },

  deactivate() {
    this.disposables.dispose()
    if (InlineGitDiff) InlineGitDiff.destroyAll()
    statusBar.setEnabled(false)
  },

  consumeStatusBar(service) {
    statusBar.init(service)
  },

  provideInlineGitDiff() {
    return {
      getInlineGitDiff: editor => {
        if (!InlineGitDiff) InlineGitDiff = require('./inline-git-diff')
        return InlineGitDiff.get(editor)
      },
    }
  },
}
