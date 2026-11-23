---
name: my-pr-screenshots
description: Put before/after screenshots in a PR or MR body. Use when a change at stage mature has a visible UI result (a new screen, control, layout or theming change), when a PR body needs image URLs, or when asked for before/after shots of a PR.
---

# Screenshots for a PR body

Any change with a visible UI result ships screenshots in the PR body, so a reviewer
does not have to build the branch. A change a screenshot cannot show (screen reader
labels, say) is described in text instead.

**Shoot once, at the final reviewed head.** Not per push or review round. Mockup and
design rounds are a different job and use cheaper sources.

**Capture** with the contract's `Pair tool`. Prefer its web or golden source; use a
device or emulator only for what those cannot show. Never a personal device (its status
bar leaks personal data).

**Every shot is a before/after pair of the same screen in the same state.** Before is
the merge base with the base branch, built in its own worktree, never by checking out
the base in the branch worktree. Is the state new? Before is the screen right after the
same action on the base. Can the base not reach the screen? Before is the screen you
enter it from. Drop pairs that show no change. A pure refactor keeps at most one pair,
captioned "No visual change (refactor)".

The images for Casper's own review go to his private artifact page (`files`), never read
by the model. The PR body is for the reviewer.

## Body layout

No tables: a caption column squeezes the images. One intro line, then per state a bold
one-line caption (the state and what changed) and a paragraph with exactly two images at
`width="49%"`. No `height`, no pixel widths.

```
In each pair, left is before (`main`), right is after.

**Review step: the summary card moves above the list**

<p><img src="<url>" width="49%"> <img src="<url>" width="49%"></p>
```

State the source of the shots (web, golden, emulator) and the widths driven.

## Hosting

Check first for a supported upload: `gh pr create --attach` and `gh pr edit --attach`
(`gh --help`) upload images and append them to the body, rewriting a body reference like
`![alt](./after.png)`. When `gh` has it, use it and skip the rest of this section. Name
files `<state>-before.png` and `<state>-after.png`.

Fallback when `gh` lacks it: a branch `pr-shots-<N>`, one per PR, never merged, never
in a PR diff. Plumbing only, no checkout:

```
b=$(git hash-object -w --no-filters shot.png)
t=$(printf "100644 blob %s\tpr-<N>-<state>-after.png\n" "$b" | git mktree)   # one line per shot
c=$(git commit-tree "$t" -m "shots: PR #<N>")   # -p origin/pr-shots-<N> keeps history
git push origin "${c:?}":"refs/heads/pr-shots-<N>"   # ${c:?} stops on an empty sha (it would delete the branch); quote the colon
```

Embed with a github.com URL, never raw.githubusercontent.com:

```
https://github.com/<owner>/<repo>/blob/pr-shots-<N>/pr-<N>-<state>-after.png?raw=true
```

GitHub proxies external images through camo, which fetches without a login, and the raw
host serves a private repo only with a short-lived token. A github.com URL is loaded with
the viewer's own session, so it works in a private repo.

- The tree replaces the ref's contents, it does not add. `-p` only links history. To add
  shots, `git fetch origin pr-shots-<N>`, start from `git ls-tree origin/pr-shots-<N>` and
  add or replace entries, so `$t` lists every file the body embeds.
- One ref per PR, never a shared `pr-shots` branch: two agents building trees from stale
  bases silently delete each other's images.
- Verify through the API, comparing with the local file size (a `curl` check fails on a
  private repo): `gh api "repos/<owner>/<repo>/contents/<file>?ref=pr-shots-<N>" -q .size`
- Replacing a shot under a name already in a body: a `?v=2` query does not bust the
  cache; the old bytes serve for about 2 minutes. Trust the API size.
- Delete the ref once the PR is merged: `git push origin --delete pr-shots-<N>`.
