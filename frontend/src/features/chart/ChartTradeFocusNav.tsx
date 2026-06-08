import { useEffect, useState } from "react";

import { getAdjacentTradeId, parseManualTradeIdInput } from "@/features/chart/tradeLookup";
import type { TradeRecord } from "@/api/types";

type ChartTradeFocusNavProps = {
  trades: readonly TradeRecord[];
  selectedTradeId: number | string;
  onSelectTrade: (tradeId: number | string | null) => void;
};

export function ChartTradeFocusNav({
  trades,
  selectedTradeId,
  onSelectTrade,
}: ChartTradeFocusNavProps) {
  const [draft, setDraft] = useState(() => String(selectedTradeId));
  const [editing, setEditing] = useState(false);

  const prevId = getAdjacentTradeId(trades, selectedTradeId, -1);
  const nextId = getAdjacentTradeId(trades, selectedTradeId, 1);

  useEffect(() => {
    if (!editing) {
      setDraft(String(selectedTradeId));
    }
  }, [selectedTradeId, editing]);

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseManualTradeIdInput(draft);
    if (parsed === null) {
      setDraft(String(selectedTradeId));
      return;
    }
    setDraft(String(parsed));
    if (parsed !== selectedTradeId) {
      onSelectTrade(parsed);
    }
  };

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
        <label className="chart-trade-nav__label">
          <span className="chart-trade-nav__prefix">Trade #</span>
          <input
            type="text"
            inputMode="numeric"
            className="chart-trade-nav__input"
            value={draft}
            aria-label="Trade number"
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => {
              setEditing(true);
              event.currentTarget.select();
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                setDraft(String(selectedTradeId));
                setEditing(false);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
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
