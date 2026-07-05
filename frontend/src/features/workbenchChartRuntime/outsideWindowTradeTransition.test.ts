import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChartBar, RunReport } from "@/api/types";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import {
  clearMarketResourceCache,
  getCandles,
  mergeCandlesWindowBundle,
} from "@/features/chart/marketResourceCache";
import { buildRunMarketViewIdentity, resolveRunMarketView } from "@/features/chart/runMarketView";
import {
  buildMarketTargetWindowKey,
  marketCandlesReadyForTarget,
  resolveMarketTargetWindow,
} from "@/features/chart/workbenchMarketLoad";
import {
  buildChartViewWindowFromPhase63BSlice,
  createPhase63BRenderWindowOwnerState,
  resolvePhase63BChartWindowSlice,
  runPhase63BApplyTrade,
  runPhase63BRenderWindowInit,
} from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";
import {
  createPhase63FMarketLoadOwnerState,
  resolvePhase63FMarketBundleSnapshot,
  resolvePhase63FMarketTargetWindows,
} from "@/features/workbenchChartRuntime/phase63FMarketLoadBridge";
import { makePhase6Variant } from "@/features/workbenchChartRuntime/phase6ContractFixtures";
import { isTradeEntryInChartView } from "@/features/workbenchChartRuntime/phase63TradeFocusBridge";
import {
  beginMarketLoadCycle,
  createMarketLoadRuntimeController,
  runMarketLoadCycle,
} from "@/features/workbenchChartRuntime/marketLoadRuntime";

const TIMEFRAME_MS = 300_000;
const BAR_SEC = TIMEFRAME_MS / 1000;
const REPORT_BAR_COUNT = 120_000;
const REPORT_FROM_MS = 0;
const REPORT_TO_MS = REPORT_BAR_COUNT * TIMEFRAME_MS;

function makeCandles(count: number, startTimeSec: number): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * BAR_SEC,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }));
}

function makeLargeReport(): RunReport {
  return {
    run_id: "run-outside-window",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: REPORT_BAR_COUNT,
    data_range: { from_open_time_ms: REPORT_FROM_MS, to_open_time_ms: REPORT_TO_MS },
    variants_count: 1,
    variants: [makePhase6Variant()],
  };
}

function entryMsFromBarIndex(barIndex: number): number {
  return barIndex * TIMEFRAME_MS;
}

function entrySecFromBarIndex(barIndex: number): number {
  return barIndex * BAR_SEC;
}

function seedFocusCandles(
  candlesKey: string,
  focusWindow: { fromMs: number; toMs: number },
  candles: ChartBar[],
): void {
  mergeCandlesWindowBundle(candlesKey, {
    candles,
    coverage: {
      requested_from_ms: focusWindow.fromMs,
      requested_to_ms: focusWindow.toMs,
      actual_from_ms: focusWindow.fromMs,
      actual_to_ms: focusWindow.toMs,
      truncated: false,
    },
  });
}


function runRenderViewportTick(input: {
  phase63BOwner: ReturnType<typeof createPhase63BRenderWindowOwnerState>;
  cachedBundleCandlesRef: { current: ChartBar[] };
  renderWindowFoundationKey: string | null;
  marketLoadStatus: "idle" | "loading" | "ready" | "error";
  marketFocusWindow: { fromMs: number; toMs: number } | null;
  selectedTradeEntryTimeMs: number | null;
  candlesKey: string;
  variantKey: string;
}) {
  if (input.renderWindowFoundationKey === null) {
    if (input.marketLoadStatus === "loading") {
      return;
    }
    if (input.marketLoadStatus === "error") {
      runPhase63BRenderWindowInit(input.phase63BOwner, {
        foundationKey: input.renderWindowFoundationKey,
        marketLoadStatus: input.marketLoadStatus,
        bundleCandles: input.cachedBundleCandlesRef.current,
        selectedTradeEntryTimeMs: null,
        variantKey: input.variantKey,
      });
    }
    return;
  }
  if (input.marketLoadStatus === "error") {
    runPhase63BRenderWindowInit(input.phase63BOwner, {
      foundationKey: input.renderWindowFoundationKey,
      marketLoadStatus: input.marketLoadStatus,
      bundleCandles: input.cachedBundleCandlesRef.current,
      selectedTradeEntryTimeMs: null,
      variantKey: input.variantKey,
    });
    return;
  }
  if (input.marketFocusWindow === null) {
    return;
  }
  const bundleCandles = getCandles(
    input.candlesKey,
    input.marketFocusWindow.fromMs,
    input.marketFocusWindow.toMs,
  );
  if (bundleCandles === undefined || bundleCandles.length === 0) {
    return;
  }
  input.cachedBundleCandlesRef.current = bundleCandles;
  runPhase63BRenderWindowInit(input.phase63BOwner, {
    foundationKey: input.renderWindowFoundationKey,
    marketLoadStatus: input.marketLoadStatus,
    bundleCandles,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
    variantKey: input.variantKey,
  });
  if (input.selectedTradeEntryTimeMs !== null) {
    runPhase63BApplyTrade(input.phase63BOwner, {
      bundleCandles,
      selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
      forceRebuild: false,
    });
  }
}

