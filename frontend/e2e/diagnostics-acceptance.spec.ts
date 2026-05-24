import { test, expect } from "@playwright/test";

const V3_RUN_ID = "2026-05-01T120000Z_ema_pullback_BTCUSDT_5m_fixture";
const V4_RUN_ID = "2026-05-23T120000Z_ema_pullback_BTCUSDT_5m_v4_fixture";

test.describe("diagnostics acceptance", () => {
  test("v4 run shows diagnostics, filters, columns, and chart focus", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: "Reports" }).click();

    const runSelect = page.locator(".context-bar select").first();
    await runSelect.selectOption(V4_RUN_ID);
    await expect(page.getByText(/schema v4/)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("Fee diagnostics")).toBeVisible();
    await expect(page.getByText("Profile breakdown")).toBeVisible();
    await expect(page.getByText("Exit reason breakdown")).toBeVisible();
    await expect(page.getByText("Total fees")).toBeVisible();
    await expect(page.getByText("aligned").first()).toBeVisible();

    await page.getByRole("button", { name: "aligned", exact: true }).click();
    await page.getByTestId("filter-exit-kind").getByRole("button", { name: "stop_loss" }).click();
    await page.getByTestId("filter-outcome").getByRole("button", { name: "Winners" }).click();

    await page.getByLabel("Show diagnostics columns").check();
    await expect(page.getByRole("columnheader", { name: "entry_prof" })).toBeVisible();

    const tradeTable = page.locator(".trade-table:not(.breakdown-table)");
    await expect(tradeTable.locator("tbody tr")).toHaveCount(0);

    await page.getByTestId("filter-outcome").getByRole("button", { name: "All" }).click();
    const winnerRow = tradeTable.locator("tbody tr").filter({ hasText: "signal:rsi_exit_base" });
    await expect(winnerRow).toHaveCount(1);
    const tradeId = (await winnerRow.locator("td").first().innerText()).trim();
    await winnerRow.click();

    await page.getByRole("button", { name: "Chart" }).click();
    await expect(page.getByLabel(`Trade ${tradeId}`)).toBeVisible({ timeout: 30_000 });
    const hint = await page.locator(".chart-panel .panel__hint").innerText();
    expect(hint).toContain("trade focus");

    await expect(page.getByTestId("chart-trade-diagnostics")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chart-trade-diagnostics")).toContainText("active_exit_profile");
    await expect(page.getByTestId("active-exit-components")).toBeVisible();
  });

  test("v3 run keeps legacy UI without v4-only controls", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("button", { name: "Reports" }).click();

    await page.locator(".context-bar select").first().selectOption(V3_RUN_ID);
    await expect(page.getByText(/schema v3/)).toBeVisible({ timeout: 60_000 });

    await expect(page.getByText("Diagnostics available for schema v4 reports.")).toBeVisible();
    await expect(page.getByText("Fee diagnostics")).toHaveCount(0);
    await expect(page.getByText("entry_profile")).toHaveCount(0);
    await expect(page.getByLabel("Show diagnostics columns")).toHaveCount(0);
    await expect(page.getByText("exit_reason")).toBeVisible();
    await expect(page.locator(".trade-table:not(.breakdown-table) tbody tr").first()).toBeVisible();
  });
});
