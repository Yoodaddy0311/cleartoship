#!/usr/bin/env python3
"""Refresh OSV / CISA KEV coverage awareness report (CI-only maintenance task).

PURPOSE
-------
ClearToShip's audit-worker uses ``osv-scanner`` to detect dependency
vulnerabilities across the package ecosystems our supported project stacks
use (npm, PyPI, Go, ...). osv-scanner pulls from OSV.dev, which is *package /
ecosystem* indexed. The CISA KEV (Known Exploited Vulnerabilities) catalog is
*vendor / product* indexed and tracks CVEs that are being actively exploited
in the wild. There is no clean 1:1 automated mapping between the two indexes.

This script therefore produces a weekly **coverage awareness report**: it
fetches the public CISA KEV catalog, summarises what is newly added, and emits
a Markdown report so a human can eyeball whether any freshly-weaponised CVE
touches an ecosystem osv-scanner covers and warrants a manual cross-check
against our dependency surface. It deliberately does NOT claim an automated
mapping that does not exist.

STDLIB-ONLY CONSTRAINT
----------------------
This module imports **standard library only** — zero pip dependencies. It must
run with a bare ``python3`` on a fresh GitHub Actions runner with no
``pip install`` step. (Matches the Claude-BugHunter ``refresh-cve-index.py``
"stdlib only, 0 deps" discipline.) Do not add third-party imports.

DATA POLICY
-----------
CI-only. This script runs exclusively inside GitHub Actions (weekly cron /
manual dispatch), never inside the audit-worker runtime and never against any
user-submitted project. It touches only the public CISA KEV feed and writes a
report file into the repo. No user data, no audit subject data, no secrets are
involved.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Public CISA KEV catalog (JSON). Vendor/product-indexed.
KEV_FEED_URL = (
    "https://www.cisa.gov/sites/default/files/feeds/"
    "known_exploited_vulnerabilities.json"
)

# Descriptive UA so CISA's CDN/WAF does not treat us as an anonymous bot.
USER_AGENT = (
    "ClearToShip-OSV-Coverage/1.0 "
    "(+https://github.com/; weekly CI maintenance report; contact: repo maintainers)"
)

# Ecosystems osv-scanner covers for ClearToShip's supported project stacks.
# These are the OSV.dev ecosystem identifiers the audit-worker's
# dependency-vuln step can resolve advisories for. Kept as a clearly-commented
# module-level constant so the "covered surface" is auditable in one place.
#
# NOTE: CISA KEV is product/vendor-indexed (e.g. "Microsoft" / "Windows"),
# NOT package-ecosystem indexed. So we cannot mechanically join KEV entries
# onto these ecosystems. This list is documented in the report purely so a
# human reviewer knows what osv-scanner *can* surface, and can manually
# cross-check any high-signal KEV entry against the dependency surface.
OSV_COVERED_ECOSYSTEMS = (
    "npm",        # JavaScript / TypeScript (package.json)
    "PyPI",       # Python (requirements.txt / pyproject.toml)
    "Go",         # Go modules (go.mod)
    "Maven",      # Java / Kotlin (pom.xml / build.gradle)
    "NuGet",      # .NET (*.csproj / packages.config)
    "RubyGems",   # Ruby (Gemfile)
    "crates.io",  # Rust (Cargo.toml)
    "Packagist",  # PHP (composer.json)
    "Pub",        # Dart / Flutter (pubspec.yaml)
    "Hex",        # Elixir / Erlang (mix.exs)
)

# How many days back counts as "recently added".
RECENT_WINDOW_DAYS = 7

# Default network timeout (seconds).
DEFAULT_TIMEOUT = 30

# How many top vendors to show in the breakdown table.
TOP_VENDORS_LIMIT = 15

REPORT_DIR = Path("reports/CVE-COVERAGE")
ALERT_FILENAME = ".new-cve-alert"


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------
def fetch_kev(url: str = KEV_FEED_URL, timeout: int = DEFAULT_TIMEOUT) -> dict:
    """Fetch and JSON-decode the CISA KEV catalog over HTTP.

    Raises on any network/HTTP/parse error — the caller is responsible for
    deciding whether that is fatal (it is NOT, for this maintenance task).
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (https literal)
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def load_kev(input_path: str | None, url: str, timeout: int) -> dict:
    """Load the KEV catalog from a local file (offline) or the network.

    Pure-ish dispatcher: when ``input_path`` is provided we read a local JSON
    file (used for tests + reproducibility, and to avoid live network calls in
    CI verification); otherwise we fetch over the network.
    """
    if input_path:
        return json.loads(Path(input_path).read_text(encoding="utf-8"))
    return fetch_kev(url=url, timeout=timeout)


