---
name: my-workspace-setup
description: Set up or audit a Claude account or workspace so the workflow works and startup context stays small. Use on a new machine or account, when a tool or connector seems missing, or when asked what to trim.
---

# Workspace setup

A desktop session starts at about 88k tokens, mostly the app's own prompt. What Casper
controls: each connector costs its tool names (about 15 tokens each) plus its
instructions; each account skill costs its description line every session; CLAUDE.md
files and the memory index load in full.

Data below: 6 Nov 2026, 30 days, 3,226 session files (`claude/scripts/tool-usage.py`).

## Needed

- **Linear**, tracker for work projects (306 calls, 79 sessions). The claude.ai connector
  or the `linear-server` Claude Code MCP server (`https://mcp.linear.app/mcp`), one of them.
- **GitLab** (241 calls, 49 sessions). Claude Code MCP server `GitLab`, HTTP,
  `https://gitlab.com/api/v4/mcp`. The `glab` CLI is also used by the gitlab-mr skill.
  Only one GitLab: with the claude.ai Gitlab connector on too, turn the connector off.
- **Sentry** (186 calls, 13 sessions). Claude Code MCP server `sentry`, HTTP,
  `https://mcp.sentry.dev/mcp`.
- **Built-in browser** of the desktop app (1,333 calls, 30 sessions): nothing to set up.
- **Dotfiles** installed with `install.sh` (settings.json, CLAUDE.md, skills, agents, mods).

## Off

- Claude Docs connector: 1 session in 30 days; plans live in the repo's `docs/plans`.
- Slack connector: 0 calls.
- Duplicate claude.ai Gitlab connector (see Needed).
- claude.ai account skills with 0 calls: docx, pptx, xlsx, pdf, morning, google-workspace,
  and `docs` (goes with Claude Docs). Only Casper can switch these off, in claude.ai
  settings, under skills.
- Plugins superpowers, mattpocock-skills, chrome-devtools-mcp: off via `settings.json`.
- Claude in Chrome (3 calls, 2 sessions): leave on, it costs only tool names.

## Steps

1. Check the `~/.claude` links (settings.json, CLAUDE.md, skills) point into dotfiles.
   If not, run `install.sh`.
2. In the desktop app, call `mcp__ccd_connectors__session_connectors_status` (ToolSearch
   if deferred). Turn off the claude.ai connectors from Off with
   `mcp__ccd_connectors__set_session_connector_enabled`. Outside the desktop app, tell
   Casper to do it in claude.ai connector settings.
3. Check `~/.claude.json` `mcpServers` (global and per project) has GitLab and sentry.
   If one is missing, tell Casper and give the `claude mcp add` command with the URL
   above. Never print other contents of that file; it can hold secrets.
4. Give Casper the manual list: the claude.ai account skills to switch off.
5. Optional: run `python3 -I claude/scripts/tool-usage.py` (`--days N`). claude.ai
   connectors appear under a per-account UUID server name, not "Linear". Map each UUID
   to a name with the connector status tool; never hardcode one. A connector unused for
   30 days moves to Off; one called often moves to Needed. Updating the lists is a
   dotfiles commit.
