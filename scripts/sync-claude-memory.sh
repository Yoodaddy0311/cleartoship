#!/usr/bin/env bash
# Install repo-committed Claude Code memory entries into the host's local
# memory directory so future Claude Code sessions auto-load them.
#
# Usage (from repo root):
#   bash scripts/sync-claude-memory.sh              # safe (skip existing)
#   bash scripts/sync-claude-memory.sh --force      # overwrite existing
#
# Direction:
#   REPO  .claude/memory/*.md
#     ->  ~/.claude/projects/<projectId>/memory/
#
# Strategy: search for any existing `~/.claude/projects/*ClearToShip*` dir
# first. If found (1 match), use it. Otherwise derive a sensible slug from
# the parent of the repo (Claude Code typically uses the directory where the
# user runs `claude` from — usually the project parent, not the repo subdir).
#
# Idempotent. `user_profile.md` is never committed to the repo and is left
# alone in the host's memory dir.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/.claude/memory"

if [[ ! -d "$SRC" ]]; then
  echo "ERROR: $SRC does not exist. Run from a ClearToShip checkout." >&2
  exit 1
fi

HOME_DIR="${HOME:-${USERPROFILE:-}}"
if [[ -z "$HOME_DIR" ]]; then
  echo "ERROR: cannot determine HOME directory." >&2
  exit 1
fi
PROJECTS_DIR="$HOME_DIR/.claude/projects"

# --- Resolve destination ---

# Strategy 1: find an existing project dir containing 'ClearToShip'.
DEST=""
if [[ -d "$PROJECTS_DIR" ]]; then
  mapfile -t matches < <(find "$PROJECTS_DIR" -maxdepth 1 -type d -iname '*ClearToShip*' 2>/dev/null | sort)
  if [[ ${#matches[@]} -eq 1 ]]; then
    DEST="${matches[0]}/memory"
    echo "Resolved existing project dir: ${matches[0]}"
  elif [[ ${#matches[@]} -gt 1 ]]; then
    # Multiple — pick most recently modified.
    DEST="$(ls -1dt "${matches[@]}" | head -n1)/memory"
    echo "Multiple project dirs match; using most recent: $(dirname "$DEST")"
  fi
fi

# Strategy 2: derive a slug from the parent of the repo (where claude is
# usually run). Claude Code's slug pattern (observed on Windows):
#   C:\Users\X\Y     ->  C--Users-X-Y
#   /home/x/y        ->  -home-x-y
if [[ -z "$DEST" ]]; then
  PARENT="$(dirname "$REPO_ROOT")"
  # Convert msys/cygwin /c/... to C:\... shape, then to slug.
  if [[ "$PARENT" =~ ^/([a-zA-Z])/(.*)$ ]]; then
    drive="${BASH_REMATCH[1]^^}"
    tail="${BASH_REMATCH[2]//\//-}"
    slug="$drive--$tail"
  else
    # POSIX path — Claude uses leading '-' then slash->dash.
    slug="-${PARENT//\//-}"
    slug="${slug//--/-}"
  fi
  DEST="$PROJECTS_DIR/$slug/memory"
  echo "No existing project dir; derived slug: $slug"
fi

mkdir -p "$DEST"

# --- Sync ---

FORCE=0
if [[ "${1:-}" == "--force" || "${1:-}" == "-f" ]]; then
  FORCE=1
fi

count_new=0
count_skipped=0
count_overwritten=0

for file in "$SRC"/*.md; do
  name="$(basename "$file")"
  # MEMORY.md is the index — handled separately below to preserve any
  # local-only entries (e.g. user_profile.md links).
  if [[ "$name" == "MEMORY.md" ]]; then
    continue
  fi
  target="$DEST/$name"
  if [[ -f "$target" ]]; then
    if [[ $FORCE -eq 1 ]]; then
      cp "$file" "$target"
      count_overwritten=$((count_overwritten + 1))
    else
      count_skipped=$((count_skipped + 1))
    fi
  else
    cp "$file" "$target"
    count_new=$((count_new + 1))
  fi
done

# --- MEMORY.md special handling ---
#
# If no local MEMORY.md exists yet, copy the repo version. Otherwise leave it
# alone — the user might have appended local-only entries (e.g. a personal
# user_profile.md link) we shouldn't clobber.
#
# When --force is passed we STILL preserve local-only entries: we copy the
# repo index but append any line from the local one that references a file
# missing from the repo MEMORY.md.
memory_target="$DEST/MEMORY.md"
memory_src="$SRC/MEMORY.md"

if [[ ! -f "$memory_target" ]]; then
  cp "$memory_src" "$memory_target"
  echo "Initialised MEMORY.md (no local index existed)."
elif [[ $FORCE -eq 1 ]]; then
  # Detect local-only entry lines: any line starting with `- [`
  # whose target .md file does not appear in the repo memory dir.
  tmp_merged="$(mktemp)"
  cp "$memory_src" "$tmp_merged"

  # Append a marker comment so the user can see the merge.
  printf '\n<!-- locally-preserved entries below (not in repo .claude/memory) -->\n' >> "$tmp_merged"

  preserved=0
  while IFS= read -r line; do
    # Match `- [Title](file.md) — ...` lines.
    if [[ "$line" =~ ^-\ \[.*\]\(([^\)]+\.md)\) ]]; then
      ref="${BASH_REMATCH[1]}"
      if [[ ! -f "$SRC/$ref" ]]; then
        echo "$line" >> "$tmp_merged"
        preserved=$((preserved + 1))
      fi
    fi
  done < "$memory_target"

  if [[ $preserved -gt 0 ]]; then
    mv "$tmp_merged" "$memory_target"
    echo "MEMORY.md: synced repo index + preserved $preserved local-only entr$([ $preserved -eq 1 ] && echo y || echo ies)."
  else
    rm "$tmp_merged"
    cp "$memory_src" "$memory_target"
    echo "MEMORY.md: synced (no local-only entries to preserve)."
  fi
else
  echo "MEMORY.md: left as-is (use --force to refresh the repo entries while preserving local ones)."
fi

echo ""
echo "Sync complete:"
echo "  destination: $DEST"
echo "  new:         $count_new"
echo "  skipped:     $count_skipped  (use --force to overwrite)"
echo "  overwritten: $count_overwritten"
