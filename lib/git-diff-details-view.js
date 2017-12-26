/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let AtomGitDiffDetailsView;
const {View} = require('atom-space-pen-views');
const {Range, Point} = require('atom');
const _ = require('underscore-plus');
const DiffDetailsDataManager = require('./data-manager');
const Housekeeping = require('./housekeeping');

module.exports = (AtomGitDiffDetailsView = (function() {
  AtomGitDiffDetailsView = class AtomGitDiffDetailsView extends View {
    constructor(...args) {
      this.notifyContentsModified = this.notifyContentsModified.bind(this);
      super(...args);
    }

    static initClass() {
      Housekeeping.includeInto(this);
    }

    static content() {
      return this.div({class: "git-diff-details-outer"}, () => {
        return this.div({class: "git-diff-details-main-panel", outlet: "mainPanel"}, () => {
          return this.div({class: "editor git-diff-editor", outlet: "contents"});
        });
      });
    }

    initialize(editor) {
      this.editor = editor;
      this.editorView = atom.views.getView(this.editor);

      this.diffDetailsDataManager = new DiffDetailsDataManager();

      this.initializeHousekeeping();
      this.preventFocusOut();

      this.diffEditor = atom.workspace.buildTextEditor({lineNumberGutterVisible: false, scrollPastEnd: false});
      this.contents.html(atom.views.getView(this.diffEditor));

      this.markers = [];

      this.showDiffDetails = false;
      this.lineDiffDetails = null;

      return this.updateCurrentRow();
    }

    preventFocusOut() {
      return this.mainPanel.on('mousedown', () => false);
    }

    getActiveTextEditor() {
      return atom.workspace.getActiveTextEditor();
    }

    updateCurrentRow() {
      const newCurrentRow = __guard__(__guard__(this.getActiveTextEditor(), x1 => x1.getCursorBufferPosition()), x => x.row) + 1;
      if (newCurrentRow !== this.currentRow) {
        this.currentRow = newCurrentRow;
        return true;
      }
      return false;
    }

    notifyContentsModified() {
      if (this.editor.isDestroyed()) { return; }
      this.diffDetailsDataManager.invalidate(this.repositoryForPath(this.editor.getPath()),
                                         this.editor.getPath(),
                                         this.editor.getText());
      if (this.showDiffDetails) {
        return this.updateDiffDetailsDisplay();
      }
    }

    updateDiffDetails() {
      this.diffDetailsDataManager.invalidatePreviousSelectedHunk();
      this.updateCurrentRow();
      return this.updateDiffDetailsDisplay();
    }

    toggleShowDiffDetails() {
      this.showDiffDetails = !this.showDiffDetails;
      return this.updateDiffDetails();
    }

    closeDiffDetails() {
      this.showDiffDetails = false;
      return this.updateDiffDetails();
    }

    notifyChangeCursorPosition() {
      if (this.showDiffDetails) {
        const currentRowChanged = this.updateCurrentRow();
        if (currentRowChanged) { return this.updateDiffDetailsDisplay(); }
      }
    }

    copy() {
      const {selectedHunk} = this.diffDetailsDataManager.getSelectedHunk(this.currentRow);
      if (selectedHunk != null) {
        atom.clipboard.write(selectedHunk.oldString);
        if (atom.config.get('git-diff-details.closeAfterCopy')) { return this.closeDiffDetails(); }
      }
    }

    undo() {
      let buffer;
      const {selectedHunk} = this.diffDetailsDataManager.getSelectedHunk(this.currentRow);

      if ((selectedHunk != null) && (buffer = this.editor.getBuffer())) {
        if (selectedHunk.kind === "m") {
          buffer.setTextInRange([[selectedHunk.start - 1, 0], [selectedHunk.end, 0]], selectedHunk.oldString);
        } else {
          buffer.insert([selectedHunk.start, 0], selectedHunk.oldString);
        }
        if (!atom.config.get('git-diff-details.keepViewToggled')) { return this.closeDiffDetails(); }
      }
    }

    destroyDecoration() {
      for (let marker of this.markers) {
        marker.destroy();
      }
      return this.markers = [];
    }

    decorateLines(editor, start, end, type) {
      const range = new Range(new Point(start, 0), new Point(end, 0));
      const marker = editor.markBufferRange(range);
      editor.decorateMarker(marker, {type: 'line', class: `git-diff-details-${type}`});
      return this.markers.push(marker);
    }

    decorateWords(editor, start, words, type) {
      if (!words) { return; }
      return (() => {
        const result = [];
        for (let word of words) {
          if (word.changed) {
            const row = start + word.offsetRow;
            const range = new Range(new Point(row, word.startCol), new Point(row, word.endCol));
            const marker = editor.markBufferRange(range);
            editor.decorateMarker(marker, {type: 'highlight', class: `git-diff-details-${type}`});
            result.push(this.markers.push(marker));
          }
        }
        return result;
      })();
    }

    display(selectedHunk) {
      this.destroyDecoration();

      const classPostfix =
        atom.config.get('git-diff-details.enableSyntaxHighlighting') ?
          "highlighted"
        : "flat";

      if (selectedHunk.kind === "m") {
        this.decorateLines(this.editor, selectedHunk.start - 1, selectedHunk.end, `new-${classPostfix}`);
        if (atom.config.get('git-diff-details.showWordDiffs')) {
          this.decorateWords(this.editor, selectedHunk.start - 1, selectedHunk.newWords, `new-${classPostfix}`);
        }
      }

      const range = new Range(new Point(selectedHunk.end - 1, 0), new Point(selectedHunk.end - 1, 0));
      const marker = this.editor.markBufferRange(range);
      this.editor.decorateMarker(marker, {type: 'block', position: 'after', item: this});
      this.markers.push(marker);

      this.diffEditor.setGrammar(__guard__(this.getActiveTextEditor(), x => x.getGrammar()));
      this.diffEditor.setText(selectedHunk.oldString.replace(/[\r\n]+$/g, ""));
      this.decorateLines(this.diffEditor, 0, selectedHunk.oldLines.length, `old-${classPostfix}`);
      if (atom.config.get('git-diff-details.showWordDiffs')) {
        return this.decorateWords(this.diffEditor, 0, selectedHunk.oldWords, `old-${classPostfix}`);
      }
    }

    updateDiffDetailsDisplay() {
      if (this.showDiffDetails) {
        const {selectedHunk, isDifferent} = this.diffDetailsDataManager.getSelectedHunk(this.currentRow);

        if (selectedHunk != null) {
          if (!isDifferent) { return; }
          this.display(selectedHunk);
          return;
        } else {
          if (!atom.config.get('git-diff-details.keepViewToggled')) { this.closeDiffDetails(); }
        }

        this.previousSelectedHunk = selectedHunk;
      }

      this.destroyDecoration();
    }
  };
  AtomGitDiffDetailsView.initClass();
  return AtomGitDiffDetailsView;
})());

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}