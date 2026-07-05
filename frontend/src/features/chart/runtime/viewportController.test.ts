import { describe, expect, it } from "vitest";
import {
  canEmitTradeFocus,
  createViewportController,
} from "@/features/chart/runtime/viewportController";

describe("viewportController", () => {
  it("traceReady returns noViewportChange without trade focus intent", () => {
    const controller = createViewportController();
    expect(controller.onTraceReady()).toEqual({ type: "noViewportChange" });
  });

  it("traceReady re-emits focusTrade when trade focus intent is active", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_100,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });
    expect(controller.onTraceReady()).toEqual({
      type: "focusTrade",
      entryTimeSec: 1_100,
    });
  });

  it("explicit trade_selected sets trade focus intent once", () => {
    const controller = createViewportController();
    const cmd = controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000_000 });
    expect(cmd).toEqual({ type: "focusTrade", entryTimeSec: 1_700_000_000 });
    expect(canEmitTradeFocus(controller.getState())).toBe(true);
  });

  it("user pan clears activeFocusIntent and blocks trade_selected", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });
    controller.dispatch({ type: "pointerdown" });
    expect(controller.getState().activeFocusIntent).toBeNull();
    expect(controller.getState().viewportOwner).toBe("user");
    const cmd = controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000_000 });
    expect(cmd?.type).toBe("noViewportChange");
  });

  it("windowSwapCommitted always restores after pan even when trade was focused", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });
    controller.dispatch({ type: "pointerdown" });
    controller.dispatch({ type: "pointerup" });
    const cmd = controller.onWindowSwapCommitted({
      anchorTimeSec: 1_731_000_000,
      previousVisible: { from: 120.4, to: 380.9 },
      shiftSeq: 2,
    });
    expect(cmd.type).toBe("restoreAfterWindowSwap");
  });

  it("resize never emits focusTrade when trade is selected but user owns viewport", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: null,
      viewportOwner: "user",
    });
    expect(controller.dispatch({ type: "resize" })).toEqual({ type: "preserveUserRange" });
  });

  it("resize never emits focusTrade even when activeFocusIntent is still trade (stale plan)", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "user",
    });
    expect(controller.dispatch({ type: "resize" })).toEqual({ type: "preserveUserRange" });
  });

  it("simulates pan shift then layout resize: restore path only, no refocus", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });
    controller.dispatch({ type: "pointerdown" });
    controller.dispatch({ type: "pointerup" });
    const restore = controller.onWindowSwapCommitted({
      anchorTimeSec: 1_731_000_000,
      previousVisible: { from: 10, to: 50 },
      shiftSeq: 1,
    });
    expect(restore.type).toBe("restoreAfterWindowSwap");
    const resizeCmd = controller.dispatch({ type: "resize" });
    expect(resizeCmd?.type).toBe("preserveUserRange");
    expect(canEmitTradeFocus(controller.getState())).toBe(false);
  });

  it("keyboard_pan_start clears activeFocusIntent", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });

    expect(canEmitTradeFocus(controller.getState())).toBe(true);
    controller.dispatch({ type: "keyboard_pan_start", key: "ArrowLeft" });

    expect(controller.getState().activeFocusIntent).toBeNull();
    expect(controller.getState().viewportOwner).toBe("user");
    expect(controller.getState().userPanning).toBe(true);
    expect(canEmitTradeFocus(controller.getState())).toBe(false);
  });

  it("onTraceReady returns noViewportChange after keyboard_pan_start", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });

    controller.dispatch({ type: "keyboard_pan_start", key: "PageUp" });
    expect(controller.onTraceReady()).toEqual({ type: "noViewportChange" });
  });

  it("ordinary visible_range_changed does not clear focus intent", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });

    controller.dispatch({
      type: "visible_range_changed",
      visible: { from: 10, to: 50 },
      anchorTimeSec: 1_700_000_000,
    });

    expect(canEmitTradeFocus(controller.getState())).toBe(true);
  });

  it("programmatic_viewport_start/end do not clear trade focus intent", () => {
    const controller = createViewportController({
      mode: "around-trade",
      centerTimeSec: 1_700_000_000,
      activeFocusIntent: "trade",
      viewportOwner: "trade",
    });

    controller.dispatch({ type: "programmatic_viewport_start" });
    controller.dispatch({ type: "programmatic_viewport_end" });

    expect(canEmitTradeFocus(controller.getState())).toBe(true);
  });
});
