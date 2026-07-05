import { describe, expect, it } from "vitest";

import {
  createChartInteractionAdapter,
  isChartNavigationKey,
} from "@/features/chart/runtime/interactionAdapter";
import type { ChartInteractionEvent } from "@/features/chart/runtime/types";

describe("interactionAdapter", () => {
  it("isChartNavigationKey recognizes navigation keys only", () => {
    expect(isChartNavigationKey("ArrowLeft")).toBe(true);
    expect(isChartNavigationKey("PageDown")).toBe(true);
    expect(isChartNavigationKey("Enter")).toBe(false);
    expect(isChartNavigationKey("a")).toBe(false);
  });

  it("onKeyboardPanStart dispatches keyboard_pan_start", () => {
    const events: ChartInteractionEvent[] = [];
    const adapter = createChartInteractionAdapter({
      dispatch: (event) => events.push(event),
      getCandles: () => [],
      shouldSuppressRangeEvent: () => false,
    });

    adapter.onKeyboardPanStart("ArrowRight");
    expect(events).toEqual([{ type: "keyboard_pan_start", key: "ArrowRight" }]);
  });
});
