/**
 * @vitest-environment jsdom
 *
 * End-to-end keyboard navigation pipeline tests.
 * Locates break points without manual browser smoke.
 */
import { describe, expect, it, vi } from "vitest";

import type { ChartBar, RunReport, RunVariant } from "@/api/types";
import { CHART_RENDER_SAFE_ZONE } from "@/features/chart/chartViewWindow";
import { resolveRunMarketView } from "@/features/chart/runMarketView";
import { canEmitTradeFocus } from "@/features/chart/runtime/viewportController";
import {
  createChartInteractionAdapter,
  handleChartNavigationKeydown,
  registerChartDocumentKeyboardNavigation,
} from "@/features/chart/runtime/interactionAdapter";
import type { ChartInteractionEvent } from "@/features/chart/runtime/types";

import {
  createDisplayRenderViewportHarness,
  type DisplayRenderViewportHarness,
} from "./displayRenderViewportHarness";
import type { InteractionRuntimeHarness } from "./interactionRuntime";
import { dispatchInteractionCandidate } from "./interactionRuntime";
import { createInteractionRuntimeHarness } from "./interactionRuntime";
import { createChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { createRenderWindowController } from "@/features/chart/runtime/renderWindowController";

const EMPTY_METRICS = {
  long: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  short: { trades: 0, pnl: 0, return_pct: 0, profit_factor: null, win_rate: null },
  total: {
    trades: 0,
    pnl: 0,
    return_pct: 0,
    profit_factor: null,
    win_rate: null,
    sharpe: 0,
    max_drawdown: 0,
  },
  open_trades: { long: 0, short: 0, total: 0 },
};

function makeVariant(overrides: Partial<RunVariant> = {}): RunVariant {
  return {
    variant: "exp_a",
    config_id: "cfg_a",
    symbol: "BTCUSDT",
    timeframe: "5m",
    strategy_spec: {
      anchor_stack: {
        fast: { period: 200 },
        anchor: { period: 500 },
        slow: { period: 1000 },
      },
    },
    metrics: EMPTY_METRICS,
    component_counters: [],
    trade_records: [],
    ...overrides,
  };
}

function makeReport(variant = makeVariant()): RunReport {
  return {
    run_id: "run-a",
    created_at: "2026-01-01T00:00:00Z",
    report_schema_version: 1,
    family: "ema_pullback",
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: 100,
    data_range: { from_open_time_ms: 1_000_000, to_open_time_ms: 1_900_000 },
    variants_count: 1,
    variants: [variant],
  };
}

function resolveView(report = makeReport()): NonNullable<ReturnType<typeof resolveRunMarketView>> {
  return resolveRunMarketView({
    report,
    variant: report.variants[0]!,
    chartTimeframe: "5m",
    reloadToken: 0,
  });
}

const FOCUS_WINDOW = {
  fromMs: 1_300_000,
  toMs: 1_900_000,
  toOpenTimeMs: 1_600_000,
};

function makeCandles(count: number, startTimeSec = 1_300): ChartBar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: startTimeSec + index * 300,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
  }));
}

function keyboardEvent(
  key: string,
  overrides: Partial<KeyboardEvent> & { target?: EventTarget | null } = {},
): KeyboardEvent {
  const { target = document.body, ...rest } = overrides;
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...rest,
  });
}

function dispatchVisibleAtLeftEdge(harness: InteractionRuntimeHarness) {
  const candles = harness.bundleCandles;
  return dispatchInteractionCandidate(
    harness,
    {
      type: "visible_range_changed",
      visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
      anchorTimeSec: candles[0]!.time,
    },
    {
      view: resolveView(),
      coverageWindow: FOCUS_WINDOW,
      timeframeMs: 300_000,
      chartHeavyIoEnabled: true,
    },
  );
}

function viewportState(harness: DisplayRenderViewportHarness) {
  return harness.context.renderController.chartRuntime.viewport.getState();
}

function renderInteractionState(harness: DisplayRenderViewportHarness) {
  return harness.context.renderController.chartRuntime.renderWindow.getInteractionState();
}

function createKeyboardHarness(candles = makeCandles(200, 1_300)): DisplayRenderViewportHarness {
  return createDisplayRenderViewportHarness({
    bundle: { candles, ema_overlays: [] },
    foundationKey: "foundation",
    view: resolveView(),
    focusWindow: FOCUS_WINDOW,
    coverageWindow: {
      fromMs: 1_000_000,
      toMs: 1_900_000,
      toOpenTimeMs: 1_600_000,
    },
    chartTimeframe: "5m",
    marketIdentity: "id",
  });
}

