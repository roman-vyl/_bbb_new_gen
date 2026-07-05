/**
 * Phase 6.4 chart-events smoke. Requires:
 *   VITE_CHART_EVENTS_API=1 VITE_EMA_PIPELINE_DEBUG=true on Vite dev server
 * Usage: cd frontend && node ../debug/capture-phase64-chart-events-smoke.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../frontend/package.json"));
const { chromium } = require("@playwright/test");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "reports");
const BASE_URL = "http://127.0.0.1:5173";

mkdirSync(OUT_DIR, { recursive: true });

const V2 = "runtime_v2_production";

function meta(row) {
  return row?.last_meta ?? {};
}

function findRow(rows, step) {
  return rows.find((r) => r.step === step || r.step === `REPEAT ${step}`);
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

async function waitReportReady(page) {
  await page.getByText("Loading research run…").waitFor({ state: "detached", timeout: 120_000 }).catch(async () => {
    await page.locator(".context-bar").waitFor({ timeout: 120_000 });
  });
  const error = page.locator(".workbench-gate--error");
  if (await error.isVisible().catch(() => false)) {
    throw new Error(`Report load error: ${await error.innerText()}`);
  }
}

async function waitChartReady(page) {
  const hint = page.locator(".chart-panel .panel__hint");
  const banner = page.getByText("Full report range cached");
  try {
    await banner.waitFor({ timeout: 120_000 });
  } catch {
    await hint.waitFor({ timeout: 120_000 });
    const text = await hint.innerText();
    if (text.includes("Market data unavailable")) {
      throw new Error("Market data unavailable");
    }
    if (!text.includes("Showing") || !text.includes("OHLC")) {
      throw new Error(`Chart not ready: ${text.slice(0, 200)}`);
    }
  }
  try {
    await page.waitForResponse(
      (resp) =>
        (resp.url().includes("/chart-events") || resp.url().includes("/signal-trace")) &&
        resp.status() === 200,
      { timeout: 180_000 },
    );
  } catch {
    await page.waitForFunction(
      () => {
        const text = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
        return (
          text.includes("signal trace loaded") ||
          text.includes("component events") ||
          text.includes("trade markers")
        );
      },
      { timeout: 180_000 },
    );
  }
  await page.waitForTimeout(1500);
}

function analyzePipeline(rows, debug) {
  const steps = rows.map((r) => r.step);
  const fetchChartEvents = rows.filter((r) => r.step === "api.fetchChartEvents" || r.step === "REPEAT api.fetchChartEvents");
  const chartEventsMerge = rows.filter((r) => r.step === "wb.chart_events_merge" || r.step === "REPEAT wb.chart_events_merge");
  const chartEventsFallback = rows.filter((r) => r.step === "wb.chart_events_fallback" || r.step === "REPEAT wb.chart_events_fallback");
  const flagDisabled = chartEventsFallback.filter((r) => meta(r).reason === "flag_disabled");
  const candles = findRow(rows, "chart.setData.candles");
  const anchorEma = findRow(rows, "chart.setData.anchor_ema");
  const markersRebuild = rows.filter((r) => r.step === "chart.markers.rebuild" || r.step === "REPEAT chart.markers.rebuild");
  const lastMarkers = markersRebuild.at(-1);
  const { phase, owners } = resolveOwners(rows, debug);

  return {
    steps,
    fetchChartEvents: { count: fetchChartEvents.length, rows: fetchChartEvents },
    chartEventsMerge: { count: chartEventsMerge.length, rows: chartEventsMerge },
    chartEventsFallback: { count: chartEventsFallback.length, rows: chartEventsFallback, flagDisabled },
    candles: meta(candles),
    anchorEma: meta(anchorEma),
    markers: meta(lastMarkers),
    phase,
    owners,
  };
}

function saveJson(name, payload) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify({ captured_at: new Date().toISOString(), ...payload }, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
  return path;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  ignoreHTTPSErrors: true,
});
await context.clearCookies();
const page = await context.newPage();

const consolePipeline = [];
const networkRequests = [];

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[pipeline]") || text.includes("[pipeline debug]")) {
    consolePipeline.push({ type: msg.type(), text });
  }
});

page.on("request", (req) => {
  const url = req.url();
  if (url.includes("/chart-events") || url.includes("/signal-trace")) {
    networkRequests.push({ method: req.method(), url });
  }
});

page.on("response", (resp) => {
  const url = resp.url();
  if (url.includes("/chart-events") || url.includes("/signal-trace")) {
    networkRequests.push({ method: resp.request().method(), url, status: resp.status() });
  }
});

let screenshotPath = null;
let report = {};

try {
  console.log("Opening Workbench (fresh context) …");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const pipelineDebugOk = await page.evaluate(
    () =>
      typeof window.__pipelineDebugExport === "function" &&
      typeof window.__pipelineDebugReset === "function",
  );
  if (!pipelineDebugOk) {
    throw new Error("VITE_EMA_PIPELINE_DEBUG not active — __pipelineDebugExport missing");
  }

  const viteEnvProbe = await page.evaluate(() => {
    const w = window;
    return {
      hasPipelineExport: typeof w.__pipelineDebugExport === "function",
      hasPipelineHelp: typeof w.__pipelineDebugHelp === "function",
    };
  });

  await waitReportReady(page);
  await waitChartReady(page);

  screenshotPath = join(OUT_DIR, "phase64-chart-events-smoke.png");
  await page.locator(".chart-panel").screenshot({ path: screenshotPath }).catch(async () => {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });

  const exported = await page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    const out = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: out.steps ?? [], debug: out.debug ?? {} };
  }, "phase64-chart-events-smoke");

  const { rows, debug } = exported;
  const analysis = analyzePipeline(rows, debug);

  const chartEventsNetwork = networkRequests.filter((r) => r.url.includes("/chart-events"));
  const signalTraceNetwork = networkRequests.filter((r) => r.url.includes("/signal-trace"));

  const issues = [];
  if (!chartEventsNetwork.some((r) => r.status === 200)) {
    issues.push("No successful /chart-events network request");
  }
  if (analysis.fetchChartEvents.count === 0) {
    issues.push("Missing api.fetchChartEvents in pipeline export");
  }
  if (analysis.chartEventsMerge.count === 0) {
    issues.push("Missing wb.chart_events_merge in pipeline export");
  }
  if (analysis.chartEventsFallback.flagDisabled.length > 0) {
    issues.push("wb.chart_events_fallback reason: flag_disabled present");
  }
  if (analysis.phase !== "6.3F") {
    issues.push(`cutoverPhase=${analysis.phase}, expected 6.3F`);
  }
  for (const domain of ["model", "render_window", "viewport", "trace", "aux_overlay", "market"]) {
    if (analysis.owners[domain] !== V2) {
      issues.push(`${domain}=${analysis.owners[domain]}, expected ${V2}`);
    }
  }
  const barCount = analysis.candles.barCount ?? analysis.candles.count ?? 0;
  if (!barCount || barCount <= 0) {
    issues.push(`chart.setData.candles barCount=${barCount}`);
  }
  const overlayCount = analysis.anchorEma.overlayCount ?? 0;
  if (overlayCount !== 3) {
    issues.push(`chart.setData.anchor_ema overlayCount=${overlayCount}, expected 3`);
  }
  const tradeMarkerCount = analysis.markers.tradeMarkerCount ?? 0;
  if (tradeMarkerCount <= 0) {
    issues.push(`chart.markers.rebuild tradeMarkerCount=${tradeMarkerCount}`);
  }

  const componentMarkerCount = analysis.markers.componentMarkerCount ?? 0;
  const verdict = issues.length === 0 ? "PASS" : "BLOCKED/BUG";

  report = {
    verdict,
    issues,
    viteEnvProbe,
    pipelineDebugOk,
    consolePipelineCount: consolePipeline.length,
    consolePipelineSample: consolePipeline.slice(0, 20),
    network: {
      chartEvents: chartEventsNetwork,
      signalTrace: signalTraceNetwork,
      allTraceRequests: networkRequests,
    },
    analysis,
    debug,
    rows,
    screenshot: screenshotPath,
  };

  saveJson("phase64-chart-events-smoke.json", report);

  console.log("\n=== Phase 6.4 chart-events smoke ===");
  console.log(`Verdict: ${verdict}`);
  if (issues.length) console.log("Issues:", issues);
  console.log(`Network /chart-events: ${chartEventsNetwork.length} request(s)`);
  console.log(`api.fetchChartEvents: ${analysis.fetchChartEvents.count}`);
  console.log(`wb.chart_events_merge: ${analysis.chartEventsMerge.count}`);
  console.log(`wb.chart_events_fallback (flag_disabled): ${analysis.chartEventsFallback.flagDisabled.length}`);
  console.log(`candles barCount: ${barCount}`);
  console.log(`anchor EMA overlayCount: ${overlayCount}`);
  console.log(`tradeMarkerCount: ${tradeMarkerCount}`);
  console.log(`componentMarkerCount: ${componentMarkerCount} (separate issue if 0)`);
  console.log(`cutoverPhase: ${analysis.phase}`);
  console.log(`[pipeline] console lines: ${consolePipeline.length}`);

  if (verdict !== "PASS") {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
