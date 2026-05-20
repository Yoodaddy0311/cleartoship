#!/usr/bin/env bash
# smoke-tools.sh — Phase 1 tooling probe.
#
# Used in two places:
#   1. Build time — Dockerfile RUN gates the image build, so a broken
#      tooling install fails the build (not the prod /healthz).
#   2. Post-deploy — operator can rerun against a live container to
#      confirm tooling survived a deploy.
#
# Phase 0 surface: git, chromium.
# Phase 1 surface: + semgrep, osv-scanner.
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

check_semgrep() {
  if ! command -v semgrep >/dev/null 2>&1; then
    echo "[smoke] FAIL: semgrep not found in PATH"
    fail=1
    return
  fi
  # semgrep --version prints e.g. "1.86.0" to stdout. Capture single line.
  version=$(semgrep --version 2>/dev/null | head -n1 || true)
  if [[ -z "$version" ]]; then
    echo "[smoke] FAIL: 'semgrep --version' produced no output"
    fail=1
    return
  fi
  echo "[smoke] OK:   semgrep $version"
}

check_osv_scanner() {
  if ! command -v osv-scanner >/dev/null 2>&1; then
    echo "[smoke] FAIL: osv-scanner not found in PATH"
    fail=1
    return
  fi
  # osv-scanner --version prints a multi-line block; first line is the version.
  version=$(osv-scanner --version 2>/dev/null | head -n1 || true)
  if [[ -z "$version" ]]; then
    echo "[smoke] FAIL: 'osv-scanner --version' produced no output"
    fail=1
    return
  fi
  echo "[smoke] OK:   $version"
}

check_git
check_chromium
check_semgrep
check_osv_scanner

if [[ "$fail" != "0" ]]; then
  echo "[smoke] One or more required tools missing. See errors above."
  exit 1
fi

echo "[smoke] Phase 1 surface OK (git + chromium + semgrep + osv-scanner)."
exit 0
