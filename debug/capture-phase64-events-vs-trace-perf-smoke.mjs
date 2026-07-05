/**
 * Phase 6.4 A/B perf smoke — single cold-open capture.
 * Requires workbench already running with correct Vite env for the mode under test.
 *
 * Usage:
 *   cd frontend && node ../debug/capture-phase64-events-vs-trace-perf-smoke.mjs --mode OFF --run 1
 *   cd frontend && node ../debug/capture-phase64-events-vs-trace-perf-smoke.mjs --mode ON --run 2
 *
 * Env:
 *   PHASE64_MODE=OFF|ON (alternative to --mode)
 *   PHASE64_RUN=1|2|3   (alternative to --run)
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../frontend/package.json"));
const { chromium } = require("@playwright/test");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "reports", "phase64-perf");
const BASE_URL = "http://127.0.0.1:5173";
const V2 = "runtime_v2_production";

mkdirSync(OUT_DIR, { recursive: true });

function parseArgs() {
  const args = process.argv.slice(2);
  let mode = process.env.PHASE64_MODE?.trim().toUpperCase() ?? "";
  let run = process.env.PHASE64_RUN?.trim() ?? "";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--mode" && args[i + 1]) {
      mode = args[i + 1].trim().toUpperCase();
      i += 1;
    } else if (args[i] === "--run" && args[i + 1]) {
      run = args[i + 1].trim();
      i += 1;
    }
  }
  if (mode !== "OFF" && mode !== "ON") {
    throw new Error("Missing or invalid --mode OFF|ON");
  }
  if (!run || !/^[123]$/.test(run)) {
    throw new Error("Missing or invalid --run 1|2|3");
  }
  return { mode, run: Number(run) };
}

function meta(row) {
  return row?.last_meta ?? {};
}

function findRow(rows, step) {
  return rows.find((r) => r.step === step || r.step === `REPEAT ${step}`);
}

function rowsForStep(rows, step) {
  return rows.filter((r) => r.step === step || r.step === `REPEAT ${step}`);
}

function stepMetrics(rows, step) {
  const matches = rowsForStep(rows, step);
  if (matches.length === 0) {
    return { count: 0, total_ms: 0, max_ms: 0, avg_ms: 0, rows: [] };
  }
  const count = matches.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const total_ms = matches.reduce((sum, r) => sum + (r.total_ms ?? 0), 0);
  const max_ms = Math.max(...matches.map((r) => r.max_ms ?? 0));
  const avg_ms = count > 0 ? Number((total_ms / count).toFixed(1)) : 0;
  return { count, total_ms: Number(total_ms.toFixed(1)), max_ms, avg_ms, rows: matches };
}

function resolveOwners(rows, exportDebug) {
  const ownersRow = findRow(rows, "wb.cutover.domain_owners");
  if (ownersRow) {
    const m = meta(ownersRow);
    return { phase: m.phase, owners: m.owners ?? {} };
  }
  if (exportDebug) {
    return { phase: exportDebug.cutoverPhase, owners: exportDebug.domainOwners ?? {} };
  }
  return { phase: undefined, owners: {} };
}

function extractMetrics(rows, debug) {
  const candlesRow = findRow(rows, "chart.setData.candles");
  const anchorEmaRow = findRow(rows, "chart.setData.anchor_ema");
  const markersRows = rowsForStep(rows, "chart.markers.rebuild");
  const lastMarkers = markersRows.at(-1);
  const { phase, owners } = resolveOwners(rows, debug);

  const marketFetchStart = rowsForStep(rows, "wb.market_fetch.start");
  const marketFetchEnd = rowsForStep(rows, "wb.market_fetch.end");
  const emaDecision = rowsForStep(rows, "wb.market_ema_decision");
  const chartWindowSlice = findRow(rows, "wb.chart_window_slice");
  const traceApply = findRow(rows, "wb.trace_display.apply_current_window");
  const chartEventsMerge = rowsForStep(rows, "wb.chart_events_merge");
  const chartEventsFallback = rowsForStep(rows, "wb.chart_events_fallback");

  const candles = meta(candlesRow);
  const anchorEma = meta(anchorEmaRow);

  return {
    api: {
      fetchCandlesWindow: stepMetrics(rows, "api.fetchCandlesWindow"),
      fetchEmaWindow: stepMetrics(rows, "api.fetchEmaWindow"),
      fetchSignalTrace: stepMetrics(rows, "api.fetchSignalTrace"),
      fetchChartEvents: stepMetrics(rows, "api.fetchChartEvents"),
    },
    market: {
      fetchStartCount: marketFetchStart.reduce((s, r) => s + (r.count ?? 0), 0),
      fetchEndCount: marketFetchEnd.reduce((s, r) => s + (r.count ?? 0), 0),
      emaDecisionCount: emaDecision.reduce((s, r) => s + (r.count ?? 0), 0),
      emaDecisions: emaDecision.map((r) => meta(r)),
    },
    chart: {
      candles: {
        count: candlesRow?.count ?? 0,
        total_ms: candlesRow?.total_ms ?? 0,
        max_ms: candlesRow?.max_ms ?? 0,
        avg_ms: candlesRow?.avg_ms ?? 0,
        barCount: candles.barCount ?? candles.count ?? 0,
      },
      anchorEma: {
        count: anchorEmaRow?.count ?? 0,
        total_ms: anchorEmaRow?.total_ms ?? 0,
        max_ms: anchorEmaRow?.max_ms ?? 0,
        avg_ms: anchorEmaRow?.avg_ms ?? 0,
        overlayCount: anchorEma.overlayCount ?? 0,
      },
      windowSliceOverlayCount: meta(chartWindowSlice).overlayCount ?? null,
    },
    trace: {
      fetchSignalTrace: stepMetrics(rows, "api.fetchSignalTrace"),
      fetchChartEvents: stepMetrics(rows, "api.fetchChartEvents"),
      chartEventsMergeCount: chartEventsMerge.reduce((s, r) => s + (r.count ?? 0), 0),
      chartEventsMergeSource: meta(chartEventsMerge.at(-1)).mergeSource ?? null,
      chartEventsFallbackCount: chartEventsFallback.reduce((s, r) => s + (r.count ?? 0), 0),
      chartEventsFallbackReason: meta(chartEventsFallback.at(-1)).reason ?? null,
      traceApply: meta(traceApply),
    },
    markers: meta(lastMarkers),
    ownership: { phase, owners },
    abortRetry: {
      marketFetchAborted: rows.filter((r) => r.step.includes("abort")).length,
      extraFetchStarts: marketFetchStart.length,
    },
  };
}

function chartHealth(metrics) {
  const issues = [];
  const barCount = metrics.chart.candles.barCount ?? 0;
  const overlayCount = metrics.chart.anchorEma.overlayCount ?? 0;
  const tradeMarkerCount = metrics.markers.tradeMarkerCount ?? 0;

  if (!barCount || barCount <= 0) issues.push(`barCount=${barCount}`);
  if (overlayCount !== 3) issues.push(`overlayCount=${overlayCount}`);
  if (tradeMarkerCount <= 0) issues.push(`tradeMarkerCount=${tradeMarkerCount}`);

  for (const domain of ["model", "render_window", "viewport", "trace", "aux_overlay", "market"]) {
    if (metrics.ownership.owners[domain] !== V2) {
      issues.push(`${domain}=${metrics.ownership.owners[domain]}`);
    }
  }
  if (metrics.ownership.phase !== "6.3F") {
    issues.push(`phase=${metrics.ownership.phase}`);
  }

  return {
    ok: issues.length === 0,
    candlesVisible: barCount > 0,
    emaVisible: overlayCount === 3,
    tradeMarkersVisible: tradeMarkerCount > 0,
    chartNotBlank: barCount > 0 && overlayCount === 3,
    issues,
  };
}

async function disableCacheViaCdp(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
}

async function waitReportReady(page) {
  await page.getByText("Loading research run…").waitFor({ state: "detached", timeout: 180_000 }).catch(async () => {
    await page.locator(".context-bar").waitFor({ timeout: 180_000 });
  });
  const error = page.locator(".workbench-gate--error");
  if (await error.isVisible().catch(() => false)) {
    throw new Error(`Report load error: ${await error.innerText()}`);
  }
}

async function waitChartStable(page, mode) {
  const hint = page.locator(".chart-panel .panel__hint");
  const banner = page.getByText("Full report range cached");
  try {
    await banner.waitFor({ timeout: 180_000 });
  } catch {
    await hint.waitFor({ timeout: 180_000 });
    const text = await hint.innerText();
    if (text.includes("Market data unavailable")) {
      throw new Error("Market data unavailable");
    }
    if (!text.includes("Showing") || !text.includes("OHLC")) {
      throw new Error(`Chart not ready: ${text.slice(0, 200)}`);
    }
  }

  if (mode === "ON") {
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes("/chart-events") && resp.status() === 200,
        { timeout: 240_000 },
      );
    } catch {
      await page.waitForFunction(
        () => {
          const text = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
          return (
            text.includes("component events") ||
            text.includes("trade markers") ||
            text.includes("signal trace loaded")
          );
        },
        { timeout: 240_000 },
      );
    }
  } else {
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes("/signal-trace") && resp.status() === 200,
        { timeout: 240_000 },
      );
    } catch {
      await page.waitForFunction(
        () => {
          const text = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
          return text.includes("signal trace loaded") || text.includes("trade markers");
        },
        { timeout: 240_000 },
      );
    }
  }

  await page.waitForFunction(
    () => {
      const rows = window.__pipelineDebugExport?.()?.steps ?? [];
      const candles = rows.find((r) => r.step === "chart.setData.candles");
      const ema = rows.find((r) => r.step === "chart.setData.anchor_ema");
      const marketEnd = rows.some((r) => r.step === "wb.market_fetch.end");
      const barCount = candles?.last_meta?.barCount ?? candles?.last_meta?.count ?? 0;
      const overlayCount = ema?.last_meta?.overlayCount ?? 0;
      return barCount >= 50000 && overlayCount === 3 && marketEnd;
    },
    { timeout: 240_000 },
  );

  await page.waitForTimeout(1500);
}

function parseRunVariantWindow(networkTimings) {
  const url =
    networkTimings.find((n) => n.url.includes("/chart-events") || n.url.includes("/signal-trace"))?.url ??
    networkTimings.find((n) => n.url.includes("/runs/"))?.url ??
    "";
  const runMatch = url.match(/\/runs\/([^/?]+)/);
  const variantMatch = url.match(/[?&]variant=([^&]+)/);
  const fromMatch = url.match(/[?&]from=([^&]+)/);
  const toMatch = url.match(/[?&]to_open_time_ms=([^&]+)/);
  return {
    runId: runMatch?.[1] ?? null,
    variant: variantMatch?.[1] ?? null,
    windowFromMs: fromMatch?.[1] ?? null,
    windowToOpenTimeMs: toMatch?.[1] ?? null,
  };
}

function saveJson(name, payload) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
  return path;
}

const { mode, run } = parseArgs();
const label = `${mode}-run${run}`;
const outfile = `phase64-perf-${label}.json`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  ignoreHTTPSErrors: true,
});
await context.clearCookies();
const page = await context.newPage();

await page.addInitScript(() => {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

const consolePipeline = [];
const networkTimings = [];

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[pipeline]") || text.includes("[pipeline debug]")) {
    consolePipeline.push({ type: msg.type(), text });
  }
});

page.on("request", (req) => {
  const url = req.url();
  if (
    url.includes("/ema") ||
    url.includes("/candles") ||
    url.includes("/chart-events") ||
    url.includes("/signal-trace") ||
    url.includes("/chart-bundle")
  ) {
    networkTimings.push({
      phase: "request",
      method: req.method(),
      url,
      startTime: Date.now(),
    });
  }
});

page.on("response", async (resp) => {
  const url = resp.url();
  if (
    url.includes("/ema") ||
    url.includes("/candles") ||
    url.includes("/chart-events") ||
    url.includes("/signal-trace") ||
    url.includes("/chart-bundle")
  ) {
    const req = resp.request();
    const timing = resp.request().timing();
    networkTimings.push({
      phase: "response",
      method: req.method(),
      url,
      status: resp.status(),
      timing,
    });
  }
});

let report = {};

try {
  await disableCacheViaCdp(page);

  console.log(`[${label}] Opening Workbench (fresh context, cache disabled) …`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 180_000 });

  const pipelineDebugOk = await page.evaluate(
    () =>
      typeof window.__pipelineDebugExport === "function" &&
      typeof window.__pipelineDebugReset === "function",
  );
  if (!pipelineDebugOk) {
    throw new Error("VITE_EMA_PIPELINE_DEBUG not active — __pipelineDebugExport missing");
  }

  const chartEventsFlagProbe = await page.evaluate(async () => {
    const mod = await import("/src/features/chart/runtime/chartEventsLoad.ts").catch(() => null);
    return {
      chartEventsApiEnabled: mod?.isChartEventsApiEnabled?.() ?? null,
    };
  }).catch(() => ({ chartEventsApiEnabled: null }));

  await waitReportReady(page);
  await waitChartStable(page, mode);

  const exported = await page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    const out = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: out.steps ?? [], debug: out.debug ?? {} };
  }, `phase64-perf-${label}`);

  const { rows, debug } = exported;
  const metrics = extractMetrics(rows, debug);
  const health = chartHealth(metrics);
  const identifiers = parseRunVariantWindow(networkTimings);

  const pathIssues = [];
  if (mode === "ON") {
    if (metrics.api.fetchChartEvents.count === 0) pathIssues.push("missing api.fetchChartEvents");
    if (metrics.trace.chartEventsFallbackReason === "flag_disabled") {
      pathIssues.push("chart_events_fallback flag_disabled");
    }
  } else {
    if (metrics.api.fetchChartEvents.count > 0) pathIssues.push("unexpected api.fetchChartEvents in OFF mode");
    if (metrics.trace.chartEventsMergeCount > 0) pathIssues.push("unexpected wb.chart_events_merge in OFF mode");
  }

  report = {
    captured_at: new Date().toISOString(),
    label,
    mode,
    run,
    cacheReset: {
      browserContext: "new (no persistent profile)",
      browserCookies: "cleared",
      browserLocalStorage: "cleared via init script",
      browserSessionStorage: "cleared via init script",
      httpCache: "disabled via CDP Network.setCacheDisabled",
      frontendInMemory: "reset by Vite process restart (orchestrator)",
      bffProcess: "restarted by orchestrator before this run",
    },
    identifiers,
    metrics,
    health,
    pathIssues,
    chartEventsFlagProbe,
    consolePipelineCount: consolePipeline.length,
    consolePipelineSample: consolePipeline.slice(0, 15),
    networkTimings,
    debug,
    rows,
  };

  saveJson(outfile, report);

  console.log(`\n=== Phase 6.4 perf ${label} ===`);
  console.log(`fetchCandles: count=${metrics.api.fetchCandlesWindow.count} total=${metrics.api.fetchCandlesWindow.total_ms}ms max=${metrics.api.fetchCandlesWindow.max_ms}ms`);
  console.log(`fetchEma: count=${metrics.api.fetchEmaWindow.count} total=${metrics.api.fetchEmaWindow.total_ms}ms max=${metrics.api.fetchEmaWindow.max_ms}ms avg=${metrics.api.fetchEmaWindow.avg_ms}ms`);
  console.log(`fetchSignalTrace: count=${metrics.api.fetchSignalTrace.count} total=${metrics.api.fetchSignalTrace.total_ms}ms max=${metrics.api.fetchSignalTrace.max_ms}ms`);
  console.log(`fetchChartEvents: count=${metrics.api.fetchChartEvents.count} total=${metrics.api.fetchChartEvents.total_ms}ms max=${metrics.api.fetchChartEvents.max_ms}ms`);
  console.log(`market_fetch.start/end: ${metrics.market.fetchStartCount}/${metrics.market.fetchEndCount}`);
  console.log(`chart health: ${health.ok ? "OK" : health.issues.join(", ")}`);
  if (pathIssues.length) console.log("pathIssues:", pathIssues);

  if (!health.ok || pathIssues.length) {
    process.exitCode = 1;
  }
} finally {
  await context.close();
  await browser.close();
}
