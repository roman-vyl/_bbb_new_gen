/**
 * Phase 6.4 non-empty aux/HTF overlay smoke — full chain diagnostic.
 * Requires: VITE_EMA_PIPELINE_DEBUG=true (./scripts/dev-workbench.sh --pipeline-debug)
 *
 * Usage: cd frontend && node ../debug/capture-phase64-aux-htf-overlay-smoke.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../frontend/package.json"));
const { chromium } = require("@playwright/test");

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "reports", "phase64-aux-htf-overlay");
const BASE_URL = "http://127.0.0.1:5173";
const TARGET_RUN = "2026-06-28T134603Z_ema_pullback_BTCUSDT_5m";

mkdirSync(OUT_DIR, { recursive: true });

function meta(row) {
  return row?.last_meta ?? {};
}

function findRow(rows, step) {
  return rows.find((r) => r.step === step || r.step === `REPEAT ${step}`);
}

function rowsForStep(rows, step) {
  return rows.filter((r) => r.step === step || r.step === `REPEAT ${step}`);
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: join(__dirname, ".."), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
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
}

async function waitChartStable(page) {
  await page.waitForFunction(
    () => {
      const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn !== "function") return false;
      const rows = exportFn()?.steps ?? [];
      const candles = rows.find((r) => r.step === "chart.setData.candles");
      const ema = rows.find((r) => r.step === "chart.setData.anchor_ema");
      const barCount = candles?.last_meta?.barCount ?? 0;
      const overlayCount = ema?.last_meta?.overlayCount ?? 0;
      return barCount >= 50000 && overlayCount === 3 && hint.includes("OHLC");
    },
    { timeout: 600_000 },
  );
  await page.waitForTimeout(2000);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
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

const networkLog = [];
const consolePipeline = [];

page.on("request", (req) => {
  const url = req.url();
  if (
    url.includes("/chart-events") ||
    url.includes("/signal-trace") ||
    url.includes("/overlay") ||
    url.includes("/chart-bundle")
  ) {
    networkLog.push({ phase: "request", method: req.method(), url, at: Date.now() });
  }
});

page.on("response", async (resp) => {
  const url = resp.url();
  if (
    url.includes("/chart-events") ||
    url.includes("/signal-trace") ||
    url.includes("/overlay") ||
    url.includes("/chart-bundle")
  ) {
    let bodySummary = null;
    if (url.includes("/chart-events") || url.includes("/signal-trace")) {
      try {
        const json = await resp.json();
        const htf = json.htf_context ?? {};
        bodySummary = {
          timesLen: json.times?.length ?? 0,
          htfFastLen: htf.fast?.length ?? 0,
          htfAnchorLen: htf.anchor?.length ?? 0,
          htfSlowLen: htf.slow?.length ?? 0,
          htfMeta: htf.meta ?? null,
          componentEventsLen: json.component_events?.length ?? 0,
        };
      } catch {
        bodySummary = { parseError: true };
      }
    }
    networkLog.push({
      phase: "response",
      method: resp.request().method(),
      url,
      status: resp.status(),
      bodySummary,
      at: Date.now(),
    });
  }
});

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[pipeline]") || text.includes("[pipeline debug]")) {
    consolePipeline.push({ type: msg.type(), text });
  }
});

let report = {};

try {
  await disableCacheViaCdp(page);
  console.log(`Opening workbench for run ${TARGET_RUN} …`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 180_000 });

  const pipelineOk = await page.evaluate(
    () => typeof window.__pipelineDebugExport === "function",
  );
  if (!pipelineOk) {
    throw new Error("VITE_EMA_PIPELINE_DEBUG not active — use ./scripts/dev-workbench.sh --pipeline-debug");
  }

  await waitReportReady(page);

  // Ensure target run selected
  const runSelect = page.locator("select").filter({ has: page.locator(`option[value="${TARGET_RUN}"]`) }).first();
  if (await runSelect.count()) {
    await runSelect.selectOption(TARGET_RUN);
    await page.waitForTimeout(3000);
  }

  await page.getByRole("button", { name: "Chart" }).click({ timeout: 30_000 }).catch(() => {});
  await waitChartStable(page);

  const ui = {
    overlayRefOptions: await page.locator(".chart-panel__overlay-ref select option").allTextContents().catch(() => []),
    overlayRefValue: await page.locator(".chart-panel__overlay-ref select").inputValue().catch(() => null),
    overlayRefVisible: await page.locator(".chart-panel__overlay-ref").isVisible().catch(() => false),
    hint: await page.locator(".chart-panel .panel__hint").innerText().catch(() => ""),
  };

  const screenshotPath = join(OUT_DIR, "phase64-aux-htf-overlay-smoke.png");
  await page.locator(".chart-panel").screenshot({ path: screenshotPath });

  const exported = await page.evaluate((label) => {
    window.__pipelineDebugFlush?.(label);
    const out = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: out.steps ?? [], debug: out.debug ?? {} };
  }, "phase64-aux-htf-overlay-smoke");

  const { rows, debug } = exported;

  const chartPanelProbe = await page.evaluate(() => {
    const panel = document.querySelector(".chart-panel");
    const canvas = panel?.querySelector(".chart-canvas canvas");
    return {
      hasCanvas: !!canvas,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
    };
  });

  const traceResponses = networkLog.filter(
    (e) => e.phase === "response" && (e.url.includes("/chart-events") || e.url.includes("/signal-trace")),
  );
  const chartEventsResp = traceResponses.find((e) => e.url.includes("/chart-events"));
  const signalTraceResp = traceResponses.find((e) => e.url.includes("/signal-trace"));

  const pipeline = {
    cutover: meta(findRow(rows, "wb.cutover.domain_owners")),
    auxApply: rowsForStep(rows, "wb.aux_overlay.apply_current_window").map((r) => meta(r)),
    auxMerge: rowsForStep(rows, "wb.aux_overlay.merge").map((r) => meta(r)),
    auxSlice: rowsForStep(rows, "wb.aux_overlay.slice").map((r) => meta(r)),
    auxStale: rowsForStep(rows, "wb.aux_overlay.stale").map((r) => meta(r)),
    traceSliceHtf: rowsForStep(rows, "wb.trace_display.slice_htf").map((r) => meta(r)),
    chartEventsMerge: rowsForStep(rows, "wb.chart_events_merge").map((r) => meta(r)),
    chartWindowSlice: meta(findRow(rows, "wb.chart_window_slice")),
    setDataCandles: meta(findRow(rows, "chart.setData.candles")),
    setDataAnchorEma: meta(findRow(rows, "chart.setData.anchor_ema")),
    setDataAuxHtf: findRow(rows, "chart.setData.aux_htf"),
    fetchChartEvents: findRow(rows, "api.fetchChartEvents"),
    fetchSignalTrace: findRow(rows, "api.fetchSignalTrace"),
  };

  const hasRefInUrl = (url) => url?.includes("context_overlay_ref=htf_1") ?? false;

  report = {
    captured_at: new Date().toISOString(),
    gitCommit: gitCommit(),
    targetRun: TARGET_RUN,
    variant: "instance_1",
    ui,
    network: {
      chartEventsRequest: networkLog.find((e) => e.url.includes("/chart-events") && e.phase === "request"),
      chartEventsResponse: chartEventsResp,
      signalTraceRequest: networkLog.find((e) => e.url.includes("/signal-trace") && e.phase === "request"),
      signalTraceResponse: signalTraceResp,
      hasContextOverlayRefInChartEvents: hasRefInUrl(chartEventsResp?.url),
      hasContextOverlayRefInSignalTrace: hasRefInUrl(signalTraceResp?.url),
      allTraceUrls: traceResponses.map((e) => ({ url: e.url, status: e.status, bodySummary: e.bodySummary })),
    },
    pipeline,
    debug,
    rows,
    chartPanelProbe,
    consolePipelineCount: consolePipeline.length,
    consolePipelineSample: consolePipeline.slice(0, 25),
    screenshot: screenshotPath,
  };

  const path = join(OUT_DIR, "phase64-aux-htf-overlay-smoke.json");
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
  console.log(`overlayRef=${ui.overlayRefValue} hint=${ui.hint.slice(0, 120)}`);
  console.log(`setData.aux_htf overlayCount=${pipeline.setDataAuxHtf?.last_meta?.overlayCount ?? pipeline.setDataAuxHtf?.count ?? "n/a"}`);
  console.log(`chart-events ref=${report.network.hasContextOverlayRefInChartEvents} htfFast=${chartEventsResp?.bodySummary?.htfFastLen ?? "n/a"}`);
} finally {
  await context.close();
  await browser.close();
}
