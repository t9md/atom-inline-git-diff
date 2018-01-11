const InlineGitDiff = require("./inline-git-diff")
const {repositoryForPath} = require("./utils")

module.exports = {
  activate() {
    InlineGitDiff.init()

    const withGitDiff = (element, fn) => {
      const gitDiff = InlineGitDiff.get(element.getModel())
      if (gitDiff) fn(gitDiff)
    }

    this.commandDisposable = atom.commands.add("atom-text-editor:not([mini])", {
      "inline-git-diff:toggle"() {
        withGitDiff(this, gitDiff => gitDiff.toggle())
      },
      "inline-git-diff:revert"() {
        withGitDiff(this, gitDiff => gitDiff.revert())
      },
      "inline-git-diff:copy-removed-text"() {
        withGitDiff(this, gitDiff => gitDiff.copyRemovedText())
      },
      "inline-git-diff:set-diff-base"() {
        withGitDiff(this, gitDiff => gitDiff.setDiffBase())
      },
    })
  },

  deactivate() {
    this.commandDisposable.dispose()
    InlineGitDiff.destroyAll()
  },
}
