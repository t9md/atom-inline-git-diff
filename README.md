## What's this?

Inline git diffs in editor. Can revert/copy specific diff.

![](https://raw.githubusercontent.com/t9md/t9md/5dae170b2f0d78fa922b8a6d90149e45bfcac5c4/img/atom-inline-git-diff.gif)

## This project is fork of [git-diff-details][1] pkg

- This package is fork of great [git-diff-details][1] package by [@samu][samu].
- This package is a result of [experiment][2] to make original git-diff-details how I want.
- I asked to @samu about [releasing this fork project as distinct package][3].
- This project is greatly owning to original @samu's work. Thanks for great successor and his kindness for allowing me to release this pkg.

[1]: https://github.com/samu/git-diff-details/
[2]: https://github.com/t9md/git-diff-details
[3]: https://github.com/samu/git-diff-details/issues/75
[samu]: https://github.com/samu

## Commands

- `inline-git-diff:toggle`: Enable/disable inline diff
- `inline-git-diff:revert`: Revert diff at cursor
- `inline-git-diff:copy-removed-text`: Copy removed diff to clipboard

## How to use

1. Open editor then execute `inline-git-diff:toggle`.(handled per editor basis)
2. You can `revert`(`inline-git-diff:revert`) or `copy`(`inline-git-diff:copy-removed-text`)
3. Disable by executing `inline-git-diff:toggle` again.

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

- No config options
- Simpler inner-line diff(word diff) by partitioning diff part just **two** part(same and not-same range)
- Removed diff lines are rendered at `above` of removed place not at `below`
- Flash copied text on `copy-removed-text`
  - No flash on `revert`,  I tried and given up because I couldn't achieve smooth fadeout effect as it is in `copy-removed-text`
- Show all diffs in editor  instead of just showing diff at cursor
- Rename command names(e.g. `undo` command to `revert`)
- Show all diff kind(`added`, `removed`, `modified`) whereas `git-diff-details` shows `removed` and `modified` only
- As a result this pkg can revert `added` diff too.
- Detect **closest** diff at cursor when `revert` or `copy-removed-text` so that user can revert/copy where cursor is not strictly placed at diff
- Activate on `toggle` to avoid Atom startup overhead.
