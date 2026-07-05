import { test, expect } from "@playwright/test";

test("trade nav 20+ steps — console and pipeline debug", async ({ page }) => {
  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("wb.trade_focus") ||
      text.includes("trade_focus") ||
      text.includes("pipeline debug") ||
      msg.type() === "error"
    ) {
      consoleLines.push(`[${msg.type()}] ${text}`);
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: "Reports" }).click();
  const tradeTable = page.locator(".reports-panel .trade-table:not(.breakdown-table)");
  await tradeTable.waitFor({ state: "attached", timeout: 60_000 });
  await tradeTable.scrollIntoViewIfNeeded();

  const rows = tradeTable.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(25);

  await tradeTable.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document
      .querySelector(".reports-panel .trade-table:not(.breakdown-table) tbody tr.trade-row")
      ?.click();
  });
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Chart", exact: true }).click();
  await expect(page.locator(".chart-trade-nav")).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    const w = window as Window & { __pipelineDebugReset?: () => void };
    w.__pipelineDebugReset?.();
  });

  const steps = 22;
  for (let i = 0; i < steps; i++) {
    const nextBtn = page.getByRole("button", { name: "Next trade" });
    await expect(nextBtn).toBeEnabled({ timeout: 15_000 });
    await nextBtn.click();
    await page.waitForTimeout(400);
  }

  const hint = await page.locator(".chart-panel .panel__hint").innerText();
  expect(hint).toContain("trade focus");
  expect(hint).toMatch(/Showing \d+ of \d+ bars/);

  const exportData = await page.evaluate(() => {
    const w = window as Window & {
      __pipelineDebugExport?: () => { rows: { event: string }[] };
      __pipelineDebugFlush?: (label?: string) => void;
    };
    w.__pipelineDebugFlush?.("trade-nav-20");
    return w.__pipelineDebugExport?.() ?? null;
  });

  const tradeFocusEvents =
    exportData?.rows
      ?.map((r) => r.event)
      .filter((e) => e.startsWith("wb.trade_focus.")) ?? [];

  const counts = tradeFocusEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e] = (acc[e] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n=== trade focus event counts ===");
  console.log(JSON.stringify(counts, null, 2));
  console.log("\n=== console highlights ===");
  for (const line of consoleLines.slice(-40)) {
    console.log(line);
  }

  expect(tradeFocusEvents.length).toBeGreaterThan(0);
  expect(counts["wb.trade_focus.request"] ?? 0).toBeGreaterThanOrEqual(steps);
  expect(counts["wb.trade_focus.applied"] ?? 0).toBeGreaterThan(0);
});
