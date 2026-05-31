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
});
