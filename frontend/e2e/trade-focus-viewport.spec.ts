import { test, expect } from "@playwright/test";

test("trade focus viewport centers entry not chunk tail", async ({ page }) => {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle", timeout: 120_000 });

  await page.getByRole("button", { name: "Reports" }).click();
  await page.waitForSelector(".trade-table tbody tr", { timeout: 60_000 });

  const rows = page.locator(".trade-table tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);

  const midRow = rows.nth(Math.floor(count / 3));
  await midRow.click();

  await expect(page.locator(".chart-focus")).toBeVisible({ timeout: 30_000 });

  const hint = await page.locator(".chart-panel .panel__hint").innerText();
  expect(hint).toContain("trade focus");

  const centerMatch = hint.match(/center (\d+)/);
  const rangeMatch = hint.match(/range (\d+)–(\d+)/);
  expect(centerMatch).not.toBeNull();
  expect(rangeMatch).not.toBeNull();

  const centerSec = Number(centerMatch![1]);
  const chunkFirst = Number(rangeMatch![1]);
  const chunkLast = Number(rangeMatch![2]);
  const centerRatio = (centerSec - chunkFirst) / (chunkLast - chunkFirst);

  expect(centerRatio).toBeGreaterThan(0.25);
  expect(centerRatio).toBeLessThan(0.75);
});
