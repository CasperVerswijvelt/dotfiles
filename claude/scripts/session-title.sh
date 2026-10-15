#!/usr/bin/env bash
# UserPromptSubmit hook: names an unnamed session "<PROJECT>: <SUMMARY>" from its first
# prompt. The OpenCode plugin opencode/plugins/session-title.ts builds the same title.
set -uo pipefail

# The nested `claude -p` below would run this hook again.
[ -n "${SESSION_TITLE_HOOK:-}" ] && exit 0

input=$(cat)
[ -n "$(jq -r '.session_title // empty' <<<"$input")" ] && exit 0
prompt=$(jq -r '.prompt // empty' <<<"$input" | head -c 2000)
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -z "$prompt" ] && exit 0
[ -d "$cwd" ] || cwd=$PWD

# The main checkout's folder, also from inside a worktree.
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$common" ]; then project=$(basename "$(dirname "$common")"); else project=$(basename "$cwd"); fi

instruction=$(cat "$(dirname "$0")/../session-title.md")
summary=$(SESSION_TITLE_HOOK=1 claude -p --model haiku --tools "" --no-session-persistence \
  "$instruction"$'\n\nMessage:\n'"$prompt" 2>/dev/null)
slug=$(tr '[:lower:]' '[:upper:]' <<<"$summary" | tr -cs 'A-Z0-9' ' ' | awk '{ for (i = 1; i <= NF && i <= 3; i++) printf "%s%s", (i > 1 ? "-" : ""), $i }')
[ -z "$slug" ] && exit 0

title="$(tr '[:lower:]' '[:upper:]' <<<"$project"): $slug"
jq -n --arg t "$title" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", sessionTitle: $t}}'
