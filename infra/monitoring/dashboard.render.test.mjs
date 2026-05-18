// W3.INF.4 — Dashboard render-verify smoke test.
//
// Purpose:
//   Validate `infra/monitoring/dashboard.json` is well-formed Google Cloud
//   Monitoring dashboard JSON BEFORE shipping. We don't have the GCP API
//   creds in CI for `gcloud monitoring dashboards create --validate-only`,
//   so this runs the structural checks the API would otherwise catch:
//     - JSON parses
//     - displayName present
//     - mosaicLayout.tiles is an array of length === 3 (latency, backlog,
//       error rate — matches the W3.INF.4 spec)
//     - each tile has a widget with title + xyChart.dataSets[].timeSeriesQuery
//     - every timeSeriesFilter.filter references a valid metric type
//       prefix (custom.googleapis.com/cleartoship/* or cloudtasks.googleapis.com/*)
//
// Run:
//   node infra/monitoring/dashboard.render.test.mjs
//
// Exit code 0 = pass; non-zero = fail.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DASHBOARD_PATH = path.join(__dirname, "dashboard.json");
const EXPECTED_TILE_COUNT = 3;
const EXPECTED_TITLES = [
  /latency/i,           // p50/p95/p99
  /queue depth|backlog/i,
  /error rate/i,
];
const VALID_METRIC_PREFIXES = [
  "custom.googleapis.com/cleartoship/",
  "cloudtasks.googleapis.com/",
];

function fail(msg) {
  console.error(`[dashboard.render.test] FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[dashboard.render.test] OK: ${msg}`);
}

// --- 1. file exists + parses -----------------------------------------------
let raw;
try {
  raw = fs.readFileSync(DASHBOARD_PATH, "utf8");
} catch (e) {
  fail(`cannot read ${DASHBOARD_PATH}: ${e.message}`);
}

let dashboard;
try {
  dashboard = JSON.parse(raw);
} catch (e) {
  fail(`invalid JSON: ${e.message}`);
}
pass("JSON parses");

// --- 2. top-level shape ----------------------------------------------------
if (typeof dashboard.displayName !== "string" || !dashboard.displayName) {
  fail("displayName missing or empty");
}
pass(`displayName=${JSON.stringify(dashboard.displayName)}`);

if (!dashboard.mosaicLayout || !Array.isArray(dashboard.mosaicLayout.tiles)) {
  fail("mosaicLayout.tiles missing or not an array");
}
const tiles = dashboard.mosaicLayout.tiles;

if (tiles.length !== EXPECTED_TILE_COUNT) {
  fail(`expected ${EXPECTED_TILE_COUNT} tiles, got ${tiles.length}`);
}
pass(`${tiles.length} tiles present`);

// --- 3. per-tile structure -------------------------------------------------
tiles.forEach((tile, i) => {
  const w = tile.widget;
  if (!w) fail(`tile[${i}].widget missing`);
  if (typeof w.title !== "string" || !w.title) {
    fail(`tile[${i}].widget.title missing`);
  }
  if (!EXPECTED_TITLES[i].test(w.title)) {
    fail(
      `tile[${i}].widget.title ${JSON.stringify(w.title)} does not match ${EXPECTED_TITLES[i]}`,
    );
  }
  if (!w.xyChart || !Array.isArray(w.xyChart.dataSets) || w.xyChart.dataSets.length === 0) {
    fail(`tile[${i}].widget.xyChart.dataSets must be non-empty array`);
  }
  w.xyChart.dataSets.forEach((ds, j) => {
    const filter = ds?.timeSeriesQuery?.timeSeriesFilter?.filter;
    if (typeof filter !== "string" || !filter) {
      fail(`tile[${i}].dataSets[${j}].timeSeriesQuery.timeSeriesFilter.filter missing`);
    }
    const ok = VALID_METRIC_PREFIXES.some((p) => filter.includes(`metric.type="${p}`));
    if (!ok) {
      fail(
        `tile[${i}].dataSets[${j}] references unknown metric prefix in filter: ${filter}`,
      );
    }
  });
  pass(`tile[${i}] (${w.title}) — ${w.xyChart.dataSets.length} dataSet(s)`);
});

// --- 4. cross-tile coverage assertions -------------------------------------
const allFilters = tiles.flatMap((t) =>
  (t.widget.xyChart.dataSets || []).map(
    (ds) => ds?.timeSeriesQuery?.timeSeriesFilter?.filter ?? "",
  ),
);

const requiredMetrics = [
  "custom.googleapis.com/cleartoship/audit_run_duration_seconds",
  "custom.googleapis.com/cleartoship/audit_run_completed_total",
];
for (const m of requiredMetrics) {
  if (!allFilters.some((f) => f.includes(m))) {
    fail(`no tile references required metric ${m}`);
  }
  pass(`metric referenced: ${m}`);
}

// queue depth — either custom or builtin satisfies the W3.INF.4 spec
const hasQueueDepth = allFilters.some(
  (f) =>
    f.includes("custom.googleapis.com/cleartoship/queue_depth") ||
    f.includes("cloudtasks.googleapis.com/queue/depth"),
);
if (!hasQueueDepth) fail("no tile references a queue depth metric");
pass("queue depth metric referenced");

console.log("[dashboard.render.test] all checks passed");
process.exit(0);
