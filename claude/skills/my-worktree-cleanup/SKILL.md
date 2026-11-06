---
name: my-worktree-cleanup
description: List and remove stale git worktrees of a repo. Use when Casper asks to clean up, prune or list worktrees, says worktrees pile up or take disk space, or invokes /my-worktree-cleanup. An agent also runs it at plan close for the worktrees it created.
---

# Worktree cleanup

`prune-worktrees.sh` (beside this file) lists a repo's worktrees and removes the safe ones.
Generic: any git repo. It never uses `git branch -D`, and `--force` only for a worktree
with submodules that passed every check.

List mode runs `git fetch origin` (never prompts; `--no-fetch` skips it) and changes nothing else.

**Warning:** removing a worktree also deletes its ignored files (`.env`, copied generated
code, build output). Before approving, think whether anything hand-made lives there that
exists nowhere else.

## Steps

1. List (read only): `~/.claude/skills/my-worktree-cleanup/prune-worktrees.sh <repo>`.
   Add `--sizes` for sizes of `remove` rows (slow on big trees), `--base <ref>` to
   override the base (default `origin/HEAD`, else `origin/main`), `--min-age-hours N`
   (default 24).
   One row per worktree: verdict, path, branch, last activity, reason. Then totals.
2. Show Casper the `remove` rows and a one-line summary of the keeps.
3. Remove only what he approves: `prune-worktrees.sh <repo> --apply <path>...`. Each path is
   re-checked, removed, its branch deleted only if merged into the base, then
   `git worktree prune` runs.

An agent cleaning up after its own plan applies to worktrees it created itself without asking.

## Verdicts

- `remove`: clean (no tracked changes, no untracked files), no commit missing from the
  remote (merged, pushed or detached), not locked, not the current worktree, any submodules clean and pushed too, and no
  activity in the last 24 h (newest mtime of index, HEAD, reflog).
- `keep`: anything else; the reason says dirty, unpushed commits, locked, current, recent or submodule.
- `app`: a desktop app session (under `<repo>/.claude/worktrees`, branch `claude/*`). Never
  removed here; archiving the session in the app cleans it (Settings > Storage).

## Care

A pushed branch may still belong to a running session. Check the last activity column:
a recent date means probably in use. When in doubt, keep.