# ---------------------------------------------------------------------------
# Parse (pure — takes the decoded catalog, returns a plain summary dict)
# ---------------------------------------------------------------------------
def _parse_date(value: str) -> datetime | None:
    """Parse a CISA KEV ``dateAdded`` (YYYY-MM-DD) into an aware UTC datetime."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def parse_kev(
    catalog: dict,
    *,
    now: datetime | None = None,
    recent_window_days: int = RECENT_WINDOW_DAYS,
    top_vendors_limit: int = TOP_VENDORS_LIMIT,
) -> dict:
    """Reduce the raw KEV catalog into a summary structure.

    Pure function: given the decoded catalog (and an optional ``now`` for
    deterministic tests) it returns counts, the recent-entry list, and a
    top-vendor breakdown. No I/O, no globals mutated.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(days=recent_window_days)

    vulns = catalog.get("vulnerabilities") or []
    catalog_version = catalog.get("catalogVersion", "unknown")
    date_released = catalog.get("dateReleased", "unknown")

    recent: list[dict] = []
    vendor_counts: dict[str, int] = {}

    for v in vulns:
        vendor = (v.get("vendorProject") or "Unknown").strip() or "Unknown"
        vendor_counts[vendor] = vendor_counts.get(vendor, 0) + 1

        added = _parse_date(v.get("dateAdded", ""))
        if added is not None and added >= cutoff:
            recent.append(
                {
                    "cveID": v.get("cveID", "UNKNOWN"),
                    "vendorProject": vendor,
                    "product": (v.get("product") or "").strip() or "—",
                    "dateAdded": v.get("dateAdded", ""),
                    "knownRansomware": (
                        v.get("knownRansomwareCampaignUse") or "Unknown"
                    ).strip()
                    or "Unknown",
                    "vulnerabilityName": (v.get("vulnerabilityName") or "").strip(),
                }
            )

    # Newest first, then by CVE id for stable ordering on ties.
    recent.sort(key=lambda r: (r["dateAdded"], r["cveID"]), reverse=True)

    top_vendors = sorted(
        vendor_counts.items(), key=lambda kv: (-kv[1], kv[0])
    )[:top_vendors_limit]

    return {
        "generatedAt": now.strftime("%Y-%m-%d %H:%M:%SZ"),
        "reportDate": now.strftime("%Y-%m-%d"),
        "catalogVersion": catalog_version,
        "dateReleased": date_released,
        "total": len(vulns),
        "recentWindowDays": recent_window_days,
        "recentCount": len(recent),
        "recent": recent,
        "topVendors": top_vendors,
    }


# ---------------------------------------------------------------------------
# Render (pure — takes the summary dict, returns a Markdown string)
# ---------------------------------------------------------------------------
def _md_escape(text: str) -> str:
    """Escape pipe characters so free-text cells don't break Markdown tables."""
    return str(text).replace("|", "\\|")