function resolveChartView(input: {
  phase63BOwner: ReturnType<typeof createPhase63BRenderWindowOwnerState>;
  bundle: { candles: ChartBar[]; ema_overlays: [] };
  marketLoadStatus: "ready" | "loading" | "idle" | "error";
  selectedTradeEntryTimeMs: number | null;
}) {
  const chartWindow = resolvePhase63BChartWindowSlice(input.phase63BOwner, {
    bundle: input.bundle,
    marketLoadStatus: input.marketLoadStatus,
    auxEmaOverlays: [],
    marketIdentity: "id",
  });
  return buildChartViewWindowFromPhase63BSlice({
    chartWindow,
    selectedTradeEntryTimeMs: input.selectedTradeEntryTimeMs,
  });
}

describe("outside-window trade transition (A inside chartView → B outside chartView)", () => {
  const tradeABarIndex = 20_000;
  const tradeBBarIndex = 80_000;

  beforeEach(() => {
    clearMarketResourceCache();
  });

  it("updates market focus/coverage keys and starts Phase63F when B is outside A window", async () => {
    const report = makeLargeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const owner = createPhase63FMarketLoadOwnerState();

    const entryA = entryMsFromBarIndex(tradeABarIndex);
    const entryB = entryMsFromBarIndex(tradeBBarIndex);

    const windowsA = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryA,
    });
    const windowsB = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryB,
    });

    expect(windowsB.focusWindowKey).not.toBe(windowsA.focusWindowKey);
    expect(windowsB.coverageWindowKey).not.toBe(windowsA.coverageWindowKey);
    expect(owner.controller.status).toBe("loading");
    expect(owner.controller.readyTargetKey).toBeNull();

    const focusA = windowsA.focusWindow;
    seedFocusCandles(
      view.candlesKey,
      focusA,
      makeCandles(CHART_RENDER_WINDOW_SIZE, entrySecFromBarIndex(tradeABarIndex - 12_000)),
    );

    const fetchSpy = vi.fn(async (loadInput: { targetWindow: { fromMs: number; toMs: number } }) => {
      const count = Math.ceil((loadInput.targetWindow.toMs - loadInput.targetWindow.fromMs) / TIMEFRAME_MS);
      const startSec = Math.floor(loadInput.targetWindow.fromMs / 1000);
      mergeCandlesWindowBundle(view.candlesKey, {
        candles: makeCandles(count, startSec),
        coverage: {
          requested_from_ms: loadInput.targetWindow.fromMs,
          requested_to_ms: loadInput.targetWindow.toMs,
          actual_from_ms: loadInput.targetWindow.fromMs,
          actual_to_ms: loadInput.targetWindow.toMs,
          truncated: false,
        },
      });
      return { candlesFetched: true, emaFetched: 0 };
    });

    const loadA = await runMarketLoadCycle(owner.controller, {
      view,
      viewIdentity,
      focusWindow: windowsA.focusWindow,
      coverageWindow: windowsA.coverageWindow,
      focusKey: buildMarketTargetWindowKey(viewIdentity, windowsA.focusWindow),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, windowsA.coverageWindow),
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration: beginMarketLoadCycle(owner.controller, viewIdentity),
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    expect(loadA.outcome).toBe("cache_hit_ready");
    expect(marketCandlesReadyForTarget(view, windowsA.focusWindow)).toBe(true);

    const controller = owner.controller;
    const loadGeneration = beginMarketLoadCycle(controller, viewIdentity);
    const cycleB = await runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: windowsB.focusWindow,
      coverageWindow: windowsB.coverageWindow,
      focusKey: buildMarketTargetWindowKey(viewIdentity, windowsB.focusWindow),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, windowsB.coverageWindow),
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration,
      executeLoad: fetchSpy,
    });

    expect(cycleB.outcome).toBe("applied");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(marketCandlesReadyForTarget(view, windowsB.focusWindow)).toBe(true);
  });

  it("marks loading when focus moves outside cached window while prior target was ready", async () => {
    const report = makeLargeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const controller = createMarketLoadRuntimeController();
    const entryA = entryMsFromBarIndex(tradeABarIndex);
    const entryB = entryMsFromBarIndex(tradeBBarIndex);
    const focusA = resolveMarketTargetWindow(view, entryA);
    const focusB = resolveMarketTargetWindow(view, entryB);

    seedFocusCandles(
      view.candlesKey,
      focusA,
      makeCandles(CHART_RENDER_WINDOW_SIZE, entrySecFromBarIndex(tradeABarIndex - 12_000)),
    );

    await runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: focusA,
      coverageWindow: focusA,
      focusKey: buildMarketTargetWindowKey(viewIdentity, focusA),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, focusA),
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration: beginMarketLoadCycle(controller, viewIdentity),
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });
    expect(controller.status).toBe("ready");
    expect(controller.readyTargetKey).toBe(buildMarketTargetWindowKey(viewIdentity, focusA));

    const pending = runMarketLoadCycle(controller, {
      view,
      viewIdentity,
      focusWindow: focusB,
      coverageWindow: focusB,
      focusKey: buildMarketTargetWindowKey(viewIdentity, focusB),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, focusB),
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration: beginMarketLoadCycle(controller, viewIdentity),
      executeLoad: vi.fn(async () => new Promise(() => {})),
    });

    expect(marketCandlesReadyForTarget(view, focusB)).toBe(false);
    expect(controller.status).toBe("loading");
    void pending;
  });

  it("Phase63B keeps A slice during loading gap (no stale bundle fallback)", () => {
    const report = makeLargeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const owner63F = createPhase63FMarketLoadOwnerState();
    const owner63B = createPhase63BRenderWindowOwnerState(() => {});
    const cachedRef = { current: [] as ChartBar[] };

    const entryA = entryMsFromBarIndex(tradeABarIndex);
    const entryB = entryMsFromBarIndex(tradeBBarIndex);
    const windowsA = resolvePhase63FMarketTargetWindows({
      owner: owner63F,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryA,
    });
    seedFocusCandles(
      view.candlesKey,
      windowsA.focusWindow,
      makeCandles(CHART_RENDER_WINDOW_SIZE, entrySecFromBarIndex(tradeABarIndex - 12_000)),
    );

    const snapshotA = resolvePhase63FMarketBundleSnapshot({
      owner: owner63F,
      view,
      focusWindow: windowsA.focusWindow,
      coverageWindow: windowsA.coverageWindow,
      focusWindowKey: windowsA.focusWindowKey,
      marketLoadStatus: "ready",
      marketLoadError: null,
    });
    expect(snapshotA.foundationKey).not.toBeNull();
    cachedRef.current = snapshotA.bundle!.candles;

    runRenderViewportTick({
      phase63BOwner: owner63B,
      cachedBundleCandlesRef: cachedRef,
      renderWindowFoundationKey: snapshotA.foundationKey,
      marketLoadStatus: "ready",
      marketFocusWindow: windowsA.focusWindow,
      selectedTradeEntryTimeMs: entryA,
      candlesKey: view.candlesKey,
      variantKey: "exp_a",
    });

    const chartA = resolveChartView({
      phase63BOwner: owner63B,
      bundle: snapshotA.bundle!,
      marketLoadStatus: "ready",
      selectedTradeEntryTimeMs: entryA,
    });
    expect(chartA.count).toBeGreaterThan(0);
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeABarIndex), chartA.candles)).toBe(true);
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeBBarIndex), chartA.candles)).toBe(false);

    const windowsB = resolvePhase63FMarketTargetWindows({
      owner: owner63F,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryB,
    });
    const snapshotGap = resolvePhase63FMarketBundleSnapshot({
      owner: owner63F,
      view,
      focusWindow: windowsB.focusWindow,
      coverageWindow: windowsB.coverageWindow,
      focusWindowKey: windowsB.focusWindowKey,
      marketLoadStatus: "loading",
      marketLoadError: null,
    });
    expect(snapshotGap.foundationKey).toBeNull();
    expect(snapshotGap.bundle).toBeNull();

    runRenderViewportTick({
      phase63BOwner: owner63B,
      cachedBundleCandlesRef: cachedRef,
      renderWindowFoundationKey: snapshotGap.foundationKey,
      marketLoadStatus: "loading",
      marketFocusWindow: windowsB.focusWindow,
      selectedTradeEntryTimeMs: entryB,
      candlesKey: view.candlesKey,
      variantKey: "exp_a",
    });

    const chartGap = resolveChartView({
      phase63BOwner: owner63B,
      bundle: snapshotA.bundle!,
      marketLoadStatus: "ready",
      selectedTradeEntryTimeMs: entryB,
    });
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeBBarIndex), chartGap.candles)).toBe(false);
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeABarIndex), chartGap.candles)).toBe(true);
  });

  it("after B load completes, Phase63B recenters chartView around B", () => {
    const report = makeLargeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const owner63F = createPhase63FMarketLoadOwnerState();
    const owner63B = createPhase63BRenderWindowOwnerState(() => {});
    const cachedRef = { current: [] as ChartBar[] };

    const entryB = entryMsFromBarIndex(tradeBBarIndex);
    const windowsB = resolvePhase63FMarketTargetWindows({
      owner: owner63F,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryB,
    });
    seedFocusCandles(
      view.candlesKey,
      windowsB.focusWindow,
      makeCandles(CHART_RENDER_WINDOW_SIZE, entrySecFromBarIndex(tradeBBarIndex - 12_000)),
    );

    const snapshotB = resolvePhase63FMarketBundleSnapshot({
      owner: owner63F,
      view,
      focusWindow: windowsB.focusWindow,
      coverageWindow: windowsB.coverageWindow,
      focusWindowKey: windowsB.focusWindowKey,
      marketLoadStatus: "ready",
      marketLoadError: null,
    });
    cachedRef.current = snapshotB.bundle!.candles;

    runRenderViewportTick({
      phase63BOwner: owner63B,
      cachedBundleCandlesRef: cachedRef,
      renderWindowFoundationKey: snapshotB.foundationKey,
      marketLoadStatus: "ready",
      marketFocusWindow: windowsB.focusWindow,
      selectedTradeEntryTimeMs: entryB,
      candlesKey: view.candlesKey,
      variantKey: "exp_a",
    });

    const chartB = resolveChartView({
      phase63BOwner: owner63B,
      bundle: snapshotB.bundle!,
      marketLoadStatus: "ready",
      selectedTradeEntryTimeMs: entryB,
    });
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeBBarIndex), chartB.candles)).toBe(true);
    expect(isTradeEntryInChartView(entrySecFromBarIndex(tradeABarIndex), chartB.candles)).toBe(false);
  });

  it("aborted outside-window load leaves stale readyTargetKey and null foundation", async () => {
    const report = makeLargeReport();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant: report.variants[0]!,
      reloadToken: 0,
    });
    const viewIdentity = buildRunMarketViewIdentity(view);
    const owner = createPhase63FMarketLoadOwnerState();
    const entryA = entryMsFromBarIndex(tradeABarIndex);
    const entryB = entryMsFromBarIndex(tradeBBarIndex);
    const focusA = resolveMarketTargetWindow(view, entryA);
    const focusB = resolveMarketTargetWindow(view, entryB);

    seedFocusCandles(
      view.candlesKey,
      focusA,
      makeCandles(CHART_RENDER_WINDOW_SIZE, entrySecFromBarIndex(tradeABarIndex - 12_000)),
    );

    await runMarketLoadCycle(owner.controller, {
      view,
      viewIdentity,
      focusWindow: focusA,
      coverageWindow: focusA,
      focusKey: buildMarketTargetWindowKey(viewIdentity, focusA),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, focusA),
      symbol: report.symbol,
      timeframe: "5m",
      signal: new AbortController().signal,
      loadGeneration: beginMarketLoadCycle(owner.controller, viewIdentity),
      executeLoad: async () => ({ candlesFetched: false, emaFetched: 0 }),
    });

    const abort = new AbortController();
    const aborted = runMarketLoadCycle(owner.controller, {
      view,
      viewIdentity,
      focusWindow: focusB,
      coverageWindow: focusB,
      focusKey: buildMarketTargetWindowKey(viewIdentity, focusB),
      coverageKey: buildMarketTargetWindowKey(viewIdentity, focusB),
      symbol: report.symbol,
      timeframe: "5m",
      signal: abort.signal,
      loadGeneration: beginMarketLoadCycle(owner.controller, viewIdentity),
      executeLoad: (loadInput) =>
        new Promise((_resolve, reject) => {
          loadInput.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    });
    abort.abort();
    const result = await aborted;
    expect(result.outcome).toBe("aborted");
    expect(owner.controller.readyTargetKey).toBeNull();
    expect(owner.controller.status).toBe("loading");

    const windowsB = resolvePhase63FMarketTargetWindows({
      owner,
      view,
      viewIdentity,
      selectedTradeEntryTimeMs: entryB,
    });
    const snapshot = resolvePhase63FMarketBundleSnapshot({
      owner,
      view,
      focusWindow: windowsB.focusWindow,
      coverageWindow: windowsB.coverageWindow,
      focusWindowKey: windowsB.focusWindowKey,
      marketLoadStatus: owner.controller.status,
      marketLoadError: owner.controller.error,
    });
    expect(snapshot.foundationKey).toBeNull();
    expect(snapshot.market.candlesSource).toBe("unavailable");
  });
});
