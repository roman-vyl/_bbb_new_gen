import { useMemo, useState } from "react";

import type { TradeRecord } from "@/api/types";
import { ExitReasonBreakdownTable } from "@/features/reports/ExitReasonBreakdownTable";
import { FeeDiagnosticsSummary } from "@/features/reports/FeeDiagnosticsSummary";
import {
  EXIT_REASON_FILTER_OPTIONS,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";
import { EM_DASH, formatMoney, formatReturnPct } from "@/features/reports/formatDiagnostics";
import { ProfileBreakdownTable } from "@/features/reports/ProfileBreakdownTable";
import { hasVariantDiagnostics, isDiagnosticsV4 } from "@/features/reports/reportSchema";
import {
  DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  distinctExitKinds,
  ENTRY_CONTEXT_FILTER_OPTIONS,
  ENTRY_PROFILE_FILTER_OPTIONS,
  EXIT_GROUP_FILTER_OPTIONS,
  filterTrades,
  OUTCOME_FILTER_OPTIONS,
  type TradeDiagnosticsFilterState,
} from "@/features/reports/tradeDiagnosticsFilters";
import { DIAGNOSTICS_COLUMNS } from "@/features/reports/tradeTableColumns";
import { findTradeById, tradeIdsEqual } from "@/features/chart/tradeLookup";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH;
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function formatNum(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(digits);
}

function hasTradeDiagnostics(trade: TradeRecord): boolean {
  return (
    trade.entry_profile !== undefined ||
    trade.exit_kind !== undefined ||
    trade.gross_pnl !== undefined
  );
}

export function ReportsPanel() {
  const { report, selectedVariant, selectedTradeId, selectTrade } = useWorkbench();
  const [filters, setFilters] = useState<TradeDiagnosticsFilterState>(
    DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  );
  const [showDiagnosticsColumns, setShowDiagnosticsColumns] = useState(false);

  const exitKindOptions = useMemo(() => {
    if (!selectedVariant) return [];
    return distinctExitKinds(selectedVariant.trade_records);
  }, [selectedVariant]);

  const trades = useMemo(() => {
    if (!selectedVariant) return [];
    return filterTrades(selectedVariant.trade_records, filters);
  }, [selectedVariant, filters]);

  if (!report || !selectedVariant) {
    return null;
  }

  const metrics = selectedVariant.metrics;
  const diagnosticsV4 = isDiagnosticsV4(report.report_schema_version);

  const setExitReason = (exitReason: ExitReasonFilterId) => {
    setFilters((prev) => ({ ...prev, exitReason }));
  };

  return (
    <section className="panel reports-panel">
      <div className="panel__header">
        <h2>Reports</h2>
        <p className="panel__hint">
          Run {report.run_id} · schema v{report.report_schema_version} · click a row to focus Chart
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
            {metrics.total.win_rate === null
              ? EM_DASH
              : `${(metrics.total.win_rate * 100).toFixed(0)}%`}
          </strong>
        </div>
        <div className="metric-card">
          <span>Open</span>
          <strong>{metrics.open_trades.total}</strong>
        </div>
      </div>

      <section className="diagnostics-section" aria-label="Variant diagnostics">
        <h3 className="diagnostics-section__title">Diagnostics</h3>
        {!diagnosticsV4 && (
          <p className="empty-hint">Diagnostics available for schema v4 reports.</p>
        )}
        {diagnosticsV4 && (
          <>
            <p className="panel__hint diagnostics-section__hint">
              Breakdown tables reflect all closed trades in this variant (not affected by trade
              filters below).
            </p>
            {metrics.fee_diagnostics && (
              <>
                <h4 className="diagnostics-block__title">Fee diagnostics</h4>
                <FeeDiagnosticsSummary feeDiagnostics={metrics.fee_diagnostics} />
              </>
            )}
            {metrics.profile_breakdown && (
              <>
                <h4 className="diagnostics-block__title">Profile breakdown</h4>
                <ProfileBreakdownTable profileBreakdown={metrics.profile_breakdown} />
              </>
            )}
            {metrics.exit_reason_breakdown && (
              <>
                <h4 className="diagnostics-block__title">Exit reason breakdown</h4>
                <ExitReasonBreakdownTable
                  exitReasonBreakdown={metrics.exit_reason_breakdown}
                />
              </>
            )}
            {diagnosticsV4 && !hasVariantDiagnostics(metrics) && (
              <p className="empty-hint">No diagnostic metrics in this variant.</p>
            )}
          </>
        )}
      </section>

      <div className="filter-row">
        <span>entry_profile</span>
        {ENTRY_PROFILE_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.entryProfile === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, entryProfile: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span>entry_context</span>
        {ENTRY_CONTEXT_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.entryContextState === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, entryContextState: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row" data-testid="filter-exit-kind">
        <span>exit_kind</span>
        <button
          type="button"
          className={filters.exitKind === "all" ? "chip chip--active" : "chip"}
          onClick={() => setFilters((prev) => ({ ...prev, exitKind: "all" }))}
        >
          All
        </button>
        {exitKindOptions.map((kind) => (
          <button
            key={kind}
            type="button"
            className={filters.exitKind === kind ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, exitKind: kind }))}
          >
            {kind}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span>exit_group</span>
        {EXIT_GROUP_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.exitGroup === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, exitGroup: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span>exit_reason</span>
        {EXIT_REASON_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.exitReason === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setExitReason(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row" data-testid="filter-outcome">
        <span>outcome</span>
        {OUTCOME_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.outcome === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, outcome: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row trade-table-toolbar">
        <label className="diagnostics-columns-toggle">
          <input
            type="checkbox"
            checked={showDiagnosticsColumns}
            onChange={(e) => setShowDiagnosticsColumns(e.target.checked)}
          />
          Show diagnostics columns
        </label>
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
              {showDiagnosticsColumns &&
                DIAGNOSTICS_COLUMNS.map((col) => <th key={col.id}>{col.header}</th>)}
              <th>exit_reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <TradeRow
                key={trade.trade_id}
                trade={trade}
                selected={tradeIdsEqual(selectedTradeId, trade.trade_id)}
                showDiagnosticsColumns={showDiagnosticsColumns}
                onSelect={() => selectTrade(trade.trade_id)}
              />
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <p className="empty-hint">No trades match this filter.</p>}
      </div>

      {selectedTradeId !== null && (
        <TradeDetail trade={findTradeById(selectedVariant.trade_records, selectedTradeId)} />
      )}
    </section>
  );
}

function TradeRow({
  trade,
  selected,
  showDiagnosticsColumns,
  onSelect,
}: {
  trade: TradeRecord;
  selected: boolean;
  showDiagnosticsColumns: boolean;
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
      {showDiagnosticsColumns &&
        DIAGNOSTICS_COLUMNS.map((col) => <td key={col.id}>{col.cell(trade)}</td>)}
      <td>
        <code className="exit-reason">{trade.exit_reason}</code>
      </td>
    </tr>
  );
}

function TradeDetail({ trade }: { trade: TradeRecord | undefined }) {
  if (!trade) return null;
  const showDiagnostics = hasTradeDiagnostics(trade);

  return (
    <aside className="trade-detail">
      <h3>Trade #{trade.trade_id}</h3>
      <dl>
        <dt>Direction</dt>
        <dd>{trade.direction}</dd>
        <dt>Entry price</dt>
        <dd>{trade.entry_price ?? EM_DASH}</dd>
        <dt>Exit price</dt>
        <dd>{trade.exit_price ?? EM_DASH}</dd>
        <dt>Return %</dt>
        <dd>{trade.return_pct === null ? EM_DASH : formatReturnPct(trade.return_pct)}</dd>
        <dt>exit_reason</dt>
        <dd>
          <code>{trade.exit_reason}</code>
        </dd>
      </dl>
      {showDiagnostics && (
        <>
          <h4 className="trade-detail__subtitle">Diagnostics</h4>
          <dl>
            <dt>entry_profile</dt>
            <dd>{trade.entry_profile ?? EM_DASH}</dd>
            <dt>entry_context_state</dt>
            <dd>{trade.entry_context_state ?? EM_DASH}</dd>
            <dt>active_exit_profile</dt>
            <dd>{trade.active_exit_profile ?? EM_DASH}</dd>
            <dt>exit_group</dt>
            <dd>{trade.exit_group ?? EM_DASH}</dd>
            <dt>exit_profile</dt>
            <dd>{trade.exit_profile ?? EM_DASH}</dd>
            <dt>exit_kind</dt>
            <dd>{trade.exit_kind ?? EM_DASH}</dd>
            <dt>exit_component_id</dt>
            <dd>{trade.exit_component_id ?? EM_DASH}</dd>
            <dt>exit_instance_id</dt>
            <dd>{trade.exit_instance_id ?? EM_DASH}</dd>
            <dt>gross_pnl</dt>
            <dd>{formatMoney(trade.gross_pnl)}</dd>
            <dt>fees_paid</dt>
            <dd>{formatMoney(trade.fees_paid)}</dd>
            <dt>gross_return_pct</dt>
            <dd>
              {trade.gross_return_pct === null || trade.gross_return_pct === undefined
                ? EM_DASH
                : formatReturnPct(trade.gross_return_pct)}
            </dd>
            <dt>hold_bars</dt>
            <dd>{trade.hold_bars ?? EM_DASH}</dd>
            <dt>hold_minutes</dt>
            <dd>{trade.hold_minutes ?? EM_DASH}</dd>
          </dl>
        </>
      )}
    </aside>
  );
}
