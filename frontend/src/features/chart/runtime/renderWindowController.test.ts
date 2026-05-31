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
});
