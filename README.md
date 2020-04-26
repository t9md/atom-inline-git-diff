## What's this?

Inline git diffs in editor. Can revert/copy specific diff.

  - By default, it renders **inner line diff** when editing source code files, and **word diff** when editing **text files** (txt, markdown, asciidoc, reStructuredText, etc.), but you can change that in settings. 

  - In case of text files, word diff is displayed ignoring possible changes in text wrapping.

  - You may choose to compare the file you are editing with **any previous commit** from the git history of that file. By default the **last available commit** is pre-selected, but in settings you may choose to **'preselect last commit from current git user'** to see all changes that others made to the file since your last modification.

  - Since diffs are calculated by calling `git diff`, you may choose which [git diff algorithm] you prefer using (myers, minimal, patience, histogram).

[git diff algorithm]: https://git-scm.com/docs/diff-options#Documentation/diff-options.txt---diff-algorithmpatienceminimalhistogrammyers

![](./atom-inline-git-diff.gif)

## This project is fork of [git-diff-details][1] pkg

- This package is fork of great [git-diff-details][1] package by [@samu][samu].

- This package is a result of [experiment][2] to make original git-diff-details how I want.

- I asked to @samu about [releasing this fork project as distinct package][3].

- This project is greatly owning to original @samu's work. Thanks for great successor and his kindness for allowing me to release this pkg.

- [@alpianon][alpianon] added substantial functionalities to get word diff for text files, and to calculate the diff from any previous commit in file history.

[1]: https://github.com/samu/git-diff-details/
[2]: https://github.com/t9md/git-diff-details
[3]: https://github.com/samu/git-diff-details/issues/75
[samu]: https://github.com/samu
[alpianon]: https://github.com/alpianon

## Commands

- `inline-git-diff:toggle`: Enable/disable inline diff
- `inline-git-diff:revert`: Revert diff at cursor
- `inline-git-diff:copy-removed-text`: Copy removed diff to clipboard

## How to use

1. Open editor then execute `inline-git-diff:toggle`.(handled per editor basis)
2. You can `revert`(`inline-git-diff:revert`) or `copy`(`inline-git-diff:copy-removed-text`)
3. Disable by executing `inline-git-diff:toggle` again.

## settings

- **Diff Algorithm**: algorithm to use to calculate the diff (myers, minimal, patience, histogram); for more info see the [git diff algorithm] section in git's official guide
- **Max commits to show in git history**: max number of commits to show in the git history prompt (where you can choose the commit against which to compare the current buffer text)
- **Preselect last commit from current git user**: preselect last commit from the current git user (instead of the last commit) in the git history prompt
- **Diff style for text files**: Diff view style for text files (html, xml, latex, markdown, etc.). Choices are:
  - **line diff**: no highlighting within diffs;
  - **inner line diff**: if lines have not been added but just modified, highlight the text range from the first to the last modification within the diff (more suitable for source code files);
  - **word diff**: highlight the words that have been modified within each diff (more suitable for text files and documentation).
- **Diff style for source files**: diff view style for source code files (same choices as above) 
- **Text file grammar list**: comma-separated list of grammar scope names, used by inline-git-diff to distinguish text files (documents) from source code files and apply different diff view styles accordingly (see the options above). You can use '\*' as wildcard. Default values (text.\*, source.asciidoc\*, source.gfm) should cover any plain text, asciidoc, markdown, html, latex, reStructuredText and xml files. You may find more info on Atom's grammar scope names at <https://atom.io/packages/file-types>.

## keymap

For default keymap, see [this file](https://github.com/t9md/atom-inline-git-diff/blob/master/keymaps/inline-git-diff.cson).

### Here is my keymap

```coffeescript
'atom-text-editor.vim-mode-plus.normal-mode':
  'g d': 'inline-git-diff:toggle'

'atom-workspace:not(.has-narrow) atom-text-editor.vim-mode-plus.normal-mode.has-inline-git-diff':
  'tab': 'git-diff:move-to-next-diff'
  'shift-tab': 'git-diff:move-to-previous-diff'

'atom-text-editor.vim-mode-plus.normal-mode.has-inline-git-diff':
  'g r': 'inline-git-diff:revert'
  'g c': 'inline-git-diff:copy-removed-text'
```

My workflow is

1. `g d` to see inline diff.
2. `tab` to review changes I made, after review hit `tab` to move to next diff.
3. `g r` to `revert`, `g c` to `copy-removed-text`

## Differences from original `git-diff-details` package

- Different config options
- Simpler inner-line diff for by partitioning diff part just **two** part(same and not-same range)
- Choice between three different diff rendering styles (line diff, inner line diff, word diff; the default for source code files is inner-line diff, while the default for text files is word diff);
- Calculate the diff from any previous commit in file history
- Removed diff lines are rendered at `above` of removed place not at `below`
- Flash copied text on `copy-removed-text`
  - No flash on `revert`,  I tried and given up because I couldn't achieve smooth fadeout effect as it is in `copy-removed-text`
- Show all diffs in editor instead of just showing diff at cursor
- Rename command names(e.g. `undo` command to `revert`)
- Show all diff kind(`added`, `removed`, `modified`) whereas `git-diff-details` shows `removed` and `modified` only
- As a result this pkg can revert `added` diff too.
- Detect **closest** diff at cursor when `revert` or `copy-removed-text` so that user can revert/copy where cursor is not strictly placed at diff
- Activate on `toggle` to avoid Atom startup overhead.
