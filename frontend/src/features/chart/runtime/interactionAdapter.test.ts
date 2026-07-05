/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

import {
  createChartInteractionAdapter,
  evaluateChartKeyboardKeydown,
  handleChartNavigationKeydown,
  isChartDocumentNavigationKey,
  isChartNavigationKey,
  registerChartDocumentKeyboardNavigation,
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

  for (const key of ["ArrowLeft", "ArrowRight", "PageUp", "PageDown"] as const) {
    it(`accepts document-scope ${key}`, () => {
      const decision = evaluateChartKeyboardKeydown(keyboardEvent(key), {
        listenerScope: "document",
        chartTabActive: true,
      });
      expect(decision.accepted).toBe(true);
      expect(decision.key).toBe(key);
    });
  }

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

  it("evaluateChartKeyboardKeydown rejects modifier keys", () => {
    const decision = evaluateChartKeyboardKeydown(
      keyboardEvent("ArrowLeft", { shiftKey: true }),
      {
        listenerScope: "document",
        chartTabActive: true,
      },
    );
    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReason).toBe("modifier");
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

  it("evaluateChartKeyboardKeydown rejects composer panel targets", () => {
    const composer = document.createElement("section");
    composer.className = "panel composer-panel";
    const inner = document.createElement("div");
    composer.appendChild(inner);
    document.body.appendChild(composer);

    const decision = evaluateChartKeyboardKeydown(
      keyboardEvent("ArrowLeft", { target: inner }),
      {
        listenerScope: "document",
        chartTabActive: true,
      },
    );
    expect(decision.accepted).toBe(false);
    expect(decision.rejectionReason).toBe("editable_target");
    composer.remove();
  });

  it("handleChartNavigationKeydown calls onKeyboardPanStart for accepted document keydown", () => {
    const onKeyboardPanStart = vi.fn();
    handleChartNavigationKeydown(keyboardEvent("PageDown"), {
      listenerScope: "document",
      chartTabActive: true,
      adapter: { onKeyboardPanStart },
    });
    expect(onKeyboardPanStart).toHaveBeenCalledWith("PageDown");
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

  it("registerChartDocumentKeyboardNavigation wires document capture listener", () => {
    const events: ChartInteractionEvent[] = [];
    const adapter = createChartInteractionAdapter({
      dispatch: (event) => events.push(event),
      getCandles: () => [],
      shouldSuppressRangeEvent: () => false,
    });

    const registration = registerChartDocumentKeyboardNavigation({
      chartTabActive: () => true,
      chartCanvas: document.createElement("div"),
      adapter,
    });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(events).toEqual([{ type: "keyboard_pan_start", key: "ArrowRight" }]);
    registration.unregister();
  });
});