def render_markdown(summary: dict, *, threshold: int) -> str:
    """Render the coverage report Markdown from a parsed summary. Pure."""
    lines: list[str] = []
    date = summary["reportDate"]

    lines.append(f"# OSV / CISA KEV Coverage Report {date}")
    lines.append("")
    lines.append(
        "> Generated by `scripts/refresh-osv-coverage.py` (CI-only weekly "
        "maintenance). No user/audit data involved — public CISA KEV feed only."
    )
    lines.append("")

    # --- Summary -----------------------------------------------------------
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Generated at**: {summary['generatedAt']}")
    lines.append(f"- **KEV catalog version**: {summary['catalogVersion']}")
    lines.append(f"- **KEV date released**: {summary['dateReleased']}")
    lines.append(f"- **Total KEV entries**: {summary['total']}")
    lines.append(
        f"- **Added in last {summary['recentWindowDays']} days**: "
        f"{summary['recentCount']}"
    )
    lines.append(f"- **Alert threshold**: {threshold}")
    lines.append("")
    lines.append(
        "**osv-scanner covered ecosystems** (what the audit-worker can surface "
        "advisories for):"
    )
    lines.append("")
    lines.append(", ".join(f"`{e}`" for e in OSV_COVERED_ECOSYSTEMS))
    lines.append("")
    lines.append(
        "> _Note: CISA KEV is vendor/product-indexed, not package-ecosystem "
        "indexed. There is no automated join between KEV entries and the "
        "ecosystems above — treat the list below as an awareness signal for "
        "manual cross-checking against the dependency surface, not a mapped "
        "result._"
    )
    lines.append("")

    # --- Recently added ----------------------------------------------------
    lines.append(
        f"## Recently Added KEV Entries (last {summary['recentWindowDays']} days)"
    )
    lines.append("")
    if summary["recent"]:
        lines.append(
            "| CVE ID | Vendor | Product | Date Added | Known Ransomware |"
        )
        lines.append("| --- | --- | --- | --- | --- |")
        for r in summary["recent"]:
            lines.append(
                "| {cve} | {vendor} | {product} | {date} | {ransom} |".format(
                    cve=_md_escape(r["cveID"]),
                    vendor=_md_escape(r["vendorProject"]),
                    product=_md_escape(r["product"]),
                    date=_md_escape(r["dateAdded"]),
                    ransom=_md_escape(r["knownRansomware"]),
                )
            )
    else:
        lines.append("_No new KEV entries in the window._")
    lines.append("")

    # --- Top vendors -------------------------------------------------------
    lines.append("## Top Vendors in KEV")
    lines.append("")
    if summary["topVendors"]:
        lines.append("| Vendor | Entry Count |")
        lines.append("| --- | --- |")
        for vendor, count in summary["topVendors"]:
            lines.append(f"| {_md_escape(vendor)} | {count} |")
    else:
        lines.append("_No vendor data available._")
    lines.append("")

    # --- Action items ------------------------------------------------------
    lines.append("## Action Items")
    lines.append("")
    if summary["recentCount"] > threshold:
        lines.append(
            f"- ⚠️ **{summary['recentCount']} new KEV entries** in the last "
            f"{summary['recentWindowDays']} days exceeds the threshold of "
            f"{threshold}. Manually review the table above and cross-check any "
            "entry whose vendor/product maps onto a package in our supported "
            f"ecosystems ({', '.join(OSV_COVERED_ECOSYSTEMS)})."
        )
    else:
        lines.append(
            f"- ✅ {summary['recentCount']} new KEV entries in the last "
            f"{summary['recentWindowDays']} days — at or below the threshold of "
            f"{threshold}. No action required beyond routine awareness."
        )
    lines.append(
        "- Confirm `osv-scanner` is still on a current version in the "
        "audit-worker image (advisory DB freshness)."
    )
    lines.append(
        "- KEV entries flagged for known ransomware use are highest priority "
        "for manual cross-check."
    )
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Write (I/O)
# ---------------------------------------------------------------------------
def write_report(
    markdown: str,
    summary: dict,
    *,
    report_dir: Path = REPORT_DIR,
) -> Path:
    """Write the Markdown report to ``reports/CVE-COVERAGE/<date>.md``.

    Creates the directory if missing. Returns the written path.
    """
    report_dir.mkdir(parents=True, exist_ok=True)
    out_path = report_dir / f"{summary['reportDate']}.md"
    out_path.write_text(markdown, encoding="utf-8")
    return out_path


