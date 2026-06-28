/**
 * Phase 6.4 main vs branch cold-open market load diagnostic.
 * Requires workbench running with VITE_EMA_PIPELINE_DEBUG=true (if available on branch).
 *
 * Usage:
 *   cd frontend && node ../debug/capture-phase64-main-vs-branch-smoke.mjs --git-branch main --run 1
 *   cd frontend && node ../debug/capture-phase64-main-vs-branch-smoke.mjs --git-branch branch --run 2
 */
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "../frontend/package.json"));
const { chromium } = require("@playwright/test");

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(__dirname, "reports", "phase64-main-vs-branch");
const BASE_URL = "http://127.0.0.1:5173";

const MARKET_URL_RE =
  /\/api\/(market\/(chart-bundle|candles-window|ema-window|candles|overlay)|research\/runs\/)/;

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
  if (!gitBranch) throw new Error("Missing --git-branch main|branch|new-workbench-chart-runtime-v2");
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
    const params = Object.fromEntries(u.searchParams.entries());
    return { path: u.pathname, params, host: u.host };
  } catch {
    return { path: url, params: {}, host: "" };
  }
}

function classifyEndpoint(path) {
  if (path.includes("/chart-bundle")) return "chart-bundle";
  if (path.includes("/candles-window")) return "candles-window";
  if (path.includes("/ema-window")) return "ema-window";
  if (path.includes("/signal-trace")) return "signal-trace";
  if (path.includes("/chart-events")) return "chart-events";
  if (path.includes("/candles?")) return "candles-legacy";
  if (path.includes("/overlay")) return "overlay";
  if (path.includes("/runs/") && path.includes("/report")) return "run-report";
  if (path.includes("/runs/")) return "runs-other";
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
  };
}

function analyzeNetwork(entries) {
  const completed = entries.filter((e) => e.phase === "response" && e.status !== undefined);
  const byEndpoint = {};
  for (const e of completed) {
    const kind = e.endpointKind ?? classifyEndpoint(e.path ?? "");
    byEndpoint[kind] ??= [];
    byEndpoint[kind].push(e);
  }

  const emaRequests = completed.filter((e) => e.endpointKind === "ema-window" || (e.path ?? "").includes("ema-window"));
  const candlesRequests = completed.filter(
    (e) => e.endpointKind === "candles-window" || (e.path ?? "").includes("candles-window"),
  );
  const bundleRequests = completed.filter(
    (e) => e.endpointKind === "chart-bundle" || (e.path ?? "").includes("chart-bundle"),
  );

  const emaParams = emaRequests.map((e) => ({
    period: e.params?.period ?? e.params?.ema_period ?? null,
    fromMs: e.params?.from_ms ?? e.params?.from ?? null,
    toOpenTimeMs: e.params?.to_open_time_ms ?? null,
    durationMs: e.durationMs,
    status: e.status,
  }));

  const candlesParams = candlesRequests.map((e) => ({
    fromMs: e.params?.from_ms ?? e.params?.from ?? null,
    toOpenTimeMs: e.params?.to_open_time_ms ?? null,
    durationMs: e.durationMs,
    status: e.status,
  }));

  return {
    totalMarketRequests: completed.length,
    chartBundleCount: bundleRequests.length,
    candlesWindowCount: candlesRequests.length,
    emaWindowCount: emaRequests.length,
    signalTraceCount: (byEndpoint["signal-trace"] ?? []).length,
    chartEventsCount: (byEndpoint["chart-events"] ?? []).length,
    emaParams,
    candlesParams,
    byEndpoint: Object.fromEntries(
      Object.entries(byEndpoint).map(([k, v]) => [
        k,
        {
          count: v.length,
          durationsMs: v.map((x) => x.durationMs),
          maxMs: v.length ? Math.max(...v.map((x) => x.durationMs ?? 0)) : 0,
          totalMs: Number(v.reduce((s, x) => s + (x.durationMs ?? 0), 0).toFixed(1)),
        },
      ]),
    ),
    entries: completed,
  };
}

