import { describe, expect, it } from "vitest";

import {
  classifyExitReason,
  exitReasonMarkerLabel,
} from "@/features/chart/chartMarkers";

describe("break_even exit markers", () => {
  it("classifies break_even exit_reason", () => {
    expect(classifyExitReason("break_even:be_ao")).toBe("break_even");
    expect(exitReasonMarkerLabel("break_even:be_ao")).toBe("BE");
  });
});
