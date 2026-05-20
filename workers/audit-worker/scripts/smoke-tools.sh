#!/usr/bin/env bash
# smoke-tools.sh — Phase 0 tooling probe.
#
# Used in two places:
#   1. Build time — Dockerfile RUN gates the image build, so a broken
#      tooling install fails the build (not the prod /healthz).
#   2. Post-deploy — operator can rerun against a live container to
#      confirm tooling survived a deploy.
#
# Phase 0 surface: git, chromium.
# Phase 1 will extend this to: semgrep, osv-scanner.
#
# Exit 0 = all required tools found. Exit 1 = at least one missing.

set -euo pipefail

fail=0

check_git() {
  if ! git --version >/dev/null 2>&1; then
    echo "[smoke] FAIL: git not found in PATH"
    fail=1
    return
  fi
  echo "[smoke] OK:   $(git --version)"
}

check_chromium() {
  # CHROME_PATH must be set (the audit-worker's lighthouse-profile
  # step reads it). The pipeline step would fail-closed otherwise.
  if [[ -z "${CHROME_PATH:-}" ]]; then
    echo "[smoke] FAIL: \$CHROME_PATH is unset"
    fail=1
    return
  fi
  if [[ ! -x "$CHROME_PATH" ]]; then
    echo "[smoke] FAIL: \$CHROME_PATH='$CHROME_PATH' is not an executable"
    fail=1
    return
  fi
  if ! "$CHROME_PATH" --version >/dev/null 2>&1; then
    echo "[smoke] FAIL: '$CHROME_PATH --version' exited non-zero"
    fail=1
    return
  fi
  echo "[smoke] OK:   $("$CHROME_PATH" --version)"
}

check_git
check_chromium

if [[ "$fail" != "0" ]]; then
  echo "[smoke] One or more required tools missing. See errors above."
  exit 1
fi

echo "[smoke] Phase 0 surface OK (git + chromium)."
exit 0
