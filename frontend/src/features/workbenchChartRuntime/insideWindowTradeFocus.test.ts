import { describe, expect, it } from "vitest";

import type { ChartBar } from "@/api/types";
import { CHART_RENDER_WINDOW_SIZE } from "@/features/chart/chartViewWindow";
import { findBarIndexAtOrBefore } from "@/features/chart/chartViewWindow";
import {
  evaluateTradeFocusReadiness,
  shouldEmitTradeFocus,
  tradeFocusEmitKey,
} from "@/features/workbenchChartRuntime/phase63TradeFocusBridge";
import {
  applyRenderWindowForTradeRuntime,
  createRenderWindowRuntimeController,
  initializeRenderWindowRuntime,
  resolveRenderWindowRuntimeSnapshot,
} from "@/features/workbenchChartRuntime/renderWindowRuntime";
import {
  createPhase63BRenderWindowOwnerState,
} from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";
import {
  createPhase63CViewportOwnerState,
  runPhase63CAcknowledgeViewportCommand,
  runPhase63CSelectTradeFocusCommand,
} from "@/features/workbenchChartRuntime/phase63CViewportCommandBridge";
import { buildChartViewWindowFromPhase63BSlice } from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";
import { resolvePhase63BChartWindowSlice } from "@/features/workbenchChartRuntime/phase63BRenderWindowBridge";

function makeCandles(count: number, startTimeSec = 1_700_000_000): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));
}

function entryMs(candles: ChartBar[], index: number): number {
  return candles[index]!.time * 1000;
}

describe("insideWindowTradeFocus", () => {
  it("safe-zone trade hops skip render-window rebuild but stay in slice", () => {
    const candles = makeCandles(CHART_RENDER_WINDOW_SIZE + 5_000);
    const controller = createRenderWindowRuntimeController();
    const tradeAIndex = 12_500;
    const tradeBIndex = 12_550;

    initializeRenderWindowRuntime(controller, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryMs(candles, tradeAIndex),
    });

    const before = resolveRenderWindowRuntimeSnapshot(controller, candles);
    const rebuilt = applyRenderWindowForTradeRuntime(controller, {
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryMs(candles, tradeBIndex),
      forceRebuild: false,
    });
    const after = resolveRenderWindowRuntimeSnapshot(controller, candles);

    expect(rebuilt).toBe(false);
    expect(after.bounds).toEqual(before.bounds);

    const owner = createPhase63BRenderWindowOwnerState(() => {});
    owner.controller = controller;
    const slice = resolvePhase63BChartWindowSlice(owner, {
      bundle: { candles, ema_overlays: [] },
      marketLoadStatus: "ready",
      auxEmaOverlays: [],
      marketIdentity: "id",
    });
    const chartView = buildChartViewWindowFromPhase63BSlice({
      chartWindow: slice,
      selectedTradeEntryTimeMs: entryMs(candles, tradeBIndex),
    });

    const readiness = evaluateTradeFocusReadiness({
      selectedTradeId: 2,
      selectedTradeEntryTimeMs: entryMs(candles, tradeBIndex),
      renderWindowFoundationKey: "foundation",
      marketLoadStatus: "ready",
      chartView,
    });
    expect(readiness.status).toBe("ready");

    const nextEmit = tradeFocusEmitKey(2, candles[tradeBIndex]!.time, "foundation");
    expect(
      shouldEmitTradeFocus(readiness, tradeFocusEmitKey(1, candles[tradeAIndex]!.time, "foundation"), nextEmit, {
        suppressedByUserPan: false,
      }),
    ).toBe(true);
  });

  it("emits distinct focusTrade commands for consecutive safe-zone trades", () => {
    const renderOwner = createPhase63BRenderWindowOwnerState(() => {});
    const viewportOwner = createPhase63CViewportOwnerState(renderOwner);
    const candles = makeCandles(CHART_RENDER_WINDOW_SIZE + 5_000);

    initializeRenderWindowRuntime(renderOwner.controller, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryMs(candles, 12_500),
    });

    const indices = [12_510, 12_520, 12_530];
    const commands = indices.map((index) => {
      const cmd = runPhase63CSelectTradeFocusCommand(
        viewportOwner,
        renderOwner,
        candles[index]!.time,
        { selectedTradeId: index },
      );
      runPhase63CAcknowledgeViewportCommand(viewportOwner);
      return cmd;
    });

    expect(commands.every((cmd) => cmd?.type === "focusTrade")).toBe(true);
    expect(new Set(commands.map((cmd) => cmd?.entryTimeSec)).size).toBe(indices.length);
  });

  it("edge-aligned trades rebuild to identical bounds and still need viewport focus", () => {
    const candles = makeCandles(CHART_RENDER_WINDOW_SIZE);
    const controller = createRenderWindowRuntimeController();

    initializeRenderWindowRuntime(controller, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryMs(candles, 0),
    });

    const before = resolveRenderWindowRuntimeSnapshot(controller, candles);
    const rebuilt = applyRenderWindowForTradeRuntime(controller, {
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryMs(candles, 100),
      forceRebuild: false,
    });
    const after = resolveRenderWindowRuntimeSnapshot(controller, candles);

    expect(rebuilt).toBe(false);
    expect(after.bounds).toEqual(before.bounds);
    expect(findBarIndexAtOrBefore(candles, candles[100]!.time)).toBe(100);
  });
});
