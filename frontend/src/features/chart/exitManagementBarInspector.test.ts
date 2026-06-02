import { describe, expect, it } from "vitest";

import type { SideSignalTrace } from "@/api/types";
import {
  exitManagementActiveAtBar,
  formatExitManagementFieldValue,
  readExitManagementInternals,
} from "@/features/chart/exitManagementBarInspector";

function sideWithExitManagement(
  em: Record<string, Array<boolean | number | string | null>>,
): SideSignalTrace {
  return {
    direction_ok: [],
    blockers_ok: [],
    setup_ok: [],
    trigger_ok: [],
    risk_ok: [],
    signal_entry: [],
    stop_ready: [],
    portfolio_entry: [],
    internals: { exit_management: em },
  };
}

describe("exitManagementBarInspector", () => {
  it("reads exit_management from internals", () => {
    const side = sideWithExitManagement({
      break_even_active: [false, true],
      effective_stop_price: [null, 100.5],
    });
    const em = readExitManagementInternals(side);
    expect(em?.break_even_active?.[1]).toBe(true);
    expect(em?.effective_stop_price?.[1]).toBe(100.5);
  });

  it("detects active bar when break_even_active is true", () => {
    const em = { break_even_active: [false, true] };
    expect(exitManagementActiveAtBar(em, 0)).toBe(false);
    expect(exitManagementActiveAtBar(em, 1)).toBe(true);
  });

  it("formats price fields with chart price helper", () => {
    expect(formatExitManagementFieldValue("effective_stop_price", 100.5, 2)).toBe("100.50");
    expect(formatExitManagementFieldValue("break_even_triggered_on_bar", true, 2)).toBe("true");
  });
});
