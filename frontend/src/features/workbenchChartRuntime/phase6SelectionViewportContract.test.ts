import { describe, expect, it } from "vitest";

import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";
import { createChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import { createRenderWindowRuntimeController, initializeRenderWindowRuntime, resolveRenderWindowRuntimeSnapshot } from "./renderWindowRuntime";
import {
  acknowledgeViewportCommandCandidate,
  createViewportRuntimeState,
  filterViewportCommandCandidate,
  recordViewportCommandCandidate,
  setViewportPlanCandidate,
} from "./viewportRuntime";
import { resolveMarketWindowRuntime } from "./marketWindowRuntime";
import { makePhase6Candles, makePhase6Report, makePhase6Variant } from "./phase6ContractFixtures";

describe("Phase 6.1 selection/focus/viewport contract guards", () => {
  it("uses around-trade focus mode when selected trade entry time is present", () => {
    const report = makePhase6Report();
    const variant = makePhase6Variant();
    const view = resolveRunMarketView({
      report,
      chartTimeframe: "5m",
      variant,
      reloadToken: 0,
    });
    const withTrade = resolveMarketWindowRuntime({
      view,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      selectedTradeEntryTimeMs: 1_200_000,
    });
    const tail = resolveMarketWindowRuntime({
      view,
      marketIdentity: "identity-a",
      expectedMarketIdentity: "identity-a",
      selectedTradeEntryTimeMs: null,
    });

    expect(withTrade.focusMode).toBe("around-trade");
    expect(tail.focusMode).toBe("tail");
  });

  it("builds trade-centered render window instead of silently falling back to tail", () => {
    const candles = makePhase6Candles(200);
    const entryTimeMs = candles[100]!.time * 1000;

    const legacyManager = createChartDataWindowManager();
    legacyManager.reset(candles.length);
    legacyManager.buildWindowAroundIndex(100);

    const renderController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(renderController, {
      foundationKey: "foundation",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: entryTimeMs,
    });
    const snapshot = resolveRenderWindowRuntimeSnapshot(renderController, candles);

    expect(snapshot.implemented).toBe(true);
    expect(snapshot.bounds).toEqual(legacyManager.getWindowIndices());

    const tailManager = createChartDataWindowManager();
    tailManager.reset(candles.length);
    tailManager.buildTailWindow();
    const tailController = createRenderWindowRuntimeController();
    initializeRenderWindowRuntime(tailController, {
      foundationKey: "foundation-tail",
      marketLoadStatus: "ready",
      bundleCandles: candles,
      selectedTradeEntryTimeMs: null,
    });
    const tailSnapshot = resolveRenderWindowRuntimeSnapshot(tailController, candles);
    expect(tailSnapshot.bounds).toEqual(tailManager.getWindowIndices());
  });

  it("requires seq/ack semantics for viewport command candidates", () => {
    const state = createViewportRuntimeState();
    setViewportPlanCandidate(state, "around-trade", 1_200);
    state.controller.dispatch({ type: "trade_selected", entryTimeSec: 1_200 });

    const first = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });
    expect(first).toEqual({ type: "focusTrade", entryTimeSec: 1_200 });
    expect(state.commandSeq).toBe(1);
    expect(state.lastCommand).toEqual(first);

    acknowledgeViewportCommandCandidate(state);
    expect(state.lastCommand).toBeNull();

    setViewportPlanCandidate(state, "around-trade", 1_200);
    const second = recordViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });
    expect(second).toEqual({ type: "focusTrade", entryTimeSec: 1_200 });
    expect(state.commandSeq).toBe(2);
  });

  it("blocks duplicate trade focus commands without active trade intent", () => {
    const state = createViewportRuntimeState();
    const blocked = filterViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });
    expect(blocked).toBeNull();
    expect(canEmitTradeFocus(state.controller.getState())).toBe(false);
  });

  it("does not re-emit trade focus after intent is cleared by user interaction", () => {
    const state = createViewportRuntimeState();
    state.controller.dispatch({ type: "trade_selected", entryTimeSec: 1_200 });
    recordViewportCommandCandidate(state, { type: "focusTrade", entryTimeSec: 1_200 });
    acknowledgeViewportCommandCandidate(state);
    state.controller.dispatch({ type: "wheel" });

    const duplicate = filterViewportCommandCandidate(state, {
      type: "focusTrade",
      entryTimeSec: 1_200,
    });
    expect(duplicate).toBeNull();
    expect(canEmitTradeFocus(state.controller.getState())).toBe(false);
  });
});
