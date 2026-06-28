/**
 * Phase 6.3F browser smoke. Requires ./scripts/dev-workbench.sh --pipeline-debug
 * Usage: cd frontend && node ../debug/capture-phase63F-smoke.mjs
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
const MARKET_STEPS = [
  "wb.market_candles_decision",
  "wb.market_ema_decision",
  "wb.market_fetch.start",
  "wb.market_fetch.end",
  "wb.load.market_bundle_ready",
];

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

function assert6_3F(rows, exportDebug, label, { requireBundleReady = false } = {}) {
  const { phase, owners: o } = resolveOwners(rows, exportDebug);
  if (phase !== "6.3F") throw new Error(`${label}: phase=${phase}, expected 6.3F`);
  for (const domain of ["model", "render_window", "viewport", "trace", "aux_overlay", "market"]) {
    if (o[domain] !== V2) {
      throw new Error(`${label}: ${domain}=${o[domain]}, expected ${V2}`);
    }
  }
  const bundleReady = findRow(rows, "wb.load.market_bundle_ready");
  if (requireBundleReady && !bundleReady) {
    throw new Error(`${label}: missing wb.load.market_bundle_ready`);
  }
  if (bundleReady) {
    const br = meta(bundleReady);
    if (br.owner !== V2) {
      throw new Error(`${label}: market_bundle_ready owner=${br.owner}`);
    }
    if (br.domain !== "market") {
      throw new Error(`${label}: market_bundle_ready domain=${br.domain}`);
    }
    const barCount = br.barCount ?? br.count ?? 0;
    if (!barCount || barCount <= 0) {
      throw new Error(`${label}: market_bundle_ready barCount=${barCount}`);
    }
  }
  for (const step of MARKET_STEPS) {
    const row = findRow(rows, step);
    if (row && meta(row).owner && meta(row).owner !== V2) {
      throw new Error(`${label}: ${step} owner=${meta(row).owner}`);
    }
  }
  const emptySetData = rows.filter(
    (r) =>
      (r.step === "chart.setData.candles" || r.step === "REPEAT chart.setData.candles") &&
      (meta(r).count === 0 || meta(r).barCount === 0),
  );
  if (emptySetData.length > 1) {
    throw new Error(`${label}: repeated empty chart.setData.candles (${emptySetData.length})`);
  }
}

async function assertPipelineDebug(page) {
  const ok = await page.evaluate(
    () =>
      typeof window.__pipelineDebugExport === "function" &&
      typeof window.__pipelineDebugReset === "function",
  );
  if (!ok) {
    throw new Error("VITE_EMA_PIPELINE_DEBUG off — use ./scripts/dev-workbench.sh --pipeline-debug");
  }
}

async function pipelineReset(page) {
  await page.evaluate(() => window.__pipelineDebugReset());
}

async function pipelineExport(page, label) {
  return page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    const exported = window.__pipelineDebugExport?.() ?? { steps: [], debug: {} };
    return { rows: exported.steps ?? [], debug: exported.debug ?? {} };
  }, label);
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

async function waitChartReady(page, { waitSignalTrace = true } = {}) {
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
  if (waitSignalTrace) {
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes("/signal-trace") && resp.status() === 200,
        { timeout: 180_000 },
      );
    } catch {
      await page.waitForFunction(
        () => {
          const text = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
          return (
            text.includes("signal trace loaded") ||
            (text.includes("component events") && !text.includes("Loading events"))
          );
        },
        { timeout: 180_000 },
      );
    }
  }
  await page.waitForTimeout(1200);
}

async function panLeftNearBoundary(page, maxAttempts = 60) {
  const surface = page.locator(".chart-canvas canvas").first();
  await surface.waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < maxAttempts; i += 1) {
    const box = await surface.boundingBox();
    if (box) {
      const y = box.y + box.height * 0.55;
      const startX = box.x + box.width * 0.88;
      const endX = box.x + box.width * 0.08;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(Math.max(box.x + 20, endX), y, { steps: 24 });
      await page.mouse.up();
    }
    await page.waitForTimeout(400);
    const panMark = await page.evaluate(() =>
      (window.__pipelineDebugExport?.()?.steps ?? []).some(
        (r) =>
          r.step.includes("wb.market_pan_prefetch_decision") &&
          r.last_meta?.owner === "runtime_v2_production",
      ),
    );
    if (panMark) return;
  }
}

function saveJson(name, payload) {
  const path = join(OUT_DIR, name);
  writeFileSync(path, `${JSON.stringify({ captured_at: new Date().toISOString(), ...payload }, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
}

const results = [];

async function scenarioColdOpen(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  const { rows, debug } = await pipelineExport(page, "phase63F-cold-open");
  assert6_3F(rows, debug, "cold-open", { requireBundleReady: true });
  const { phase, owners } = resolveOwners(rows, debug);
  results.push({ scenario: "A-cold-open", ok: true, phase, owners });
  saveJson("phase63F-cold-open.json", { assertions: results.at(-1), rows, debug });
}

async function scenarioTradeFocus(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await page.getByRole("button", { name: "Reports" }).click();
  await page.locator(".reports-panel").waitFor({ state: "visible", timeout: 120_000 });
  const farRow = page.locator(".reports-panel .trade-table:not(.breakdown-table) tbody tr").first();
  await farRow.waitFor({ state: "attached", timeout: 120_000 });
  await farRow.click({ force: true });
  await page.getByRole("button", { name: "Chart" }).click();
  await page.locator(".chart-trade-nav").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector(".chart-panel .panel__hint")?.textContent?.includes("trade focus") === true,
    { timeout: 120_000 },
  );
  await waitChartReady(page, { waitSignalTrace: false });
  const hintText = await page.locator(".chart-panel .panel__hint").innerText();
  if (!hintText.includes("trade focus")) {
    throw new Error(`trade-focus: hint missing trade focus (${hintText.slice(0, 120)})`);
  }
  const { rows, debug } = await pipelineExport(page, "phase63F-trade-focus");
  assert6_3F(rows, debug, "trade-focus");
  results.push({ scenario: "B-trade-focus", ok: true, tradeFocus: true, hint: hintText.slice(0, 80) });
  saveJson("phase63F-trade-focus.json", { assertions: results.at(-1), rows, debug });
}

async function scenarioLeftPan(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await panLeftNearBoundary(page);
  const { rows, debug } = await pipelineExport(page, "phase63F-left-pan");
  assert6_3F(rows, debug, "left-pan");
  const fetchStarts = rows.filter((r) => r.step.includes("wb.market_fetch.start"));
  if (fetchStarts.length > 8) {
    throw new Error(`left-pan: fetch storm (${fetchStarts.length} wb.market_fetch.start)`);
  }
  results.push({
    scenario: "C-left-pan",
    ok: true,
    panPrefetch: rows.some((r) => r.step.includes("wb.market_pan_prefetch_decision")),
    fetchStarts: fetchStarts.length,
  });
  saveJson("phase63F-left-pan.json", { assertions: results.at(-1), rows, debug });
}

async function scenarioCacheRevisit(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await page.getByRole("button", { name: "Reports" }).click();
  await page.locator(".reports-panel").waitFor({ state: "visible" });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Chart" }).click();
  await waitChartReady(page);
  const { rows, debug } = await pipelineExport(page, "phase63F-cache-revisit");
  assert6_3F(rows, debug, "cache-revisit");
  const cacheHits = rows.filter((r) => r.step.includes("wb.market_fetch.cache_hit"));
  const bundleReadyCount = rows.filter((r) => r.step.includes("wb.load.market_bundle_ready")).length;
  if (bundleReadyCount > 3) {
    throw new Error(`cache-revisit: bundle ready churn (${bundleReadyCount})`);
  }
  results.push({
    scenario: "D-cache-revisit",
    ok: true,
    cacheHits: cacheHits.length,
    bundleReadyCount,
  });
  saveJson("phase63F-cache-revisit.json", { assertions: results.at(-1), rows, debug });
}

const ONLY = process.env.PHASE63F_ONLY?.trim() ?? "";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const allScenarios = [
  ["cold-open", scenarioColdOpen],
  ["trade-focus", scenarioTradeFocus],
  ["left-pan", scenarioLeftPan],
  ["cache-revisit", scenarioCacheRevisit],
];

const scenarios = ONLY
  ? allScenarios.filter(([name]) => name === ONLY)
  : allScenarios;

if (scenarios.length === 0) {
  throw new Error(`Unknown PHASE63F_ONLY=${ONLY}`);
}

try {
  for (const [name, fn] of scenarios) {
    console.log(`${name} …`);
    await fn(page);
  }
  if (!ONLY) {
    writeFileSync(join(OUT_DIR, "phase63F-smoke-summary.json"), `${JSON.stringify(results, null, 2)}\n`);
  }
  console.log("phase63F smoke OK:", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
