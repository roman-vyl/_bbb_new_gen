import { useMemo, useState } from "react";

import type { TradeRecord } from "@/api/types";
import {
  EXIT_REASON_FILTER_OPTIONS,
  matchesExitReasonFilter,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatNum(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function ReportsPanel() {
  const { report, selectedVariant, selectedTradeId, selectTrade } = useWorkbench();
  const [exitFilter, setExitFilter] = useState<ExitReasonFilterId>("all");

  const trades = useMemo(() => {
    return selectedVariant.trade_records.filter((t) =>
      matchesExitReasonFilter(t.exit_reason, exitFilter),
    );
  }, [selectedVariant.trade_records, exitFilter]);

  const metrics = selectedVariant.metrics;

  return (
    <section className="panel reports-panel">
      <div className="panel__header">
        <h2>Reports</h2>
        <p className="panel__hint">
          Fixture run · schema v{report.report_schema_version} · click a row to focus Chart
        </p>
      </div>

      <div className="reports-summary">
        <div className="metric-card">
          <span>Total PnL</span>
          <strong>{formatNum(metrics.total.pnl)}</strong>
        </div>
        <div className="metric-card">
          <span>Trades</span>
          <strong>{metrics.total.trades}</strong>
        </div>
        <div className="metric-card">
          <span>Win rate</span>
          <strong>
            {metrics.total.win_rate === null ? "—" : `${(metrics.total.win_rate * 100).toFixed(0)}%`}
          </strong>
        </div>
        <div className="metric-card">
          <span>Open</span>
          <strong>{metrics.open_trades.total}</strong>
        </div>
      </div>

      <div className="filter-row">
        <span>exit_reason</span>
        {EXIT_REASON_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={exitFilter === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setExitFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="trade-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Dir</th>
              <th>Status</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
              <th>exit_reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <TradeRow
                key={trade.trade_id}
                trade={trade}
                selected={selectedTradeId === trade.trade_id}
                onSelect={() => selectTrade(trade.trade_id)}
              />
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <p className="empty-hint">No trades match this filter.</p>}
      </div>

      {selectedTradeId !== null && (
        <TradeDetail
          trade={selectedVariant.trade_records.find((t) => t.trade_id === selectedTradeId)}
        />
      )}
    </section>
  );
}

function TradeRow({
  trade,
  selected,
  onSelect,
}: {
  trade: TradeRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <tr className={selected ? "trade-row trade-row--selected" : "trade-row"} onClick={onSelect}>
      <td>{trade.trade_id}</td>
      <td>{trade.direction}</td>
      <td>{trade.status}</td>
      <td>{formatMs(trade.entry_time_ms)}</td>
      <td>{formatMs(trade.exit_time_ms)}</td>
      <td className={trade.pnl !== null && trade.pnl < 0 ? "pnl-negative" : "pnl-positive"}>
        {formatNum(trade.pnl)}
      </td>
      <td>
        <code className="exit-reason">{trade.exit_reason}</code>
      </td>
    </tr>
  );
}

function TradeDetail({ trade }: { trade: TradeRecord | undefined }) {
  if (!trade) return null;
  return (
    <aside className="trade-detail">
      <h3>Trade #{trade.trade_id}</h3>
      <dl>
        <dt>Direction</dt>
        <dd>{trade.direction}</dd>
        <dt>Entry price</dt>
        <dd>{trade.entry_price ?? "—"}</dd>
        <dt>Exit price</dt>
        <dd>{trade.exit_price ?? "—"}</dd>
        <dt>Return %</dt>
        <dd>{trade.return_pct === null ? "—" : `${(trade.return_pct * 100).toFixed(2)}%`}</dd>
        <dt>exit_reason</dt>
        <dd>
          <code>{trade.exit_reason}</code>
        </dd>
      </dl>
    </aside>
  );
}
