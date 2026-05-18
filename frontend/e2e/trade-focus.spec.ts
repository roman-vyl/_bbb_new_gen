import { test, expect } from "@playwright/test";

test("trade focus centers chart on selected report row", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle", timeout: 120_000 });

  await page.getByRole("button", { name: "Reports" }).click();
  await page.waitForSelector(".trade-table tbody tr", { timeout: 60_000 });

  const rows = page.locator(".trade-table tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);

  const midRow = rows.nth(Math.floor(count / 3));
  const tradeId = (await midRow.locator("td").first().innerText()).trim();
  await midRow.click();

  await expect(page.getByText(`Focused trade #${tradeId}`)).toBeVisible({ timeout: 30_000 });

  const hint = await page.locator(".chart-panel .panel__hint").innerText();
  expect(hint).toContain("trade focus");
  expect(hint).toContain("range ");
  expect(hint).toMatch(/Showing \d+ of \d+ bars/);

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.waitForTimeout(1000);
  expect(consoleErrors).toEqual([]);
});