describe("keyboard navigation pipeline", () => {
  describe("input capture (ChartPanel seam)", () => {
    it("registerChartDocumentKeyboardNavigation dispatches keyboard_pan_start on ArrowLeft", () => {
      const events: ChartInteractionEvent[] = [];
      const adapter = createChartInteractionAdapter({
        dispatch: (event) => events.push(event),
        getCandles: () => [],
        shouldSuppressRangeEvent: () => false,
      });
      const canvas = document.createElement("div");
      document.body.appendChild(canvas);

      const registration = registerChartDocumentKeyboardNavigation({
        chartTabActive: () => true,
        chartCanvas: canvas,
        adapter,
      });

      document.dispatchEvent(keyboardEvent("ArrowLeft"));

      expect(events).toEqual([{ type: "keyboard_pan_start", key: "ArrowLeft" }]);
      registration.unregister();
      canvas.remove();
    });

    it("document registration is silent when chart tab inactive", () => {
      const events: ChartInteractionEvent[] = [];
      const adapter = createChartInteractionAdapter({
        dispatch: (event) => events.push(event),
        getCandles: () => [],
        shouldSuppressRangeEvent: () => false,
      });

      const registration = registerChartDocumentKeyboardNavigation({
        chartTabActive: () => false,
        chartCanvas: document.createElement("div"),
        adapter,
      });

      document.dispatchEvent(keyboardEvent("ArrowLeft"));
      expect(events).toHaveLength(0);
      registration.unregister();
    });

    it("Home/End do not dispatch keyboard_pan_start (document scope excludes them)", () => {
      const onKeyboardPanStart = vi.fn();
      const adapter = { onKeyboardPanStart };

      handleChartNavigationKeydown(keyboardEvent("Home"), {
        listenerScope: "document",
        chartTabActive: true,
        adapter,
      });
      handleChartNavigationKeydown(keyboardEvent("End"), {
        listenerScope: "document",
        chartTabActive: true,
        adapter,
      });

      expect(onKeyboardPanStart).not.toHaveBeenCalled();
    });

    it("rejects navigation when event target is trade nav button", () => {
      const onKeyboardPanStart = vi.fn();
      const button = document.createElement("button");
      document.body.appendChild(button);
      const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
      Object.defineProperty(event, "target", { value: button });

      handleChartNavigationKeydown(event, {
        listenerScope: "document",
        chartTabActive: true,
        adapter: { onKeyboardPanStart },
      });

      expect(onKeyboardPanStart).not.toHaveBeenCalled();
      button.remove();
    });
  });

  describe("controller + harness path (matches new 13 failure without prelude)", () => {
    it("trade focus + visible_range at edge without keyboard prelude matches interaction_state_gate", () => {
      const harness = createKeyboardHarness();
      harness.initialize(null);

      harness.dispatchInteraction({ type: "trade_selected", entryTimeSec: 1_500 });
      expect(renderInteractionState(harness)).toBe("trade_focused");
      expect(canEmitTradeFocus(viewportState(harness))).toBe(true);

      const result = harness.dispatchInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: harness.context.bundle.candles[0]!.time,
      });

      expect(result.panReason).toBeNull();
      expect(renderInteractionState(harness)).toBe("trade_focused");
    });

    it("keyboard prelude after trade focus enables prefetch at edge", () => {
      const harness = createKeyboardHarness();
      harness.initialize(null);

      harness.dispatchInteraction({ type: "trade_selected", entryTimeSec: 1_500 });
      harness.dispatchInteraction({ type: "keyboard_pan_start", key: "ArrowLeft" });

      expect(renderInteractionState(harness)).toBe("user_panning");
      expect(canEmitTradeFocus(viewportState(harness))).toBe(false);

      const result = harness.dispatchInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: harness.context.bundle.candles[0]!.time,
      });

      expect(result.panReason).not.toBeNull();
    });

    it("keyboard prelude cancels stale viewport command like pointerdown", () => {
      const harness = createKeyboardHarness();
      harness.initialize(null);

      harness.context.viewportState.lastCommand = {
        type: "focusTrade",
        entryTimeSec: 1_500,
      };

      harness.dispatchInteraction({ type: "keyboard_pan_start", key: "PageDown" });
      expect(harness.context.viewportState.lastCommand).toBeNull();

      const result = dispatchVisibleAtLeftEdge(harness.context.interactionHarness);
      expect(result.panReason).not.toBeNull();
    });

    it("onTraceReady does not re-emit focusTrade after keyboard prelude", () => {
      const harness = createKeyboardHarness();
      harness.initialize(null);

      harness.dispatchInteraction({ type: "trade_selected", entryTimeSec: 1_500 });
      harness.dispatchInteraction({ type: "keyboard_pan_start", key: "ArrowLeft" });

      const traceCmd = harness.context.renderController.chartRuntime.viewport.onTraceReady();
      expect(traceCmd).toEqual({ type: "noViewportChange" });
    });
  });

  describe("selectTrade path is separate from keyboard pan", () => {
    it("selectTrade dispatch does not enter user_panning or trigger prefetch", () => {
      const harness = createKeyboardHarness();
      harness.initialize(null);

      const focusCmd = harness.context.renderController.chartRuntime.dispatchInteraction({
        type: "trade_selected",
        entryTimeSec: 1_500,
      });
      expect(focusCmd?.type).toBe("focusTrade");
      expect(renderInteractionState(harness)).toBe("trade_focused");

      const result = harness.dispatchInteraction({
        type: "visible_range_changed",
        visible: { from: 0, to: CHART_RENDER_SAFE_ZONE - 1 },
        anchorTimeSec: harness.context.bundle.candles[0]!.time,
      });
      expect(result.panReason).toBeNull();
    });
  });

  describe("keyboard state timing", () => {
    it("keyboard prelude plus boundary intent enters pending_shift on large window", () => {
      const manager = createChartDataWindowManager();
      manager.reset(100_000);
      manager.buildTailWindow();

      const controller = createRenderWindowController({
        manager,
        idleDebounceMs: 300,
      });

      controller.dispatch({ type: "keyboard_pan_start", key: "ArrowLeft" });
      expect(controller.getInteractionState()).toBe("user_panning");

      const recorded = controller.recordBoundaryIntent(
        { from: 0, to: manager.getWindowLength() - 1 },
        1_700_000_000,
      );
      expect(recorded).toBe(true);
      expect(controller.getInteractionState()).toBe("pending_shift");
    });
  });
});
