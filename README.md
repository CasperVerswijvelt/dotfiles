# dotfiles

My shared config for Claude Code and OpenCode: one workflow, kept in one repo and
symlinked into place.

## Contents

| Path | What |
|---|---|
| `claude/` | Claude Code config: `CLAUDE.md`, `settings.json`, `agents/`, `skills/`, `mods/`, `contract-template.md`, `scripts/`. |
| `opencode/` | OpenCode config (`opencode.json`) and plugins. |
| `.githooks/` | `post-commit` and `post-merge` hooks that run `install.sh --quiet` (links and OpenCode agents stay in sync), and a `pre-commit` hook that validates and tests the `agent-tree` mod. |
| `install.sh` | Symlinks everything into `~/.claude` and `~/.config/opencode`. |

## Install

Clone the repo, then preview and run the installer:

```sh
git clone <this repo> ~/dotfiles
~/dotfiles/install.sh --dry-run
~/dotfiles/install.sh
```

The installer:

- links `CLAUDE.md`, `settings.json`, each skill and each agent into `~/.claude`
- links `claude/mods` as `~/.claude/mods`; `settings.json` loads `agent-tree` from there (`CLAUDE_CODE_PLUGIN_DIRS`, `~` is expanded, `$HOME` is not)
- links the repo to `~/dotfiles` if it lives elsewhere, since the config refers to that path
- links `CLAUDE.md` as `~/.config/opencode/AGENTS.md`, plus `opencode.json` and `plugins/`
- sets `core.hooksPath` to `.githooks` and generates the OpenCode agents

It is idempotent and never deletes your own files. Links are compared by resolved path,
so a link to the same file under another path form is retargeted silently. A real file or
directory in the way is moved to `~/.dotfiles-backup/<timestamp>/<path relative to ~>`,
never next to the original. That includes your existing `~/.claude/settings.json`, so copy
over any settings you want to keep into `claude/settings.json` first. It prunes stale
symlinks into this repo (renamed or deleted skills and agents) from `~/.claude`,
`~/.claude/skills`, `~/.claude/agents` and `~/.config/opencode`, and leaves every other
link alone. It only regenerates the OpenCode agent files it generated itself. The git
hooks run `install.sh --quiet` after every commit and pull, so a new skill appears without
a manual run. Because that file
is now a symlink, changes made through `/config` land in this repo. Commit them, or the
startup pull stops fast-forwarding.

## Claude Code workflow

How I use it day to day: [`claude/README.md`](claude/README.md).

- **Roles** (`claude/agents/`): `my-orchestrator` (Opus) owns one plan or PR,
  `my-implementer` (Sonnet) does one scoped task, `my-reviewer` (Sonnet, judge on
  Opus) reviews read-only, `my-scout` (Haiku) does fact lookups. The main thread decides and delegates.
- **Skills** (`claude/skills/`): `my-feature-flow` (branch to PR), `my-review` (review and
  grading), `my-repo-audit`, `my-consistency-sweep`, `my-decision-log`, `my-open-items`, `my-retro` (session retrospective, `claude/tools/retro/`).
- **Workflow contract**: each project can add a `## Workflow contract` section to its own
  `CLAUDE.md`: stage, gate, base branch, merge policy and so on. The template is
  `claude/contract-template.md`. Without one, the project is treated as mature.
- **Gates as git hooks**: the contract names the checks and the hooks that run them
  (pre-commit for the fast gate, pre-push for the full one), so they cannot be skipped.
- **Startup pull**: a `SessionStart` hook in `settings.json` runs
  `git -C ~/dotfiles pull --ff-only`, so every machine stays current.
- **Session titles**: a `UserPromptSubmit` hook (`claude/scripts/session-title.sh`) names
  a session `PROJECT: THREE-WORD-SLUG` from its first prompt, using Haiku. Outside a git
  repo there is no `PROJECT:` prefix. The instruction lives in `claude/session-title.md`.
- **Status line**: `claude/scripts/status-line.sh` shows the model and context usage.

## OpenCode

OpenCode reuses the same config without copies:

- it reads `~/.claude/skills` itself
- it gets `CLAUDE.md` as its global `AGENTS.md`
- `claude/scripts/opencode-agents.sh` translates the Claude agents into
  `~/.config/opencode/agents`. The git hooks rerun it after every commit and pull, so edit
  only the Claude agents.
- `opencode/plugins/claude-md.ts` loads each project's `CLAUDE.md`
- `opencode/plugins/session-title.ts` builds the same session titles as the Claude hook
- `opencode.json` also configures a Linear MCP server and model overrides for the built-in
  `explore` (Haiku) and `general` (Sonnet) agents.
- `opencode.json` routes the Anthropic provider through a local proxy and loads the
  `opencode-with-claude` plugin, so adjust or remove that for your own setup.
