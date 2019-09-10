/* (C) 2019 Alberto Pianon pianon@array.eu
This code has been mostly taken and adapted from file
lib/git-history-view.coffee of 'git-history' package
https://github.com/jakesankey/git-history
(C) 2014-2017 Jake Sankey
*/

const path = require("path");
const fs = require("fs");
const Diff = require('./diff');
const { execSync } = require('child_process');
const {$$, SelectListView } = require("atom-space-pen-views");
const { BufferedProcess } = require("atom");

const noLinebrkCmd = function(command) {
  return String(execSync(command)).replace(/\r?\n|\r/g, "")
}
const currentGitUserName = noLinebrkCmd("git config user.name");
const currentGitUserEmail = noLinebrkCmd("git config user.email");

class GitHistoryView extends SelectListView {

  initialize(inlineGitDiff) {
    this.inlineGitDiff = inlineGitDiff;
    this.editor = inlineGitDiff.editor;
    this.file = this.editor.getPath();
    super.initialize(this.file);
    if (this.file) {
      return this.show();
    }
  };

  show() {
    this.setLoading("Loading history for " + (path.basename(this.file)));
    if (this.panel == null) {
      this.panel = atom.workspace.addModalPanel({
        item: this
      });
    }
    this.panel.show();
    this.storeFocusedElement();
    this._loadLogData();
    return this.focusFilterEditor();
  };

  cancel() {
    var ref1;
    super.cancel();
    if ((ref1 = this.panel) != null) {
      ref1.destroy();
    }
    return this.panel = null;
  };

  _loadLogData() {
    var exit, logItems, stdout, preselectedItemHash, preselectedItemView;
    logItems = [];
    preselectedItemHash = null;
    preselectedItemView = null;
    stdout = function(output) {
      var author, authorEscaped, commit, commitAltered, commits, freeTextMatches, i, item, j, len, len1, message, messageEscaped, ref1, results;
      output = output.replace('\n', '');
      commits = output.match(/{"author": ".*?","author_email": ".*?","relativeDate": ".*?","fullDate": ".*?","message": ".*?","hash": "[a-f0-9]*?"},/g);
      output = '';
      if (commits != null) {
        for (i = 0, len = commits.length; i < len; i++) {
          commit = commits[i];
          freeTextMatches = commit.match(/{"author": "(.*?)","author_email": ".*?","relativeDate": ".*?","fullDate": ".*?","message": "(.*)","hash": "[a-f0-9]*?"},/);
          author = freeTextMatches[1];
          authorEscaped = author.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
          commitAltered = commit.replace(author, authorEscaped);
          message = freeTextMatches[2];
          messageEscaped = message.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
          output += commitAltered.replace(message, messageEscaped);
        }
      }
      if ((output != null ? output.substring(output.length - 1) : void 0) === ",") {
        output = output.substring(0, output.length - 1);
      }
      ref1 = JSON.parse("[" + output + "]");
      results = [];
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        item = ref1[j];
        if ((item.author == currentGitUserName || item.author_email == currentGitUserEmail) && !preselectedItemHash) {
          preselectedItemHash = item.hash // pick up the last commit from current git user
        }
        results.push(logItems.push(item));
      }
      return results;
    };
    exit = (function(_this) {
      return function(code) {
        if (code === 0 && logItems.length !== 0) {
          _this.setItems(logItems)
          if (preselectedItemHash && _this._preselectLastCommitFromCurrentGitUser()) {
            preselectedItemView = _this.list.find('[data-hash=' + preselectedItemHash + ']');
            if (preselectedItemView) {
              _this.selectItemView(preselectedItemView);
            }
          }
          return true;
        } else {
          return _this.setError("No history found for " + (path.basename(_this.file)));
        }
      };
    })(this);
    return this._fetchFileHistory(stdout, exit);
  };

  _fetchFileHistory(stdout, exit) {
    var format;
    format = "{\"author\": \"%an\",\"author_email\": \"%ae\",\"relativeDate\": \"%cr\",\"fullDate\": \"%ad\",\"message\": \"%s\",\"hash\": \"%h\"},";
    return new BufferedProcess({
      command: "git",
      args: ["-C", path.dirname(this.file), "log", "--max-count=" + (this._getMaxNumberOfCommits()), "--pretty=format:" + format, "--topo-order", "--date=local", "--follow", this.file],
      stdout: stdout,
      exit: exit
    });
  };

  _getMaxNumberOfCommits() {
    return atom.config.get("inline-git-diff.maxCommitsToShowInGitHistory");
  };

  _preselectLastCommitFromCurrentGitUser() {
    return atom.config.get("inline-git-diff.preselectLastCommitFromCurrentGitUser")
  }

  getFilterKey() {
    return "message";
  };

  viewForItem(logItem) {
    var fileName;
    fileName = path.basename(this.file);
    return $$(function() {
      return this.li({
        "data-hash": logItem.hash,
        "class": "two-lines"
      }, (function(_this) {
        return function() {
          _this.div({
            "class": "pull-right"
          }, function() {
            return _this.span({
              "class": "secondary-line"
            }, "" + logItem.hash);
          });
          _this.span({
            "class": "primary-line"
          }, logItem.message);
          _this.div({
            "class": "secondary-line"
          }, logItem.author + " <" + logItem.author_email + "> authored " + logItem.relativeDate);
          return _this.div({
            "class": "secondary-line"
          }, "" + logItem.fullDate);
        };
      })(this));
    });
  };

  confirmed(logItem) {
     Diff.init(this.editor.buffer, logItem.hash)
     this.inlineGitDiff.enabled = true
     this.inlineGitDiff.editor.element.classList.toggle('has-inline-git-diff', true)
     this.inlineGitDiff.updateStatusBar()
     this.inlineGitDiff.refreshDiff()
     this.cancel()
  };
};

module.exports = GitHistoryView;