function analyzePipeline(rows, debug) {
  if (!rows?.length) return { available: false };
  const ownersRow = findRow(rows, "wb.cutover.domain_owners");
  const ownersMeta = meta(ownersRow);
  return {
    available: true,
    fetchChartMarketBundle: stepMetrics(rows, "api.fetchChartMarketBundle"),
    fetchCandlesWindow: stepMetrics(rows, "api.fetchCandlesWindow"),
    fetchEmaWindow: stepMetrics(rows, "api.fetchEmaWindow"),
    fetchSignalTrace: stepMetrics(rows, "api.fetchSignalTrace"),
    fetchChartEvents: stepMetrics(rows, "api.fetchChartEvents"),
    marketFetchStart: rowsForStep(rows, "wb.market_fetch.start").reduce((s, r) => s + (r.count ?? 0), 0),
    marketFetchEnd: rowsForStep(rows, "wb.market_fetch.end").reduce((s, r) => s + (r.count ?? 0), 0),
    cacheHit: rowsForStep(rows, "wb.market_fetch.cache_hit").reduce((s, r) => s + (r.count ?? 0), 0),
    emaDecisions: rowsForStep(rows, "wb.market_ema_decision").map((r) => meta(r)),
    candlesBarCount: meta(findRow(rows, "chart.setData.candles")).barCount ?? null,
    emaOverlayCount: meta(findRow(rows, "chart.setData.anchor_ema")).overlayCount ?? null,
    cutoverPhase: ownersMeta.phase ?? debug?.cutoverPhase ?? null,
    domainOwners: ownersMeta.owners ?? debug?.domainOwners ?? null,
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

async function waitChartStable(page, t0) {
  const hint = page.locator(".chart-panel .panel__hint");
  try {
    await page.getByText("Full report range cached").waitFor({ timeout: 180_000 });
  } catch {
    await hint.waitFor({ timeout: 180_000 });
    const text = await hint.innerText();
    if (text.includes("Market data unavailable")) throw new Error("Market data unavailable");
    if (!text.includes("Showing") || !text.includes("OHLC")) {
      throw new Error(`Chart not ready: ${text.slice(0, 200)}`);
    }
  }

  await page.waitForFunction(
    () => {
      const hintText = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
      const hasOhlc = hintText.includes("OHLC") || hintText.includes("Showing");
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn === "function") {
        const rows = exportFn()?.steps ?? [];
        const candles = rows.find((r) => r.step === "chart.setData.candles");
        const ema = rows.find((r) => r.step === "chart.setData.anchor_ema");
        const barCount = candles?.last_meta?.barCount ?? 0;
        const overlayCount = ema?.last_meta?.overlayCount ?? 0;
        if (barCount >= 50000 && overlayCount === 3) return true;
      }
      return hasOhlc && (hintText.includes("signal trace") || hintText.includes("trade markers"));
    },
    { timeout: 600_000 },
  );

  await page.waitForTimeout(1200);
  return Date.now() - t0;
}

function saveJson(name, payload) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
  return path;
}

const { gitBranch, run } = parseArgs();
const label = `${gitBranch.replace(/\//g, "-")}-run${run}`;
const outfile = `phase64-main-vs-branch-${label}.json`;
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
const t0 = Date.now();
let candlesVisibleMs = null;
let emaVisibleMs = null;
let markersVisibleMs = null;

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[pipeline]") || text.includes("[pipeline debug]")) {
    consolePipeline.push({ atMs: Date.now() - t0, type: msg.type(), text });
  }
});

page.on("request", (req) => {
  const url = req.url();
  if (!MARKET_URL_RE.test(url)) return;
  const { path, params } = parseUrl(url);
  const id = req.url() + req.method() + Date.now();
  pendingRequests.set(req, { id, startMs: Date.now(), method: req.method(), url, path, params });
});

page.on("response", async (resp) => {
  const req = resp.request();
  const url = req.url();
  if (!MARKET_URL_RE.test(url)) return;
  const pending = pendingRequests.get(req);
  const startMs = pending?.startMs ?? t0;
  pendingRequests.delete(req);
  const { path, params } = parseUrl(url);
  let size = null;
  try {
    const buf = await resp.body();
    size = buf.length;
  } catch {
    /* ignore */
  }
  const entry = {
    phase: "response",
    method: req.method(),
    url,
    path,
    params,
    endpointKind: classifyEndpoint(path),
    status: resp.status(),
    startMs: startMs - t0,
    durationMs: Date.now() - startMs,
    responseSize: size,
  };
  networkEntries.push(entry);
});

