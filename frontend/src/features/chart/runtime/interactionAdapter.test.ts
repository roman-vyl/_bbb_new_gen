/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import {
  createChartInteractionAdapter,
  evaluateChartKeyboardKeydown,
  isChartDocumentNavigationKey,
  isChartNavigationKey,
} from "@/features/chart/runtime/interactionAdapter";
import type { ChartInteractionEvent } from "@/features/chart/runtime/types";

function keyboardEvent(
  key: string,
  overrides: Partial<KeyboardEvent> & { target?: EventTarget | null } = {},
): KeyboardEvent {
  const { target = document.body, ...rest } = overrides;
  return {
    key,
    code: key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target,
    ...rest,
  } as KeyboardEvent;
}

describe("interactionAdapter", () => {
  it("isChartNavigationKey recognizes navigation keys only", () => {
    expect(isChartNavigationKey("ArrowLeft")).toBe(true);
    expect(isChartNavigationKey("PageDown")).toBe(true);
    expect(isChartNavigationKey("Home")).toBe(true);
    expect(isChartNavigationKey("Enter")).toBe(false);
    expect(isChartNavigationKey("a")).toBe(false);
  });

  it("isChartDocumentNavigationKey excludes Home/End", () => {
    expect(isChartDocumentNavigationKey("ArrowLeft")).toBe(true);
    expect(isChartDocumentNavigationKey("PageDown")).toBe(true);
    expect(isChartDocumentNavigationKey("Home")).toBe(false);
    expect(isChartDocumentNavigationKey("End")).toBe(false);
  });

  it("evaluateChartKeyboardKeydown accepts document navigation without canvas focus", () => {
    const decision = evaluateChartKeyboardKeydown(keyboardEvent("ArrowRight"), {
      listenerScope: "document",
      chartTabActive: true,
      chartCanvas: document.createElement("div"),
    });
    expect(decision).toEqual({
      accepted: true,
      rejectionReason: null,
      key: "ArrowRight",
      listenerScope: "document",
    });
  });

  it("evaluateChartKeyboardKeydown rejects document navigation when chart tab inactive", () => {
    const decision = evaluateChartKeyboardKeydown(keyboardEvent("ArrowRight"), {
      listenerScope: "document",
      chartTabActive: false,
    });
    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReason).toBe("inactive_chart_tab");
  });

  it("evaluateChartKeyboardKeydown rejects editable targets", () => {
    const input = document.createElement("input");
    const decision = evaluateChartKeyboardKeydown(
      keyboardEvent("ArrowLeft", { target: input }),
      {
        listenerScope: "document",
        chartTabActive: true,
      },
    );
    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReason).toBe("editable_target");
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
