import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import {
  buildEntryPriceLineTitle,
  buildExitPriceLineTitle,
  buildTradePriceLineSpecs,
} from "@/features/chart/chartTradePriceLines";

const closedLong: TradeRecord = {
  trade_id: 7,
  direction: "long",
  status: "closed",
  entry_time_ms: 1,
  exit_time_ms: 2,
  entry_price: 100,
  exit_price: 105,
  exit_reason: "stop_loss:atr_sl",
  exit_kind: "stop_loss",
  size: 1,
  pnl: 5,
  return_pct: 0.05,
};

describe("buildTradePriceLineSpecs", () => {
  it("builds entry and exit lines for closed trade", () => {
    const specs = buildTradePriceLineSpecs(closedLong);
    expect(specs).toHaveLength(2);
    expect(specs[0].kind).toBe("entry");
    expect(specs[0].options.price).toBe(100);
    expect(specs[1].kind).toBe("exit");
    expect(specs[1].options.price).toBe(105);
  });

  it("skips exit line for open trade", () => {
    const open: TradeRecord = { ...closedLong, status: "open", exit_time_ms: null, exit_price: null };
    expect(buildTradePriceLineSpecs(open)).toHaveLength(1);
  });
});

describe("price line titles", () => {
  it("formats entry and exit labels", () => {
    expect(buildEntryPriceLineTitle(closedLong)).toBe("Entry #7");
    expect(buildExitPriceLineTitle(closedLong)).toBe("Exit #7 · stop_loss");
  });
});