def write_alert(summary: dict, *, report_dir: Path = REPORT_DIR) -> Path:
    """Write the ``.new-cve-alert`` sentinel file containing the recent count.

    The workflow reads this file's existence to decide whether to open a
    GitHub issue.
    """
    report_dir.mkdir(parents=True, exist_ok=True)
    alert_path = report_dir / ALERT_FILENAME
    alert_path.write_text(str(summary["recentCount"]), encoding="utf-8")
    return alert_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch the CISA KEV catalog and emit an OSV coverage awareness "
            "report (CI-only, stdlib-only)."
        )
    )
    parser.add_argument(
        "--input",
        default=None,
        help=(
            "Path to a local KEV catalog JSON file. When set, no network call "
            "is made (used for testing + reproducibility)."
        ),
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=20,
        help=(
            "If entries added in the last %d days exceed this, emit a GitHub "
            "Actions ::warning:: annotation and write the .new-cve-alert "
            "sentinel file (default: 20)." % RECENT_WINDOW_DAYS
        ),
    )
    parser.add_argument(
        "--url",
        default=KEV_FEED_URL,
        help="Override the KEV feed URL (default: CISA public feed).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help="Network timeout in seconds (default: %d)." % DEFAULT_TIMEOUT,
    )
    parser.add_argument(
        "--report-dir",
        default=str(REPORT_DIR),
        help="Output directory for the report (default: reports/CVE-COVERAGE).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report_dir = Path(args.report_dir)

    # 1. Load (network or offline). Network failure is NON-fatal: warn + exit 0
    #    so an upstream CISA outage never reds the CI job for a maintenance task.
    try:
        catalog = load_kev(args.input, args.url, args.timeout)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(
            f"::warning title=KEV fetch failed::Could not retrieve CISA KEV "
            f"feed ({exc}). Skipping coverage report (non-blocking).",
            file=sys.stderr,
        )
        return 0
    except (json.JSONDecodeError, ValueError) as exc:
        print(
            f"::warning title=KEV parse failed::Could not parse CISA KEV feed "
            f"({exc}). Skipping coverage report (non-blocking).",
            file=sys.stderr,
        )
        return 0

    # 2. Parse → 3. Render → 4. Write (pure functions + thin I/O).
    summary = parse_kev(catalog)
    markdown = render_markdown(summary, threshold=args.threshold)
    out_path = write_report(markdown, summary, report_dir=report_dir)

    # 5. Threshold handling: GitHub annotation + sentinel for the workflow.
    over_threshold = summary["recentCount"] > args.threshold
    if over_threshold:
        write_alert(summary, report_dir=report_dir)
        print(
            f"::warning title=New KEV entries::{summary['recentCount']} CVEs "
            f"added to CISA KEV in the last {summary['recentWindowDays']} days "
            f"(threshold {args.threshold}). Manual cross-check recommended."
        )

    # 6. Human summary to stdout regardless of threshold.
    print(f"OSV/KEV coverage report written: {out_path}")
    print(f"  Total KEV entries        : {summary['total']}")
    print(
        f"  Added in last {summary['recentWindowDays']} days  : "
        f"{summary['recentCount']} (threshold {args.threshold})"
    )
    print(f"  Catalog version          : {summary['catalogVersion']}")
    print(f"  Over threshold           : {'YES' if over_threshold else 'no'}")
    if over_threshold:
        print(f"  Alert sentinel written   : {report_dir / ALERT_FILENAME}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
