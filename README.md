## note by t9md START

Inline git diffs in editor.

![](https://raw.githubusercontent.com/t9md/t9md/af71d8d6613f61b7f0fe3da9f7a89b5c91c3510c/img/atom-inline-git-diff.gif)

## difference from original `git-diff-details` package

- No config options
- Cleaner inner-line diff(word diff)
- Show all diffs in editor, always instead of just showing diff at cursor
- Show added diff as long as modified, deleted diff
- Rename `undo` command to `revert`
- Can revert for added diff
- Activate on `toggle`

## note by t9md END

# inline-git-diff package

View git diffs directly in atom.

Please note this package will show one diff at
a time, as opposed to all diffs at once
(see [#58](https://github.com/samu/git-diff-details/issues/58)).

## Keybindings
  * `alt-g alt-d` to toggle the diff view (You'll need to press these keys one
    after another, and you'll need to place the cursor on a line that is marked
    as a diff)
  * `escape` to close the diff view
  * `alt-u` for undo
  * `alt-c` for copy

## Syntax highlighting
You can choose whether the diff should be highlighted or not:

![git-diff-details](https://github.com/samu/git-diff-details/blob/master/flat.png?raw=true)

![git-diff-details](https://github.com/samu/git-diff-details/blob/master/highlighted.png?raw=true)

## Styling
You can style the diffs to your liking. Here's an example:

```less
atom-text-editor .line {
  &.inline-git-diff-new-highlighted {
    background-color: rgba(162, 232, 120, 0.4) !important;
  }

  &.inline-git-diff-old-highlighted {
    background-color: rgba(232, 120, 120, 0.4) !important;
  }

  &.inline-git-diff-new-flat {
    background-color: rgba(162, 232, 120, 0.7) !important;
  }

  &.inline-git-diff-old-flat {
    background-color: rgba(232, 120, 120, 0.7) !important;
  }
}
```

## Contributing
I'd like to be conservative about adding features to this plugin. If you want to implement something, please create an issue first so we can discuss whether i'd accept a pull request.
