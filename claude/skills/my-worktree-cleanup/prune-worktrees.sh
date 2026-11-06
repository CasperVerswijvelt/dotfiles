#!/usr/bin/env bash
# List stale git worktrees of a repo, and remove the safe ones on request.
# Usage: prune-worktrees.sh [repo] [--base REF] [--sizes] [--no-fetch] [--min-age-hours N]
#                           [--apply <worktree-path>...]
# Default is list only (it fetches origin unless --no-fetch). Never deletes an unmerged branch.
# --force is used only for a worktree with submodules that passed every check (see below).
set -u
# status must not refresh the index: that would bump the mtime we read as last activity.
export GIT_OPTIONAL_LOCKS=0

REPO="."
BASE=""
SIZES=0
FETCH=1
MINAGE=24
APPLY=0
PATHS=()
if [ $# -gt 0 ]; then case "$1" in --*) ;; *) REPO="$1"; shift ;; esac; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --base|--min-age-hours) [ $# -ge 2 ] || { echo "$1 needs a value" >&2; exit 2; } ;;
  esac
  case "$1" in
    --base) BASE="${2:-}"; shift 2 ;;
    --sizes) SIZES=1; shift ;;
    --no-fetch) FETCH=0; shift ;;
    --min-age-hours) MINAGE="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift; while [ $# -gt 0 ]; do PATHS+=("$1"); shift; done ;;
    *) echo "usage: $0 [repo] [--base REF] [--sizes] [--no-fetch] [--min-age-hours N] [--apply <worktree-path>...]" >&2; exit 2 ;;
  esac
done

REPO="$(cd -P "$REPO" 2>/dev/null && pwd -P)" || { echo "not a directory" >&2; exit 2; }
g() { /usr/bin/git -C "$REPO" "$@"; }
g rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repo: $REPO" >&2; exit 2; }

[ "$FETCH" = 0 ] || GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes' g fetch -q origin 2>/dev/null || echo "note: fetch failed, using local remote refs" >&2

if [ -z "$BASE" ]; then
  BASE="$(g symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  [ -n "$BASE" ] || BASE="origin/main"
fi

HERE="$(/usr/bin/git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$HERE" ] && HERE="$(cd -P "$HERE" && pwd -P)"

mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null; }
fmt() { date -r "$1" '+%Y-%m-%d' 2>/dev/null || date -d "@$1" '+%Y-%m-%d' 2>/dev/null; }

# Parse the porcelain list into parallel arrays (the first block is the main checkout).
WT=(); BR=(); LK=(); PR=(); MAIN=""
path=""; br=""; lk=0; pr=0; n=0
flush() {
  if [ -n "$path" ]; then
    if [ "$n" = 0 ]; then MAIN="$path"; fi
    if [ "$n" -gt 0 ]; then WT+=("$path"); BR+=("$br"); LK+=("$lk"); PR+=("$pr"); fi
    n=$((n + 1))
  fi
  path=""; br=""; lk=0; pr=0
}
while IFS= read -r line; do
  case "$line" in
    "worktree "*) path="${line#worktree }" ;;
    "branch "*) br="${line#branch refs/heads/}" ;;
    locked*) lk=1 ;;
    prunable*) pr=1 ;;
    "") flush ;;
  esac
done < <(g worktree list --porcelain; echo)

