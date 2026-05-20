# Install repo-committed Claude Code memory entries into the host's local
# memory directory so future Claude Code sessions auto-load them.
#
# Usage (from repo root):
#   pwsh scripts/sync-claude-memory.ps1            # safe (skip existing)
#   pwsh scripts/sync-claude-memory.ps1 -Force     # overwrite existing
#
# Direction:
#   REPO  .claude\memory\*.md
#     ->  $env:USERPROFILE\.claude\projects\<projectId>\memory\
#
# Idempotent. user_profile.md is never touched (personal-only memory; not
# in the repo copy by design).

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Src = Join-Path $RepoRoot '.claude\memory'

if (-not (Test-Path $Src)) {
    Write-Error "Source directory not found: $Src. Run from a ClearToShip checkout."
}

# Build Claude Code's project slug from the absolute repo path.
# Convention observed in C:\Users\HeechangLee\.claude\projects\C--Users-HeechangLee-Desktop-ClearToShip\:
#   "C:\Users\HeechangLee\Desktop\ClearToShip" -> "C--Users-HeechangLee-Desktop-ClearToShip"
# i.e. drive letter + '--' + rest with '\' -> '-'.
$pathForSlug = $RepoRoot
$drive = if ($pathForSlug -match '^([A-Z]):') { $matches[1] } else { 'C' }
$tail  = $pathForSlug -replace '^[A-Z]:\\', '' -replace '\\', '-'
$slug  = "$drive--$tail"

$ProjectsDir = Join-Path $env:USERPROFILE '.claude\projects'
$Dest = Join-Path $ProjectsDir "$slug\memory"

# Fallback: if the derived slug dir doesn't exist, try to find any project dir
# that contains 'ClearToShip' in its name (handles minor casing/path drift).
if (-not (Test-Path $Dest)) {
    if (Test-Path $ProjectsDir) {
        $candidates = Get-ChildItem $ProjectsDir -Directory |
            Where-Object { $_.Name -like '*ClearToShip*' }
        if ($candidates.Count -eq 1) {
            $Dest = Join-Path $candidates[0].FullName 'memory'
            Write-Host "Resolved project dir via fallback: $Dest"
        }
    }
}

# Create destination if it still doesn't exist.
if (-not (Test-Path $Dest)) {
    Write-Host "NOTE: project memory dir not found. Creating $Dest"
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
}

$new = 0
$skipped = 0
$overwritten = 0

# Skip MEMORY.md in this loop — index is handled below to preserve local-only entries.
Get-ChildItem -Path $Src -Filter '*.md' | Where-Object { $_.Name -ne 'MEMORY.md' } | ForEach-Object {
    $target = Join-Path $Dest $_.Name
    if (Test-Path $target) {
        if ($Force) {
            Copy-Item $_.FullName $target -Force
            $overwritten++
        } else {
            $skipped++
        }
    } else {
        Copy-Item $_.FullName $target
        $new++
    }
}

# --- MEMORY.md special handling ---
#
# Preserve local-only entries (e.g. user_profile.md link) when -Force is
# passed: we copy the repo index, then append any line from the local index
# whose referenced .md is missing from the repo memory dir.

$memoryTarget = Join-Path $Dest 'MEMORY.md'
$memorySrc    = Join-Path $Src  'MEMORY.md'

if (-not (Test-Path $memoryTarget)) {
    Copy-Item $memorySrc $memoryTarget
    Write-Host "Initialised MEMORY.md (no local index existed)."
}
elseif ($Force) {
    # Capture local-only lines BEFORE overwriting.
    $localLines = Get-Content $memoryTarget
    $preserved = @()
    foreach ($line in $localLines) {
        if ($line -match '^-\s+\[.*?\]\(([^)]+\.md)\)') {
            $ref = $matches[1]
            $repoEntry = Join-Path $Src $ref
            if (-not (Test-Path $repoEntry)) {
                $preserved += $line
            }
        }
    }

    Copy-Item $memorySrc $memoryTarget -Force
    if ($preserved.Count -gt 0) {
        Add-Content $memoryTarget ''
        Add-Content $memoryTarget '<!-- locally-preserved entries below (not in repo .claude/memory) -->'
        foreach ($line in $preserved) {
            Add-Content $memoryTarget $line
        }
        $word = if ($preserved.Count -eq 1) { 'entry' } else { 'entries' }
        Write-Host "MEMORY.md: synced repo index + preserved $($preserved.Count) local-only $word."
    } else {
        Write-Host "MEMORY.md: synced (no local-only entries to preserve)."
    }
}
else {
    Write-Host "MEMORY.md: left as-is (use -Force to refresh the repo entries while preserving local ones)."
}

Write-Host ""
Write-Host "Sync complete:"
Write-Host "  destination: $Dest"
Write-Host "  new:         $new"
Write-Host "  skipped:     $skipped  (use -Force to overwrite)"
Write-Host "  overwritten: $overwritten"
