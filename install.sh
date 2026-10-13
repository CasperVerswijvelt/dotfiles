#!/usr/bin/env bash
# Symlink the Claude config in this repo into ~/.claude. Idempotent; never deletes.
# Usage: ./install.sh [--dry-run]
set -euo pipefail

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1
SRC="$(cd "$(dirname "$0")" && pwd)/claude"
DEST="$HOME/.claude"
TS="$(date +%Y%m%d%H%M%S)"

run() { echo "  $*"; [ "$DRY" = 1 ] || "$@"; }

link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    echo "ok      $dst"
    return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    echo "backup  $dst -> $dst.bak.$TS"
    run mv "$dst" "$dst.bak.$TS"
  fi
  echo "link    $dst -> $src"
  run ln -s "$src" "$dst"
}

[ "$DRY" = 1 ] && echo "Dry run: nothing is changed."
run mkdir -p "$DEST/skills" "$DEST/agents"

link "$SRC/CLAUDE.md" "$DEST/CLAUDE.md"
link "$SRC/settings.json" "$DEST/settings.json"
for d in "$SRC"/skills/*/; do
  d="${d%/}"
  link "$d" "$DEST/skills/$(basename "$d")"
done
for f in "$SRC"/agents/*.md; do
  link "$f" "$DEST/agents/$(basename "$f")"
done
