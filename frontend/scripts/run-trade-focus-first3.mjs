/**
 * Cold-start: first 3 "Next trade" must change chart VISIBLE time range (not hint metadata).
 * Usage: node scripts/run-trade-focus-first3.mjs
 */
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:5173";

async function readVisible(page) {
  return page.evaluate(() => {
    const fn = window.__chartVisibleTimeRange;
    return typeof fn === "function" ? fn() : null;
  });
}

function rangeKey(range) {
  if (!range) return "null";
  return `${range.from}:${range.to}`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

console.log("→ goto");
await page.goto(baseURL, { waitUntil: "networkidle", timeout: 120_000 });

console.log("→ Reports + first trade");
await page.getByRole("button", { name: "Reports" }).click();
await page.locator(".reports-panel .trade-table:not(.breakdown-table)").waitFor({
  state: "attached",
  timeout: 60_000,
});
await page.evaluate(() => {
  document
    .querySelector(".reports-panel .trade-table:not(.breakdown-table) tbody tr.trade-row")
    ?.click();
});

console.log("→ Chart + wait for candles");
await page.getByRole("button", { name: "Chart", exact: true }).click();
await page.locator(".chart-trade-nav").waitFor({ state: "visible", timeout: 30_000 });
await page.waitForFunction(
  () => {
    const hint = document.querySelector(".chart-panel .panel__hint")?.textContent ?? "";
    return hint.includes("Showing") && !hint.includes("unavailable") && !hint.includes("Loading");
  },
  { timeout: 120_000 },
);

await page.waitForFunction(
  () => {
    const fn = window.__chartVisibleTimeRange;
    const r = typeof fn === "function" ? fn() : null;
    return r !== null && r.from !== null && r.to !== null;
  },
  { timeout: 30_000 },
);

let prevVisible = await readVisible(page);
console.log("→ initial visible:", prevVisible);

for (let i = 1; i <= 3; i++) {
  await page.getByRole("button", { name: "Next trade" }).click();
  await page.waitForFunction(
    (prevKey) => {
      const fn = window.__chartVisibleTimeRange;
      const r = typeof fn === "function" ? fn() : null;
      if (!r) return false;
      const key = `${r.from}:${r.to}`;
      return key !== prevKey;
    },
    rangeKey(prevVisible),
    { timeout: 5_000 },
  );
  const visible = await readVisible(page);
  console.log(`→ step ${i}: visible ${JSON.stringify(visible)}`);
  prevVisible = visible;
}

await browser.close();
console.log("\n✓ first-3 visible range moved on every Next click");
