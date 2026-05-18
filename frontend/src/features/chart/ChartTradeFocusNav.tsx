import { getAdjacentTradeId } from "@/features/chart/tradeLookup";
import type { TradeRecord } from "@/api/types";

type ChartTradeFocusNavProps = {
  trades: readonly TradeRecord[];
  selectedTradeId: number;
  onSelectTrade: (tradeId: number | null) => void;
};

export function ChartTradeFocusNav({
  trades,
  selectedTradeId,
  onSelectTrade,
}: ChartTradeFocusNavProps) {
  const prevId = getAdjacentTradeId(trades, selectedTradeId, -1);
  const nextId = getAdjacentTradeId(trades, selectedTradeId, 1);

  return (
    <footer className="chart-trade-nav" aria-label="Trade focus navigation">
      <div className="chart-trade-nav__controls" role="group" aria-label="Trade step">
        <button
          type="button"
          className="chart-trade-nav__btn"
          aria-label="Previous trade"
          disabled={prevId === null}
          onClick={() => prevId !== null && onSelectTrade(prevId)}
        >
          ←
        </button>
        <span className="chart-trade-nav__label" aria-label={`Trade ${selectedTradeId}`}>
          Trade #{selectedTradeId}
        </span>
        <button
          type="button"
          className="chart-trade-nav__btn"
          aria-label="Next trade"
          disabled={nextId === null}
          onClick={() => nextId !== null && onSelectTrade(nextId)}
        >
          →
        </button>
      </div>
      <button type="button" className="link-btn chart-trade-nav__clear" onClick={() => onSelectTrade(null)}>
        Clear
      </button>
    </footer>
  );
}
