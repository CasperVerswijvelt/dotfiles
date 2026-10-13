# dotfiles

Personal config, private.

- `claude/`: Claude Code workflow used in every project: `CLAUDE.md`, `settings.json`,
  agents and `my-*` skills. Projects opt in to details through a `## Workflow contract`
  section (`claude/contract-template.md`).
- `install.sh`: symlinks `claude/` into `~/.claude`. Idempotent, backs up anything it
  would replace to `<name>.bak.<timestamp>`, never deletes. Try `./install.sh --dry-run`
  first.

Installing replaces `~/.claude/settings.json` with the shared one (the old file is kept
as a backup). Carry over the settings you want into `claude/settings.json` first. Since it
is a symlink, `/config` changes land in this repo: commit them or the startup pull stops
fast-forwarding.
