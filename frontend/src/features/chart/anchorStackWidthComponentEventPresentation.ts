import type { ComponentEvent } from "@/api/types";

export const ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID = "anchor_stack_width_setup";

export function formatAnchorStackWidthEventLabel(event: ComponentEvent): string | null {
  if (event.component_id !== ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID) {
    return null;
  }
  if (event.label === "Width ok" || event.label === "Width end") {
    return event.label;
  }
  return null;
}

export function formatAnchorStackWidthEventTooltip(event: ComponentEvent): string | null {
  if (event.component_id !== ANCHOR_STACK_WIDTH_SETUP_COMPONENT_ID) {
    return null;
  }
  if (event.tooltip) {
    return event.tooltip;
  }
  return null;
}
