import { describe, expect, it } from "vitest";
import { createViewportController } from "@/features/chart/runtime/viewportController";

describe("viewportController", () => {
  it("traceReady always returns noViewportChange", () => {
    const controller = createViewportController();
    expect(controller.onTraceReady()).toEqual({ type: "noViewportChange" });
  });

  it("suppresses trade focus while user panning", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
    });
    controller.dispatch({ type: "pointerdown" });
    const cmd = controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000_000 });
    expect(cmd?.type).toBe("noViewportChange");
  });

  it("windowSwapCommitted always restores after pan shift even when trade is selected", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
    });
    controller.dispatch({ type: "pointerdown" });
    controller.dispatch({ type: "pointerup" });
    const cmd = controller.onWindowSwapCommitted({
      anchorTimeSec: 1_731_000_000,
      previousVisible: { from: 120.4, to: 380.9 },
      shiftSeq: 2,
      windowStartIndex: 100_000,
      fullLength: 200_000,
    });
    expect(cmd).toEqual({
      type: "restoreAfterWindowSwap",
      anchorTimeSec: 1_731_000_000,
      previousVisible: { from: 120.4, to: 380.9 },
      shiftSeq: 2,
      windowStartIndex: 100_000,
      fullLength: 200_000,
    });
  });

  it("wheel pan sets suppressTradeFocus so trade_selected does not fire during scroll", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
    });
    controller.dispatch({ type: "wheel" });
    const cmd = controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000_000 });
    expect(cmd?.type).toBe("noViewportChange");
  });
});
