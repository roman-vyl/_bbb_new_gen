import type { TradeRecord } from "@/api/types";

export function tradeDirectionLabel(direction: TradeRecord["direction"]): string {
  return direction === "long" ? "LONG" : "SHORT";
}

export function TradeDirectionChip({ direction }: { direction: TradeRecord["direction"] }) {
  const chipClass =
    direction === "long"
      ? "chart-legend__chip chart-legend__chip--long"
      : "chart-legend__chip chart-legend__chip--short";

  return (
    <span className={chipClass} data-testid="trade-direction-chip">
      {tradeDirectionLabel(direction)}
    </span>
  );
}
