// English UI text. Keys and {placeholders} mirror ko.ts.

import type { Key } from "./ko";

export const en: Record<Key, string> = {
  // common
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.closeEsc": "Close (Esc)",
  "common.none": "None",
  "common.noMessage": "(no message)",

  // top bar
  "top.emptyRepo": "Empty repository",
  "top.demo": "Demo mode",
  "top.fetch.title": "Download new commits from the remote only (working tree untouched)",
  "top.pull.title": "Download remote commits and apply them to the current branch",
  "top.push.title": "Upload your commits to the remote",
  "top.push.first": "First push: create the branch on the remote and track it",
  "top.commit": "＋ Commit",
  "top.refresh": "Refresh",
  "top.sparkle": "Sparkle effects",
  "top.settings": "Settings and shortcuts (?)",
  "top.settings.label": "Settings",
  "progress.Enumerating objects": "Listing",
  "progress.Counting objects": "Counting",
  "progress.Compressing objects": "Compressing",
  "progress.Writing objects": "Uploading",
  "progress.Receiving objects": "Receiving",
  "progress.Resolving deltas": "Resolving",
  "progress.Updating files": "Updating files",

  // sidebar
  "side.search": "Find branch",
  "side.local": "Branches",
  "side.remote": "Remotes",
  "side.tag": "Tags",
  "side.stash": "Stashes",
  "side.addRemote": "Add remote",
  "side.hint.tag": "Click: focus · Right-click: menu",
  "side.hint.branch": "Click: focus · Double-click: checkout · Right-click: menu",

  // search
  "search.placeholder": "Message · author · SHA · branch",
  "search.prev": "Previous (Shift+Enter)",
  "search.next": "Next (Enter)",

  // merge dialog
  "merge.title": "Merge",
  "merge.body": "Joins the checkpoints of <b>{source}</b> onto <b>{target}</b> with a new merge commit.",
  "merge.switch": "Checks out {target} first, then merges.",
  "merge.dirty": "You have {n} uncommitted changes. Git may refuse the merge if they conflict.",
  "merge.go": "Merge",
  "merge.going": "Merging…",

  // changed files list
  "files.changed": "Changed files",
  "files.openDiff": "View diff",

  // graph
  "graph.loadMore": "⋯ Load older history",
  "graph.run": "{n} commits · click to expand",
  "graph.pending": "Merge pending · commit after resolving conflicts",
  "graph.commit": "Commit {sha}",
  "graph.aria": "Commit graph. Arrows move between commits, Enter opens the menu, + - 0 H zoom, fit and go to HEAD",
  "graph.hint":
    "Drag to pan · ⌘/Ctrl+wheel to zoom · ⌘/Ctrl+F to search · drop a dot on another branch tip to merge · Shift+drag to reorder",
  "graph.hint.truncated": " · showing the latest {n}",
  "drag.merge:idle": "Drop on the branch tip to merge into · ⌥/Alt: cherry-pick · Shift: reorder",
  "drag.merge:ok": "Release to merge",
  "drag.merge:bad": "You can only drop on a branch tip (checkpoint)",
  "drag.pick:idle": "Drop on the branch tip to copy this commit to",
  "drag.pick:ok": "Release to copy (cherry-pick) this commit",
  "drag.pick:bad": "You can only drop on a branch tip (checkpoint)",
  "drag.move:idle": "Drop on another commit of the current branch to move it right after",
  "drag.move:ok": "Release to open the reorder sheet",
  "drag.move:bad": "You can only move within the straight run of the current branch",

  // settings
  "settings.title": "Settings",
  "settings.screen": "Display",
  "settings.language": "Language",
  "settings.language.system": "Follow system",
  "settings.sparkle": "Sparkle effects (light flowing along lines, bursts on new commits)",
  "settings.page": "Commits to load at once",
  "settings.pageN": "{n}",
  "settings.gitPath": "Executable",
  "settings.gitPath.placeholder": "Leave empty to use git from PATH",
  "settings.gitPath.apply": "Check and apply",
  "settings.gitPath.hint":
    "On macOS, apps launched from Finder may not see your terminal PATH. Set it directly, e.g. <code>/opt/homebrew/bin/git</code>.",
  "settings.shortcuts": "Shortcuts",

  // shortcut table
  "keys.graph": "Graph",
  "keys.search": "Search",
  "keys.commit": "Commits and changes",
  "keys.app": "App",
  "keys.wheel": "Wheel",
  "keys.wheel.what": "Move along the timeline",
  "keys.zoom": "⌘/Ctrl + wheel, pinch",
  "keys.zoom.what": "Zoom around the cursor",
  "keys.shiftWheel": "Shift + wheel",
  "keys.shiftWheel.what": "Move up and down",
  "keys.plusMinus.what": "Zoom in / out",
  "keys.fit.what": "Fit all",
  "keys.head.what": "Go to HEAD",
  "keys.dragMerge": "Drag a dot onto a branch tip",
  "keys.dragMerge.what": "Merge",
  "keys.altDrag": "⌥/Alt + drag",
  "keys.shiftDrag": "Shift + drag",
  "keys.shiftDrag.what": "Reorder commits on the current branch (rebase)",
  "keys.rightClick": "Right-click",
  "keys.rightClick.what": "Commit and branch menu",
  "keys.leftRight.what": "Select previous (parent) / next (child) commit",
  "keys.upDown.what": "Nearest commit on the lane above / below",
  "keys.enter.what": "Menu for the selected commit",
  "keys.esc.what": "Clear selection",
  "keys.find.what": "Search commits",
  "keys.findStep.what": "Next / previous result",
  "keys.commitKey.what": "Commit (while writing)",
  "keys.files.what": "Previous / next file in the diff",
  "keys.lines": "Click line numbers, Shift + click",
  "keys.lines.what": "Pick individual lines (staging)",
  "keys.help.what": "Settings and shortcuts",
};
