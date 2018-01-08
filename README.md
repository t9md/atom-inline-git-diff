## What's this?

Inline git diffs in editor.

![](https://raw.githubusercontent.com/t9md/t9md/af71d8d6613f61b7f0fe3da9f7a89b5c91c3510c/img/atom-inline-git-diff.gif)

## How this package is built

- This package is fork of great [git-diff-details](https://github.com/samu/git-diff-details/) package by [@samu](https://github.com/samu).
- This package is a result of experiment to change original git-diff-details how I want.
- Why I didn't send PR is changes are big, incompatible, and I still not sure how this fork project goes.
  - I'm still in the middle of experimenting.
- See: https://github.com/samu/git-diff-details/issues/75

## Differences from original `git-diff-details` package

- No config options
- Cleaner inner-line diff(word diff)
- Show all diffs in editor, always instead of just showing diff at cursor
- Show added diff as long as modified, deleted diff
- Rename `undo` command to `revert`
- Can revert for added diff
- Activate on `toggle`

## Commands

- `inline-git-diff:toggle`: Enable/disable inline diff.
- `inline-git-diff:revert`: Revert diff at cursor.
- `inline-git-diff:copy-removed-text`: Copy removed diff to clipboard.

## How to use

1. Enable inline diff by executing `inline-git-diff:toggle`.
2. Review diff, revert by `inline-git-diff:revert`
3. Disable inline diff by executing `inline-git-diff:toggle` again.

## keymap

For default keymap, see [this file](https://github.com/t9md/atom-inline-git-diff/blob/master/keymaps/inline-git-diff.cson).

### Here is my keymap

```coffeescript
'atom-text-editor.vim-mode-plus.normal-mode':
  'g d': 'inline-git-diff:toggle'

'atom-workspace:not(.has-narrow) atom-text-editor.vim-mode-plus.normal-mode.has-inline-git-diff':
  'tab': 'git-diff:move-to-next-diff'
  'shift-tab': 'git-diff:move-to-previous-diff'
  'g r': 'inline-git-diff:revert'
  'g c': 'inline-git-diff:copy-removed-text'
```

My workflow is

1. `g d` to see inline diff.
2. `tab` to review changes I made, after review hit `tab` to move to next diff.
