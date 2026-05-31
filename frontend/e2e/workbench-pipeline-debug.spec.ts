import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, "../../debug/reports");
const RUN_ID = "2026-05-23T120000Z_ema_pullback_BTCUSDT_5m_v4_fixture";

type PipelineExportRow = {
  step: string;
  count: number;
  total_ms: number;
  max_ms: number;
  avg_ms: number;
};

function ensureReportsDir(): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function stampFromEnv(): string {
  return process.env.WORKBENCH_DEBUG_STAMP ?? "manual";
}

async function waitForChartReady(page: Page): Promise<void> {
  const hint = page.locator(".chart-panel .panel__hint");
  await expect(hint).toContainText(/Showing|OHLC/i, { timeout: 120_000 });
  const fullCached = page.getByText("Full report range cached");
  const marketUnavailable = page.getByText("Market data unavailable");
  await expect
    .poll(
      async () => {
        if (await fullCached.isVisible().catch(() => false)) return "cached";
        const hintText = await hint.innerText();
        if (/Showing/i.test(hintText) && !(await marketUnavailable.isVisible().catch(() => false))) {
          return "fallback";
        }
        return "pending";
      },
      { timeout: 120_000 },
    )
    .not.toBe("pending");
}

async function panChart(page: Page, deltaX: number): Promise<void> {
  const canvas = page.locator(".chart-panel canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = await canvas.boundingBox();
  if (!box) return;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + deltaX, cy, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function captureScenario(
  page: Page,
  scenario: string,
  stamp: string,
  logLines: string[],
): Promise<void> {
  await page.evaluate((label) => {
    const w = window as unknown as {
      __pipelineDebugFlush?: (l?: string) => void;
      __pipelineDebugExport?: () => PipelineExportRow[];
    };
    w.__pipelineDebugFlush?.(label);
    return w.__pipelineDebugExport?.() ?? [];
  }, scenario);

  const rows = await page.evaluate(() => {
    const w = window as unknown as { __pipelineDebugExport?: () => PipelineExportRow[] };
    return w.__pipelineDebugExport?.() ?? [];
  });

  const section = [
    "",
    `=== scenario: ${scenario} ===`,
    JSON.stringify(rows, null, 2),
    "",
  ].join("\n");
  logLines.push(section);
  fs.writeFileSync(path.join(REPORTS_DIR, `workbench_${scenario}_${stamp}.txt`), section);

  await page.evaluate(() => {
    const w = window as unknown as { __pipelineDebugReset?: () => void };
    w.__pipelineDebugReset?.();
  });
}

test.describe("workbench pipeline debug", () => {
  test("capture four profiling scenarios to debug/reports", async ({ page }) => {
    test.setTimeout(300_000);
    ensureReportsDir();
    const stamp = stampFromEnv();
    const logLines: string[] = [
      `Workbench pipeline debug e2e`,
      `stamp=${stamp}`,
      `run=${RUN_ID}`,
      "",
    ];

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[pipeline]") || text.includes("PIPELINE_DEBUG")) {
        logLines.push(text);
      }
    });

    await test.step("open run and chart", async () => {
      console.log("[workbench-debug] goto + select fixture run (up to 60s)…");
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.getByRole("button", { name: "Reports" }).click();
      await page.locator(".context-bar select").first().selectOption(RUN_ID);
      await expect(page.getByText(/schema v4/i)).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: "Chart" }).click();
      console.log("[workbench-debug] waiting for chart/market (up to 120s)…");
      await waitForChartReady(page);
      console.log("[workbench-debug] chart ready");
    });

    await test.step("scenario: trade-select", async () => {
      const tradeTable = page.locator(".trade-table:not(.breakdown-table)");
      const firstRow = tradeTable.locator("tbody tr").first();
      await expect(firstRow).toBeVisible({ timeout: 30_000 });
      await firstRow.click();
      await page.waitForTimeout(800);
      await captureScenario(page, "trade-select", stamp, logLines);
    });

    await test.step("scenario: pan-safe-zone", async () => {
      await panChart(page, -80);
      await page.waitForTimeout(600);
      await captureScenario(page, "pan-safe-zone", stamp, logLines);
    });

    await test.step("scenario: pan-window-shift", async () => {
      await panChart(page, -600);
      await page.waitForTimeout(1200);
      await captureScenario(page, "pan-window-shift", stamp, logLines);
    });

    await test.step("scenario: trace-display-cache-hit", async () => {
      await panChart(page, 400);
      await page.waitForTimeout(800);
      await captureScenario(page, "trace-display-cache-hit", stamp, logLines);
    });

    const overlaySelect = page.locator(".chart-panel__overlay-ref select");
    if ((await overlaySelect.count()) > 0) {
      await expect(overlaySelect).toBeVisible();
    }

    const logPath = path.join(REPORTS_DIR, `workbench_${stamp}.log`);
    fs.appendFileSync(
      logPath,
      `\n\n=== [pipeline] console lines ===\n${logLines.join("\n")}\n`,
    );

    const exportCheck = await page.evaluate(() => {
      const w = window as unknown as { __pipelineDebugExport?: () => PipelineExportRow[] };
      return typeof w.__pipelineDebugExport === "function";
    });
    expect(exportCheck).toBe(true);
    expect(logLines.some((l) => l.includes("[pipeline]") || l.includes("PIPELINE_DEBUG"))).toBe(
      true,
    );
  });
});
