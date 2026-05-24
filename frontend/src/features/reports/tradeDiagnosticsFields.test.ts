import { describe, expect, it } from "vitest";

import { formatPrice } from "@/features/reports/tradeDiagnosticsFields";

describe("formatPrice", () => {
  it("rounds exit-style prices to one decimal", () => {
    expect(formatPrice(80392.42142857143, 1)).toBe("80392.4");
  });

  it("trims trailing zeros for whole prices", () => {
    expect(formatPrice(62800, 1)).toBe("62800");
  });
});
