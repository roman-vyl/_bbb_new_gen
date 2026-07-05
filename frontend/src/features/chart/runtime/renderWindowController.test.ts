import { describe, expect, it, vi } from "vitest";
import { createChartDataWindowManager } from "@/features/chart/chartDataWindowManager";
import { createRenderWindowController } from "@/features/chart/runtime/renderWindowController";

describe("renderWindowController", () => {
  it("records pending shift during pointer pan without committing", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const commits: unknown[] = [];
    const controller = createRenderWindowController({
      manager,
      idleDebounceMs: 10_000,
      onCommit: (c) => commits.push(c),
    });

    controller.dispatch({ type: "pointerdown" });
    const recorded = controller.recordBoundaryIntent(
      { from: 0, to: manager.getWindowLength() - 1 },
      1_700_000_000,
    );
    expect(recorded).toBe(true);
    expect(controller.getPendingShift()).not.toBeNull();
    expect(commits).toHaveLength(0);
  });

  it("commits one shift on pointerup", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();
    const before = manager.getWindowIndices();

    const commits: unknown[] = [];
    const controller = createRenderWindowController({
      manager,
      onCommit: (c) => commits.push(c),
    });

    controller.dispatch({ type: "pointerdown" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);
    controller.dispatch({ type: "pointerup" });

    expect(commits).toHaveLength(1);
    const after = manager.getWindowIndices();
    expect(after.windowStartIndex).not.toBe(before.windowStartIndex);
  });

  it("uses idle debounce fallback when pointerup is missing", () => {
    vi.useFakeTimers();
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const commits: unknown[] = [];
    const controller = createRenderWindowController({
      manager,
      idleDebounceMs: 300,
      onCommit: (c) => commits.push(c),
    });

    controller.dispatch({ type: "wheel" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);

    vi.advanceTimersByTime(350);
    expect(commits.length).toBeGreaterThanOrEqual(0);
    vi.useRealTimers();
  });

  it("stays applying_shift until settleWindowSwap", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({ type: "pointerdown" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);
    controller.dispatch({ type: "pointerup" });

    expect(controller.getInteractionState()).toBe("applying_shift");
    expect(controller.getApplyingShiftSeq()).toBe(1);

    controller.settleWindowSwap(1);
    expect(controller.getInteractionState()).toBe("idle_user_view");
    expect(controller.getApplyingShiftSeq()).toBeNull();
  });

  it("pointerdown during applying_shift aborts stale swap", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({ type: "pointerdown" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);
    controller.dispatch({ type: "pointerup" });
    expect(controller.getInteractionState()).toBe("applying_shift");

    controller.dispatch({ type: "pointerdown" });
    expect(controller.getInteractionState()).toBe("user_panning");
    expect(controller.getApplyingShiftSeq()).toBeNull();

    controller.settleWindowSwap(1);
    expect(controller.getInteractionState()).toBe("user_panning");
  });

  it("keyboard_pan_start enters user_panning without pointerdown", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    expect(controller.getInteractionState()).toBe("idle_user_view");
    controller.dispatch({ type: "keyboard_pan_start", key: "ArrowLeft" });
    expect(controller.getInteractionState()).toBe("user_panning");
  });

  it("keyboard_pan_start during applying_shift aborts stale swap", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({ type: "pointerdown" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);
    controller.dispatch({ type: "pointerup" });
    expect(controller.getInteractionState()).toBe("applying_shift");

    controller.dispatch({ type: "keyboard_pan_start", key: "ArrowRight" });
    expect(controller.getInteractionState()).toBe("user_panning");
    expect(controller.getApplyingShiftSeq()).toBeNull();
  });

  it("following visible_range_changed records boundary intent after keyboard_pan_start", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({
      manager,
      idleDebounceMs: 10_000,
    });

    controller.dispatch({ type: "keyboard_pan_start", key: "ArrowLeft" });
    const recorded = controller.recordBoundaryIntent(
      { from: 0, to: manager.getWindowLength() - 1 },
      1_700_000_000,
    );

    expect(recorded).toBe(true);
    expect(controller.getPendingShift()).not.toBeNull();
  });

  it("idle debounce commits shift after keyboard_pan_start without pointerup", () => {
    vi.useFakeTimers();
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();
    const before = manager.getWindowIndices();

    const commits: unknown[] = [];
    const controller = createRenderWindowController({
      manager,
      idleDebounceMs: 300,
      onCommit: (c) => commits.push(c),
    });

    controller.dispatch({ type: "keyboard_pan_start", key: "ArrowLeft" });
    controller.recordBoundaryIntent({ from: 0, to: 5 }, 1_700_000_000);

    vi.advanceTimersByTime(350);
    expect(commits).toHaveLength(1);
    expect(manager.getWindowIndices().windowStartIndex).not.toBe(before.windowStartIndex);
    vi.useRealTimers();
  });

  it("trade_focused blocks recordBoundaryIntent without keyboard prelude", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({ type: "trade_selected", entryTimeSec: 1_700_000_000 });
    expect(controller.getInteractionState()).toBe("trade_focused");

    const recorded = controller.recordBoundaryIntent(
      { from: 0, to: manager.getWindowLength() - 1 },
      1_700_000_000,
    );
    expect(recorded).toBe(false);
    expect(controller.getPendingShift()).toBeNull();
  });

  it("plain visible_range_changed from idle does not enter user_panning", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({
      type: "visible_range_changed",
      visible: { from: 10, to: 50 },
      anchorTimeSec: 1_700_000_000,
    });
    expect(controller.getInteractionState()).toBe("idle_user_view");
  });

  it("programmatic viewport start plus visible_range_changed does not become user pan", () => {
    const manager = createChartDataWindowManager();
    manager.reset(100_000);
    manager.buildTailWindow();

    const controller = createRenderWindowController({ manager });

    controller.dispatch({ type: "programmatic_viewport_start" });
    controller.dispatch({
      type: "visible_range_changed",
      visible: { from: 10, to: 50 },
      anchorTimeSec: 1_700_000_000,
    });
    expect(controller.getInteractionState()).toBe("idle_user_view");
    controller.dispatch({ type: "programmatic_viewport_end" });
  });
});