# Sets VERDICT, REASON, LAST for worktree index $1.
classify() {
  local i="$1" p="${WT[$1]}" b="${BR[$1]}" gd ts t f out
  VERDICT=keep; REASON=""; LAST="-"; SUB=0
  if [ ! -d "$p" ]; then
    if [ "${PR[$i]}" = 1 ]; then VERDICT=remove; REASON="directory missing"; else REASON="directory missing, not prunable"; fi
    return
  fi
  gd="$(/usr/bin/git -C "$p" rev-parse --absolute-git-dir 2>/dev/null)"
  ts=0
  for f in index HEAD logs/HEAD; do
    t="$(mtime "$gd/$f")"
    [ -n "$t" ] && [ "$t" -gt "$ts" ] && ts="$t"
  done
  [ "$ts" -gt 0 ] && LAST="$(fmt "$ts")"
  case "$p" in "$MAIN"/.claude/worktrees/*)
    case "$b" in claude/*) VERDICT=app; REASON="desktop app session, archive it in the app"; return ;; esac ;;
  esac
  if [ "$p" = "$HERE" ]; then REASON="current worktree"; return; fi
  if [ "${LK[$i]}" = 1 ]; then REASON="locked"; return; fi
  out="$(/usr/bin/git -C "$p" status --porcelain 2>/dev/null | head -n 1)"
  if [ -n "$out" ]; then REASON="dirty"; return; fi
  out="$(/usr/bin/git -C "$p" rev-list HEAD --not --remotes 2>/dev/null | head -n 1)"
  if [ -n "$out" ]; then REASON="unpushed commits"; return; fi
  if /usr/bin/git -C "$p" submodule status --recursive 2>/dev/null | grep -q '^[^-]'; then
    SUB=1
    if ! /usr/bin/git -C "$p" submodule foreach --quiet --recursive \
      'test -z "$(/usr/bin/git status --porcelain)" && test -z "$(/usr/bin/git rev-list HEAD --not --remotes | head -n 1)"' >/dev/null 2>&1; then
      REASON="submodule dirty or unpushed"; return
    fi
  fi
  if [ "$ts" -gt 0 ] && [ $(( $(date +%s) - ts )) -lt $(( MINAGE * 3600 )) ]; then
    REASON="recent (under ${MINAGE}h)"; return
  fi
  VERDICT=remove
  REASON="clean, nothing unpushed"
}

if [ "$APPLY" = 0 ]; then
  nr=0; nk=0; na=0
  i=0
  while [ "$i" -lt "${#WT[@]}" ]; do
    classify "$i"
    extra=""
    if [ "$VERDICT" = remove ] && [ "$SIZES" = 1 ] && [ -d "${WT[$i]}" ]; then
      extra=" size=$(du -sh "${WT[$i]}" 2>/dev/null | cut -f1)"
    fi
    printf '%s\t%s\t%s\t%s\t%s%s\n' "$VERDICT" "${WT[$i]}" "${BR[$i]:-(detached)}" "$LAST" "$REASON" "$extra"
    case "$VERDICT" in remove) nr=$((nr + 1)) ;; app) na=$((na + 1)) ;; *) nk=$((nk + 1)) ;; esac
    i=$((i + 1))
  done
  echo "base=$BASE remove=$nr keep=$nk app=$na"
  exit 0
fi

[ "${#PATHS[@]}" -gt 0 ] || { echo "--apply needs worktree paths" >&2; exit 2; }
rc=0
for want in "${PATHS[@]}"; do
  want_abs="$(cd -P "$want" 2>/dev/null && pwd -P || echo "$want")"
  idx=-1; i=0
  while [ "$i" -lt "${#WT[@]}" ]; do
    [ "${WT[$i]}" = "$want_abs" ] && idx=$i
    i=$((i + 1))
  done
  if [ "$idx" -lt 0 ]; then echo "refused  $want: not a linked worktree of this repo"; rc=1; continue; fi
  classify "$idx"
  if [ "$VERDICT" != remove ]; then echo "refused  $want: $VERDICT ($REASON)"; rc=1; continue; fi
  b="${BR[$idx]}"
  if [ -d "$want_abs" ]; then
    # git refuses to remove a worktree with initialized submodules without --force.
    # Reached only after the worktree and every submodule passed all checks above.
    ff=""; [ "$SUB" = 1 ] && ff="--force"
    if ! g worktree remove $ff "$want_abs"; then
      echo "refused  $want: git worktree remove failed"; rc=1; continue
    fi
  fi
  g worktree prune
  echo "removed  $want"
  if [ -n "$b" ] && g merge-base --is-ancestor "refs/heads/$b" "$BASE" 2>/dev/null; then
    g branch -d "$b" >/dev/null 2>&1 && echo "deleted branch $b" || echo "kept branch $b (git branch -d refused)"
  elif [ -n "$b" ]; then
    echo "kept branch $b (not merged into $BASE)"
  fi
done
g worktree prune
exit $rc
