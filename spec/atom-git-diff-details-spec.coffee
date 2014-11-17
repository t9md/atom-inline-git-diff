{WorkspaceView} = require 'atom'
AtomGitDiffDetails = require '../lib/atom-git-diff-details'

# Use the command `window:run-package-specs` (cmd-alt-ctrl-p) to run specs.
#
# To run a specific `it` or `describe` block add an `f` to the front (e.g. `fit`
# or `fdescribe`). Remove the `f` to unfocus the block.

describe "AtomGitDiffDetails", ->
  activationPromise = null

  beforeEach ->
    atom.workspaceView = new WorkspaceView
    activationPromise = atom.packages.activatePackage('atom-git-diff-details')

  describe "when the atom-git-diff-details:toggle event is triggered", ->
    it "attaches and then detaches the view", ->
      expect(atom.workspaceView.find('.atom-git-diff-details')).not.toExist()

      # This is an activation event, triggering it will cause the package to be
      # activated.
      atom.commands.dispatch atom.workspaceView.element, 'atom-git-diff-details:toggle'

      waitsForPromise ->
        activationPromise

      runs ->
        expect(atom.workspaceView.find('.atom-git-diff-details')).toExist()
        atom.commands.dispatch atom.workspaceView.element, 'atom-git-diff-details:toggle'
        expect(atom.workspaceView.find('.atom-git-diff-details')).not.toExist()
