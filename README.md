# dotfiles

Personal config, private.

- `claude/`: Claude Code workflow used in every project: `CLAUDE.md`, `settings.json`,
  agents and `my-*` skills. Projects opt in to details through a `## Workflow contract`
  section (`claude/contract-template.md`).
- `install.sh`: symlinks `claude/` into `~/.claude`. Idempotent, backs up anything it
  would replace to `<name>.bak.<timestamp>`, never deletes. Try `./install.sh --dry-run`
  first.
- OpenCode shares the same config with no copies: it reads `~/.claude/skills` itself,
  gets `CLAUDE.md` as `~/.config/opencode/AGENTS.md`, and gets agents generated into
  `~/.config/opencode/agents` by `claude/scripts/opencode-agents.sh`. The git hooks in
  `.githooks` regenerate them after every pull and commit, so edit only the Claude agents.
- `opencode/`: OpenCode's global config and plugins, linked into `~/.config/opencode`.
  `plugins/claude-md.ts` loads each project's `CLAUDE.md`, since OpenCode only reads
  `AGENTS.md` on its own.

Installing replaces `~/.claude/settings.json` with the shared one (the old file is kept
as a backup). Carry over the settings you want into `claude/settings.json` first. Since it
is a symlink, `/config` changes land in this repo: commit them or the startup pull stops
fast-forwarding.