page.on("requestfailed", (req) => {
  const url = req.url();
  if (!MARKET_URL_RE.test(url)) return;
  const pending = pendingRequests.get(req);
  const startMs = pending?.startMs ?? t0;
  pendingRequests.delete(req);
  const { path, params } = parseUrl(url);
  networkEntries.push({
    phase: "failed",
    method: req.method(),
    url,
    path,
    params,
    endpointKind: classifyEndpoint(path),
    failure: req.failure()?.errorText ?? "unknown",
    startMs: startMs - t0,
    durationMs: Date.now() - startMs,
  });
});

let report = {};

try {
  await disableCacheViaCdp(page);
  console.log(`[${label}] git=${commit} opening Workbench …`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 180_000 });

  const pipelineDebugOk = await page.evaluate(
    () => typeof window.__pipelineDebugExport === "function",
  );

  await waitReportReady(page);

  page.waitForFunction(
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn !== "function") {
        const text = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
        return text.includes("Showing") && text.includes("OHLC");
      }
      const rows = exportFn()?.steps ?? [];
      return rows.some((r) => r.step === "chart.setData.candles");
    },
    { timeout: 600_000 },
  ).then(() => {
    candlesVisibleMs = Date.now() - t0;
  }).catch(() => {});

  page.waitForFunction(
    () => {
      const exportFn = window.__pipelineDebugExport;
      if (typeof exportFn !== "function") return false;
      const ema = (exportFn()?.steps ?? []).find((r) => r.step === "chart.setData.anchor_ema");
      return (ema?.last_meta?.overlayCount ?? 0) === 3;
    },
    { timeout: 600_000 },
  ).then(() => {
    emaVisibleMs = Date.now() - t0;
  }).catch(() => {});

  const totalStableMs = await waitChartStable(page, t0);
  markersVisibleMs = Date.now() - t0;

  const screenshotPath = join(OUT_DIR, `phase64-main-vs-branch-${label}.png`);
  await page.locator(".chart-panel").screenshot({ path: screenshotPath }).catch(async () => {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  });

  const exported = await page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    const out = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: out.steps ?? [], debug: out.debug ?? {} };
  }, `phase64-main-vs-branch-${label}`);

  const network = analyzeNetwork(networkEntries);
  const pipeline = analyzePipeline(exported.rows, exported.debug);

  const hintText = await page.locator(".chart-panel .panel__hint").innerText().catch(() => "");

  report = {
    captured_at: new Date().toISOString(),
    label,
    gitBranch,
    gitCommit: commit,
    run,
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
    timings: {
      totalStableMs,
      candlesVisibleMs,
      emaVisibleMs,
      markersVisibleMs,
    },
    network,
    pipeline,
    chartHint: hintText.slice(0, 300),
    consolePipelineCount: consolePipeline.length,
    consolePipelineSample: consolePipeline.slice(0, 20),
    rows: exported.rows,
    debug: exported.debug,
    screenshot: screenshotPath,
  };

  saveJson(outfile, report);

  console.log(`\n=== ${label} ===`);
  console.log(`commit: ${commit}`);
  console.log(`chart-bundle: ${network.chartBundleCount}`);
  console.log(`candles-window: ${network.candlesWindowCount}`);
  console.log(`ema-window: ${network.emaWindowCount}`);
  console.log(`signal-trace: ${network.signalTraceCount}`);
  if (pipeline.available) {
    console.log(`pipeline fetchEma: count=${pipeline.fetchEmaWindow.count} total=${pipeline.fetchEmaWindow.total_ms}ms max=${pipeline.fetchEmaWindow.max_ms}ms`);
    console.log(`market_fetch start/end: ${pipeline.marketFetchStart}/${pipeline.marketFetchEnd} cache_hit=${pipeline.cacheHit}`);
  }
  console.log(`totalStableMs: ${totalStableMs}`);
} finally {
  await context.close();
  await browser.close();
}
