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
    const cmd = controller.dispatch({ type: "trade_selected" });
    expect(cmd?.type).toBe("noViewportChange");
  });
});
