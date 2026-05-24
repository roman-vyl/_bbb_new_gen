import type { TradeRecord } from "@/api/types";

export function tradeStatusLabel(status: TradeRecord["status"]): string {
  return status === "open" ? "OPEN" : "CLOSED";
}

export function TradeStatusChip({ status }: { status: TradeRecord["status"] }) {
  const chipClass =
    status === "open"
      ? "chart-legend__chip chart-legend__chip--open"
      : "chart-legend__chip chart-legend__chip--closed";

  return (
    <span className={chipClass} data-testid="trade-status-chip">
      {tradeStatusLabel(status)}
    </span>
  );
}
