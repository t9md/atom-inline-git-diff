## 3.0.0

- Enhancements by @alpianon:
  - word diff for text files, inner line diff for source code files (configurable)
  - user can choose any previous commit from edited file's git history to calculate the diff against (by default, last available commit is pre-seleted, but one may choose to pre-select last commit by the current git user)
  - the command `git diff` is used to calculate diffs
  - user can choose which git diff algorithm to use to calculate the diff

## 2.4.0
- Improve: Enable soft-wrap in inline diff editor when hosting(original) editor is soft-wrapped. #11 by @alpianon

## 2.3.0
- Improve: `revert` and `copy-removed-text` commands works without having `inline-git-diff` enabled. #5
  - In older version, revert/copy succeeded but user see exception, but no longer.
- Internal: Apply standard linter/formatting style

## 2.2.3
- Improve: Tweak icon click area more relaxed. Center position within container element.

## 2.2.2
- Minor Fix: Don't show statusbar icon when Atom started up without active editor.

## 2.2.1
- Just fix CHANGELOG's version number mistake.

## 2.2.0
- Remove `activationCommands`
- Add status-bar icon and text.
  - Indicate enabled status by green color.
  - Clicking icon toggle inline-git-diff on active editor.
  - Can choose style from `icon + text`(default), `icon` or `text`
- Provides service `provideInlineGitDiff` for integration with `narrow:git-diff-all`

## 2.1.0
- Disallow scroll on editorInEditor
- Tune removed diff color

## 2.0.0 First release

- This is first public release

# Preparation phase( 2017.12 )

- Forked and experimenting ideas.
  - [Upstream][upstream]
  - [My experiment][experiment]
- Then changes become too big and incompatible
- So [asked samu about releasing as distinct pkg][ask].

[upstream]: https://github.com/samu/git-diff-details/
[experiment]: https://github.com/t9md/git-diff-details/
[ask]: https://github.com/samu/git-diff-details/issues/75
