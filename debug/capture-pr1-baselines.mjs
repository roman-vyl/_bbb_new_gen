/**
 * One-shot PR1 baseline capture. Requires dev-workbench.ps1 -PipelineDebug.
 * Usage: cd frontend && node ../debug/capture-pr1-baselines.mjs
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

async function assertPipelineDebug(page) {
  const ok = await page.evaluate(
    () =>
      typeof window.__pipelineDebugExport === "function" &&
      typeof window.__pipelineDebugReset === "function",
  );
  if (!ok) {
    throw new Error("VITE_EMA_PIPELINE_DEBUG is off — restart with scripts/dev-workbench.ps1 -PipelineDebug");
  }
}

async function pipelineReset(page) {
  await page.evaluate(() => window.__pipelineDebugReset());
}

async function pipelineExport(page, label) {
  return page.evaluate((scenarioLabel) => {
    window.__pipelineDebugFlush?.(scenarioLabel);
    return window.__pipelineDebugExport?.() ?? [];
  }, label);
}

async function waitReportReady(page) {
  await page.getByText("Loading research run…").waitFor({ state: "detached", timeout: 120_000 }).catch(async () => {
    await page.locator(".context-bar").waitFor({ timeout: 120_000 });
  });
  const error = page.locator(".workbench-gate--error");
  if (await error.isVisible().catch(() => false)) {
    const msg = await error.innerText();
    throw new Error(`Report load error: ${msg}`);
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
      throw new Error("Market data unavailable — BFF/market DB not ready");
    }
    if (!text.includes("Showing") || !text.includes("OHLC")) {
      throw new Error(`Chart not ready; hint: ${text.slice(0, 200)}`);
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

async function panChartUntilShift(page, maxAttempts = 80) {
  const surface = page.locator(".chart-canvas canvas").first();
  await surface.waitFor({ state: "visible", timeout: 30_000 });

  let sawShift = false;
  for (let i = 0; i < maxAttempts; i += 1) {
    const before = await page.evaluate(() =>
      (window.__pipelineDebugExport?.() ?? []).find((r) => r.step === "wb.render_window.shift_applied"),
    );

    const box = await surface.boundingBox();
    if (box) {
      const y = box.y + box.height * 0.55;
      const startX = box.x + box.width * 0.12;
      const endX = box.x + box.width * 0.92;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(endX, y, { steps: 28 });
      await page.mouse.up();
    }

    await page.waitForTimeout(450);

    const after = await page.evaluate(() =>
      (window.__pipelineDebugExport?.() ?? []).find((r) => r.step === "wb.render_window.shift_applied"),
    );
    if ((after?.count ?? 0) > (before?.count ?? 0)) {
      sawShift = true;
      break;
    }
  }

  if (!sawShift) {
    console.warn("warn: wb.render_window.shift_applied not seen — exporting pan attempt anyway");
  }

  try {
    await page.waitForResponse(
      (resp) => resp.url().includes("/signal-trace") && resp.status() === 200,
      { timeout: 120_000 },
    );
  } catch {
    // boundary pan may reuse session cache
  }
  await page.waitForTimeout(2500);
}

function saveJson(name, rows) {
  const path = join(OUT_DIR, name);
  const payload = {
    scenario: name.replace(/^workbench-|\.json$/g, ""),
    captured_at: new Date().toISOString(),
    rows,
  };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${path} (${rows.length} steps)`);
}

async function scenarioColdChartOpen(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  const rows = await pipelineExport(page, "cold-chart-open");
  saveJson("workbench-cold-chart-open.json", rows);
}

async function waitTradeTable(page) {
  await page.locator(".reports-panel").waitFor({ state: "visible", timeout: 120_000 });
}

async function scenarioTabSwitchChart(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await page.getByRole("button", { name: "Reports" }).click();
  await waitTradeTable(page);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Chart" }).click();
  await waitChartReady(page);
  const rows = await pipelineExport(page, "tab-switch-chart");
  saveJson("workbench-tab-switch-chart.json", rows);
}

async function scenarioLongPanBoundary(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await panChartUntilShift(page);
  const rows = await pipelineExport(page, "long-pan-boundary");
  saveJson("workbench-long-pan-boundary.json", rows);
}

async function scenarioDistantTradeNavigation(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await assertPipelineDebug(page);
  await waitReportReady(page);
  await waitChartReady(page);
  await pipelineReset(page);
  await page.getByRole("button", { name: "Reports" }).click();
  await waitTradeTable(page);
  const farRow = page.locator(".reports-panel .trade-table:not(.breakdown-table) tbody tr").first();
  await farRow.waitFor({ state: "attached", timeout: 120_000 });
  const tradeId = (await farRow.locator("td").first().innerText()).trim();
  await farRow.click({ force: true });
  await page.getByRole("button", { name: "Chart" }).click();
  await page.locator(".chart-trade-nav").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForFunction(
    () => document.querySelector(".chart-panel .panel__hint")?.textContent?.includes("trade focus") === true,
    { timeout: 120_000 },
  );
  await waitChartReady(page, { waitSignalTrace: false });
  const exported = await pipelineExport(page, "distant-trade-navigation");
  saveJson("workbench-distant-trade-navigation.json", exported);
}

const browser = await chromium.launch({
  headless: process.env.PR1_BASELINE_HEADED !== "1",
  slowMo: process.env.PR1_BASELINE_HEADED === "1" ? 40 : 0,
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

const onlyFrom = Number(process.env.PR1_BASELINE_FROM ?? "1");

const scenarios = [
  ["cold-chart-open", scenarioColdChartOpen],
  ["tab-switch-chart", scenarioTabSwitchChart],
  ["long-pan-boundary", scenarioLongPanBoundary],
  ["distant-trade-navigation", scenarioDistantTradeNavigation],
];

try {
  for (let i = 0; i < scenarios.length; i += 1) {
    if (i + 1 < onlyFrom) continue;
    const [name, fn] = scenarios[i];
    console.log(`${i + 1}/4 ${name} …`);
    await fn(page);
  }
  console.log("done");
} finally {
  await browser.close();
}
