/**
 * Phase 6.4 signal-trace readiness diagnostic (main vs branch).
 * Requires workbench running; branch should use VITE_EMA_PIPELINE_DEBUG=true.
 *
 * Usage:
 *   cd frontend && node ../debug/capture-phase64-signal-trace-readiness-smoke.mjs --git-branch main --run 1
 *   cd frontend && node ../debug/capture-phase64-signal-trace-readiness-smoke.mjs --git-branch new-workbench-chart-runtime-v2 --run 1
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../frontend/package.json"));
const { chromium } = require("@playwright/test");

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "reports", "phase64-signal-trace-readiness");
const BASE_URL = "http://127.0.0.1:5173";
const TARGET_RUN = "2026-06-28T134603Z_ema_pullback_BTCUSDT_5m";
const TARGET_OVERLAY_REF = "htf_1";
const READINESS_TIMEOUT_MS = 300_000;

const TRACE_URL_RE =
  /\/api\/(research\/runs\/.*\/(signal-trace|chart-events)|market\/(chart-bundle|candles-window|ema-window))/;

mkdirSync(OUT_DIR, { recursive: true });

function parseArgs() {
  const args = process.argv.slice(2);
  let gitBranch = process.env.PHASE64_GIT_BRANCH?.trim() ?? "";
  let run = process.env.PHASE64_RUN?.trim() ?? "";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--git-branch" && args[i + 1]) {
      gitBranch = args[i + 1].trim();
      i += 1;
    } else if (args[i] === "--run" && args[i + 1]) {
      run = args[i + 1].trim();
      i += 1;
    }
  }
  if (!gitBranch) throw new Error("Missing --git-branch main|new-workbench-chart-runtime-v2");
  if (!run || !/^[12]$/.test(run)) throw new Error("Missing or invalid --run 1|2");
  return { gitBranch, run: Number(run) };
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function parseUrl(url) {
  try {
    const u = new URL(url);
    return { path: u.pathname, params: Object.fromEntries(u.searchParams.entries()), host: u.host };
  } catch {
    return { path: url, params: {}, host: "" };
  }
}

function classifyEndpoint(path) {
  if (path.includes("/signal-trace")) return "signal-trace";
  if (path.includes("/chart-events")) return "chart-events";
  if (path.includes("/chart-bundle")) return "chart-bundle";
  if (path.includes("/candles-window")) return "candles-window";
  if (path.includes("/ema-window")) return "ema-window";
  if (path.includes("/report")) return "run-report";
  return "other";
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
  if (!matches.length) return { count: 0, total_ms: 0, max_ms: 0, avg_ms: 0 };
  const count = matches.reduce((s, r) => s + (r.count ?? 0), 0);
  const total_ms = matches.reduce((s, r) => s + (r.total_ms ?? 0), 0);
  const max_ms = Math.max(...matches.map((r) => r.max_ms ?? 0));
  return {
    count,
    total_ms: Number(total_ms.toFixed(1)),
    max_ms,
    avg_ms: count > 0 ? Number((total_ms / count).toFixed(1)) : 0,
    last_meta: meta(matches[matches.length - 1]),
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

function saveJson(name, payload) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
  return path;
}

function analyzePipeline(rows, debug) {
  const applyRows = rowsForStep(rows, "wb.trace_display.apply_current_window");
  const applyCurrent = applyRows.find((r) => meta(r).status === "current") ?? applyRows[applyRows.length - 1];
  const markersRow = findRow(rows, "chart.markers.rebuild");
  const ownersRow = findRow(rows, "wb.cutover.domain_owners");
  return {
    available: rows?.length > 0,
    fetchSignalTrace: stepMetrics(rows, "api.fetchSignalTrace"),
    fetchChartEvents: stepMetrics(rows, "api.fetchChartEvents"),
    signalTraceFetchStart: rowsForStep(rows, "wb.signal_trace.fetch_start").length,
    signalTraceFetchEnd: rowsForStep(rows, "wb.signal_trace.fetch_end").length,
    traceMergeChunk: stepMetrics(rows, "wb.trace_display.merge_chunk"),
    traceApplyCurrentWindow: stepMetrics(rows, "wb.trace_display.apply_current_window"),
    traceApplyCurrentStatus: meta(applyCurrent).status ?? null,
    traceSliceEvents: stepMetrics(rows, "wb.trace_display.slice_events"),
    chartEventsFallback: rowsForStep(rows, "wb.chart_events_fallback").length,
    chartEventsMerge: stepMetrics(rows, "wb.chart_events_merge"),
    auxOverlayApply: stepMetrics(rows, "wb.aux_overlay.apply_current_window"),
    auxOverlayMerge: stepMetrics(rows, "wb.aux_overlay.merge"),
    setDataAuxHtf: stepMetrics(rows, "chart.setData.aux_htf"),
    setDataCandles: stepMetrics(rows, "chart.setData.candles"),
    setDataAnchorEma: stepMetrics(rows, "chart.setData.anchor_ema"),
    markersRebuild: stepMetrics(rows, "chart.markers.rebuild"),
    componentMarkerCount: meta(markersRow).componentMarkerCount ?? null,
    tradeMarkerCount: meta(markersRow).tradeMarkerCount ?? null,
    cutoverPhase: meta(ownersRow).phase ?? debug?.cutoverPhase ?? null,
    domainOwners: meta(ownersRow).owners ?? debug?.domainOwners ?? null,
  };
}

function buildHarLike(networkEntries) {
  const signalTrace = networkEntries.filter((e) => e.endpointKind === "signal-trace");
  const chartEvents = networkEntries.filter((e) => e.endpointKind === "chart-events");
  const related = networkEntries.filter((e) =>
    ["candles-window", "ema-window", "chart-bundle", "run-report"].includes(e.endpointKind),
  );
  return {
    signalTrace: signalTrace.map((e) => ({
      url: e.url,
      path: e.path,
      params: e.params,
      status: e.status,
      method: e.method,
      requestStartMs: e.startMs,
      responseEndMs: e.startMs + (e.durationMs ?? 0),
      durationMs: e.durationMs,
      responseSize: e.responseSize,
      contextOverlayRef: e.params?.context_overlay_ref ?? null,
      from: e.params?.from ?? null,
      toOpenTimeMs: e.params?.to_open_time_ms ?? null,
      variant: e.params?.variant ?? null,
      bodySummary: e.bodySummary ?? null,
    })),
    chartEvents: chartEvents.map((e) => ({
      url: e.url,
      params: e.params,
      status: e.status,
      durationMs: e.durationMs,
      responseSize: e.responseSize,
      contextOverlayRef: e.params?.context_overlay_ref ?? null,
    })),
    related: related.map((e) => ({
      endpointKind: e.endpointKind,
      url: e.url,
      params: e.params,
      status: e.status,
      durationMs: e.durationMs,
      responseSize: e.responseSize,
    })),
  };
}

async function pollMilestone(page, checkFn, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = await page.evaluate(checkFn).catch(() => false);
    if (hit) return Date.now();
    await page.waitForTimeout(intervalMs);
  }
  return null;
}

const { gitBranch, run } = parseArgs();
const label = `${gitBranch.replace(/\//g, "-")}-run${run}`;
const outfile = `phase64-signal-trace-readiness-${label}.json`;
const commit = gitCommit();

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

const consolePipeline = [];
const networkEntries = [];
const pendingRequests = new Map();
let chartOpenT0 = null;
const milestones = {
  pageNavMs: null,
  reportReadyMs: null,
  overlayRefSelectedMs: null,
  chartOpenMs: null,
  candlesVisibleMs: null,
  emaVisibleMs: null,
  signalTraceRequestStartMs: null,
  signalTraceResponseEndMs: null,
  traceHintLoadedMs: null,
  mergeChunkMs: null,
  applyCurrentWindowMs: null,
  htfAuxVisibleMs: null,
  componentMarkersReadyMs: null,
  barInspectorReadyMs: null,
  timeoutReached: false,
};

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[pipeline]") || text.includes("[pipeline debug]")) {
    consolePipeline.push({ atMs: chartOpenT0 ? Date.now() - chartOpenT0 : null, type: msg.type(), text });
  }
});

page.on("request", (req) => {
  const url = req.url();
  if (!TRACE_URL_RE.test(url)) return;
  const { path, params } = parseUrl(url);
  const pending = { startMs: Date.now(), method: req.method(), url, path, params };
  pendingRequests.set(req, pending);
  if (path.includes("/signal-trace") && chartOpenT0 && milestones.signalTraceRequestStartMs === null) {
    milestones.signalTraceRequestStartMs = Date.now() - chartOpenT0;
  }
  networkEntries.push({
    phase: "request",
    method: req.method(),
    url,
    path,
    params,
    endpointKind: classifyEndpoint(path),
    startMs: chartOpenT0 ? Date.now() - chartOpenT0 : null,
  });
});

page.on("response", async (resp) => {
  const req = resp.request();
  const url = req.url();
  if (!TRACE_URL_RE.test(url)) return;
  const pending = pendingRequests.get(req);
  const startMs = pending?.startMs ?? Date.now();
  pendingRequests.delete(req);
  const { path, params } = parseUrl(url);
  let size = null;
  let bodySummary = null;
  try {
    const buf = await resp.body();
    size = buf.length;
    if (path.includes("/signal-trace") || path.includes("/chart-events")) {
      try {
        const json = JSON.parse(buf.toString("utf8"));
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
  } catch {
    /* ignore */
  }
  const relStart = chartOpenT0 ? startMs - chartOpenT0 : null;
  const durationMs = Date.now() - startMs;
  const entry = {
    phase: "response",
    method: req.method(),
    url,
    path,
    params,
    endpointKind: classifyEndpoint(path),
    status: resp.status(),
    startMs: relStart,
    durationMs,
    responseSize: size,
    bodySummary,
  };
  networkEntries.push(entry);
  if (path.includes("/signal-trace") && chartOpenT0 && milestones.signalTraceResponseEndMs === null) {
    milestones.signalTraceResponseEndMs = Date.now() - chartOpenT0;
  }
});

