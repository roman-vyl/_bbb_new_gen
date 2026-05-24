import type { CreatePriceLineOptions } from "lightweight-charts";

import type { TradeRecord } from "@/api/types";
import { classifyExitReason } from "@/features/chart/chartMarkers";

export type TradePriceLineKind = "entry" | "exit";

export type TradePriceLineSpec = {
  kind: TradePriceLineKind;
  options: CreatePriceLineOptions;
};

function entryLineColor(direction: TradeRecord["direction"]): string {
  return direction === "long" ? "#22c55e" : "#ef4444";
}

function exitLineColor(): string {
  return "#fbbf24";
}

export function buildEntryPriceLineTitle(trade: TradeRecord): string {
  return `Entry #${trade.trade_id}`;
}

export function buildExitPriceLineTitle(trade: TradeRecord): string {
  const kind = trade.exit_kind ?? classifyExitReason(trade.exit_reason);
  if (kind === "open" || kind === "unknown") {
    return `Exit #${trade.trade_id}`;
  }
  return `Exit #${trade.trade_id} · ${kind}`;
}

export function buildTradePriceLineSpecs(trade: TradeRecord): TradePriceLineSpec[] {
  const specs: TradePriceLineSpec[] = [];

  if (trade.entry_price !== null && trade.entry_price !== undefined) {
    specs.push({
      kind: "entry",
      options: {
        price: trade.entry_price,
        color: entryLineColor(trade.direction),
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: buildEntryPriceLineTitle(trade),
      },
    });
  }

  if (
    trade.status === "closed" &&
    trade.exit_price !== null &&
    trade.exit_price !== undefined
  ) {
    specs.push({
      kind: "exit",
      options: {
        price: trade.exit_price,
        color: exitLineColor(),
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: buildExitPriceLineTitle(trade),
      },
    });
  }

  return specs;
}
