/**
 * Standalone smoke runner (bypasses `playwright test` CLI).
 * Usage: node scripts/run-trade-focus-smoke.mjs
 */
import { chromium } from "playwright";

const STEPS = 22;
const baseURL = "http://127.0.0.1:5173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleLines = [];
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

console.log("→ goto", baseURL);
await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 120_000 });

console.log("→ Reports");
await page.getByRole("button", { name: "Reports" }).click();

const tradeTable = page.locator(".reports-panel .trade-table:not(.breakdown-table)");
await tradeTable.waitFor({ state: "attached", timeout: 60_000 });
await tradeTable.scrollIntoViewIfNeeded();

const rows = tradeTable.locator("tbody tr");
const count = await rows.count();
console.log("→ trades in table:", count);
if (count <= 25) {
  throw new Error(`Need >25 trades, got ${count}`);
}

console.log("→ select first trade");
await tradeTable.scrollIntoViewIfNeeded();
await page.evaluate(() => {
  document
    .querySelector(".reports-panel .trade-table:not(.breakdown-table) tbody tr.trade-row")
    ?.click();
});
await page.waitForTimeout(500);

console.log("→ Chart tab");
await page.getByRole("button", { name: "Chart", exact: true }).click();
await page.locator(".chart-trade-nav").waitFor({ state: "visible", timeout: 30_000 });

await page.evaluate(() => window.__pipelineDebugReset?.());

for (let i = 0; i < STEPS; i++) {
  const nextBtn = page.getByRole("button", { name: "Next trade" });
  await nextBtn.waitFor({ state: "visible", timeout: 15_000 });
  if (await nextBtn.isDisabled()) throw new Error(`Next trade disabled at step ${i}`);
  await nextBtn.click();
  if ((i + 1) % 5 === 0) console.log(`→ step ${i + 1}/${STEPS}`);
  await page.waitForTimeout(400);
}

const hint = await page.locator(".chart-panel .panel__hint").innerText();
console.log("→ chart hint:", hint.slice(0, 120));

const exportData = await page.evaluate(() => {
  window.__pipelineDebugFlush?.("trade-nav-20");
  return window.__pipelineDebugExport?.() ?? null;
});

const tradeFocusEvents =
  exportData?.rows?.map((r) => r.event).filter((e) => e.startsWith("wb.trade_focus.")) ?? [];

const counts = tradeFocusEvents.reduce((acc, e) => {
  acc[e] = (acc[e] ?? 0) + 1;
  return acc;
}, {});

console.log("\n=== trade focus event counts ===");
console.log(JSON.stringify(counts, null, 2));

if (consoleLines.length > 0) {
  console.log("\n=== console highlights (last 20) ===");
  for (const line of consoleLines.slice(-20)) console.log(line);
}

await browser.close();

const requests = counts["wb.trade_focus.request"] ?? 0;
const applied = counts["wb.trade_focus.applied"] ?? 0;

if (tradeFocusEvents.length === 0) throw new Error("No wb.trade_focus.* events");
if (requests < STEPS) throw new Error(`Expected >=${STEPS} requests, got ${requests}`);
if (applied === 0) throw new Error("No wb.trade_focus.applied events");

console.log("\n✓ smoke passed");