let report = {};

try {
  await disableCacheViaCdp(page);
  const navT0 = Date.now();
  console.log(`[${label}] git=${commit} opening Workbench for run ${TARGET_RUN} …`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 180_000 });
  milestones.pageNavMs = Date.now() - navT0;

  const pipelineDebugOk = await page.evaluate(
    () => typeof window.__pipelineDebugExport === "function",
  );

  await waitReportReady(page);
  milestones.reportReadyMs = Date.now() - navT0;

  const runSelect = page.locator("select").filter({ has: page.locator(`option[value="${TARGET_RUN}"]`) }).first();
  if (await runSelect.count()) {
    const current = await runSelect.inputValue().catch(() => "");
    if (current !== TARGET_RUN) {
      await runSelect.selectOption(TARGET_RUN);
      await page.waitForTimeout(2000);
    }
  }

  chartOpenT0 = Date.now();
  const chartTab = page.locator("button.tab-nav__btn", { hasText: /^Chart$/ });
  const chartTabActive = await chartTab.evaluate((el) => el.classList.contains("tab-nav__btn--active")).catch(() => false);
  if (!chartTabActive) {
    await chartTab.click({ timeout: 30_000 });
  }
  milestones.chartOpenMs = 0;

  const overlaySelect = page.locator(".chart-panel__overlay-ref select").first();
  if (await overlaySelect.count()) {
    const currentRef = await overlaySelect.inputValue().catch(() => "");
    if (currentRef !== TARGET_OVERLAY_REF) {
      await overlaySelect.selectOption(TARGET_OVERLAY_REF);
      milestones.overlayRefSelectedMs = Date.now() - chartOpenT0;
      await page.waitForTimeout(500);
    } else {
      milestones.overlayRefSelectedMs = 0;
    }
  }

  const milestoneDeadline = Date.now() + READINESS_TIMEOUT_MS;

  const candlesPromise = pollMilestone(
    page,
    () => {
      const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn === "function") {
        const candles = (exportFn()?.steps ?? []).find((r) => r.step === "chart.setData.candles");
        if ((candles?.last_meta?.barCount ?? 0) >= 50000) return true;
      }
      return hint.includes("OHLC") && hint.includes("Showing");
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.candlesVisibleMs = ts - chartOpenT0;
  });

  const emaPromise = pollMilestone(
    page,
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn === "function") {
        const ema = (exportFn()?.steps ?? []).find((r) => r.step === "chart.setData.anchor_ema");
        return (ema?.last_meta?.overlayCount ?? 0) === 3;
      }
      const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      return hint.includes("EMA stack");
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.emaVisibleMs = ts - chartOpenT0;
  });

  const traceHintPromise = pollMilestone(
    page,
    () => {
      const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      return hint.includes("signal trace loaded");
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.traceHintLoadedMs = ts - chartOpenT0;
  });

  const mergeChunkPromise = pollMilestone(
    page,
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn !== "function") return false;
      return (exportFn()?.steps ?? []).some((r) => r.step === "wb.trace_display.merge_chunk");
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.mergeChunkMs = ts - chartOpenT0;
  });

  const applyCurrentPromise = pollMilestone(
    page,
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn !== "function") return false;
      return (exportFn()?.steps ?? []).some(
        (r) => r.step === "wb.trace_display.apply_current_window" && r.last_meta?.status === "current",
      );
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.applyCurrentWindowMs = ts - chartOpenT0;
  });

  const htfAuxPromise = pollMilestone(
    page,
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn === "function") {
        const aux = (exportFn()?.steps ?? []).find((r) => r.step === "chart.setData.aux_htf");
        if ((aux?.last_meta?.overlayCount ?? 0) === 3) return true;
      }
      const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      return hint.includes("+3 aux EMA") || hint.includes("aux EMA");
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.htfAuxVisibleMs = ts - chartOpenT0;
  });

  const componentMarkersPromise = pollMilestone(
    page,
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn === "function") {
        const markers = (exportFn()?.steps ?? []).find((r) => r.step === "chart.markers.rebuild");
        const count = markers?.last_meta?.componentMarkerCount ?? 0;
        if (count > 0) return true;
      }
      return false;
    },
    READINESS_TIMEOUT_MS,
  ).then((ts) => {
    if (ts) milestones.componentMarkersReadyMs = ts - chartOpenT0;
  });

  await Promise.race([
    Promise.all([
      candlesPromise,
      emaPromise,
      traceHintPromise,
      mergeChunkPromise,
      applyCurrentPromise,
      htfAuxPromise,
      componentMarkersPromise,
    ]),
    new Promise((resolve) => setTimeout(resolve, READINESS_TIMEOUT_MS)),
  ]);

  if (Date.now() >= milestoneDeadline) {
    milestones.timeoutReached = true;
  }

  const canvas = page.locator(".chart-panel .chart-canvas canvas").first();
  if (await canvas.count()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
      const barInspectorTs = await pollMilestone(
        page,
        () => {
          const loading = document.querySelector(".bar-inspector__hint")?.textContent ?? "";
          if (loading.includes("Loading signal trace")) return false;
          const hasFinal = !!document.querySelector(".bar-inspector__section");
          const hasTime = !!document.querySelector(".bar-inspector__time");
          return hasFinal && hasTime;
        },
        120_000,
      );
      if (barInspectorTs) milestones.barInspectorReadyMs = barInspectorTs - chartOpenT0;
    }
  }

  await page.waitForTimeout(1500);

  const screenshotPath = join(OUT_DIR, `phase64-signal-trace-readiness-${label}.png`);
  await page.locator(".chart-panel").screenshot({ path: screenshotPath }).catch(async () => {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });

  const exported = await page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    const out = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: out.steps ?? [], debug: out.debug ?? {} };
  }, `phase64-signal-trace-readiness-${label}`);

  const hintText = await page.locator(".chart-panel .panel__hint").innerText().catch(() => "");
  const barInspectorText = await page.locator(".bar-inspector").innerText().catch(() => "");
  const overlayRefValue = await page.locator(".chart-panel__overlay-ref select").inputValue().catch(() => null);

  const pipeline = analyzePipeline(exported.rows, exported.debug);
  const harLike = buildHarLike(networkEntries.filter((e) => e.phase === "response"));

  const primaryTrace = harLike.signalTrace[0] ?? null;

  report = {
    captured_at: new Date().toISOString(),
    label,
    gitBranch,
    gitCommit: commit,
    run,
    targetRun: TARGET_RUN,
    targetOverlayRef: TARGET_OVERLAY_REF,
    variant: "instance_1",
    cacheReset: {
      browserContext: "new (no persistent profile)",
      browserCookies: "cleared",
      browserLocalStorage: "cleared via init script",
      browserSessionStorage: "cleared via init script",
      httpCache: "disabled via CDP Network.setCacheDisabled",
      frontendInMemory: "reset by Vite process restart (orchestrator)",
      bffProcess: "restarted by orchestrator before this run",
      osFileCache: "NOT explicitly cleared",
    },
    pipelineDebugOk,
    milestones,
    readinessTimeoutMs: READINESS_TIMEOUT_MS,
    network: {
      harLike,
      primarySignalTrace: primaryTrace,
      signalTraceCount: harLike.signalTrace.length,
      chartEventsCount: harLike.chartEvents.length,
    },
    pipeline,
    ui: {
      overlayRefValue,
      chartHint: hintText.slice(0, 500),
      barInspectorSnippet: barInspectorText.slice(0, 800),
    },
    consolePipelineCount: consolePipeline.length,
    consolePipelineSample: consolePipeline.slice(0, 30),
    rows: exported.rows,
    debug: exported.debug,
    screenshot: screenshotPath,
  };

  saveJson(outfile, report);

  console.log(`\n=== ${label} ===`);
  console.log(`commit: ${commit}`);
  console.log(`pipelineDebug: ${pipelineDebugOk}`);
  console.log(`signal-trace network: ${primaryTrace?.durationMs ?? "n/a"}ms size=${primaryTrace?.responseSize ?? "n/a"}`);
  console.log(`api.fetchSignalTrace: ${pipeline.fetchSignalTrace.total_ms}ms`);
  console.log(`merge_chunk: ${pipeline.traceMergeChunk.total_ms}ms`);
  console.log(`apply_current status=${pipeline.traceApplyCurrentStatus}`);
  console.log(`aux_htf overlayCount=${pipeline.setDataAuxHtf.last_meta?.overlayCount ?? "n/a"}`);
  console.log(`componentMarkerCount=${pipeline.componentMarkerCount}`);
  console.log(`milestones: candles=${milestones.candlesVisibleMs}ms traceResp=${milestones.signalTraceResponseEndMs}ms htf=${milestones.htfAuxVisibleMs}ms inspector=${milestones.barInspectorReadyMs}ms`);
} finally {
  await context.close();
  await browser.close();
}
