import { useMemo, useState } from "react";

import type { TradeRecord } from "@/api/types";
import { ExitReasonBreakdownTable } from "@/features/reports/ExitReasonBreakdownTable";
import { FeeDiagnosticsSummary } from "@/features/reports/FeeDiagnosticsSummary";
import {
  EXIT_REASON_FILTER_OPTIONS,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";
import { EM_DASH } from "@/features/reports/formatDiagnostics";
import { TradeStatusChip } from "@/features/reports/TradeStatusChip";
import {
  buildTradeDiagnosticFields,
  formatMs,
  formatNum,
} from "@/features/reports/tradeDiagnosticsFields";
import { ProfileBreakdownTable } from "@/features/reports/ProfileBreakdownTable";
import { hasVariantDiagnostics, isDiagnosticsV4 } from "@/features/reports/reportSchema";
import {
  DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  distinctExitKinds,
  DIRECTION_FILTER_OPTIONS,
  ENTRY_CONTEXT_FILTER_OPTIONS,
  ENTRY_PROFILE_FILTER_OPTIONS,
  EXIT_GROUP_FILTER_OPTIONS,
  filterTrades,
  OUTCOME_FILTER_OPTIONS,
  QUALITY_FLAG_FILTER_OPTIONS,
  type TradeDiagnosticsFilterState,
} from "@/features/reports/tradeDiagnosticsFilters";
import { DIAGNOSTICS_COLUMNS } from "@/features/reports/tradeTableColumns";
import { findTradeById, tradeIdsEqual } from "@/features/chart/tradeLookup";
import { useWorkbench } from "@/shared/context/WorkbenchContext";

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
          <p className="empty-hint">Diagnostics available for schema v4/v5 reports.</p>
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

      <div className="filter-row" data-testid="filter-direction">
        <span>side</span>
        {DIRECTION_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.direction === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, direction: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {diagnosticsV4 && (
        <>
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
                className={
                  filters.entryContextState === opt.id ? "chip chip--active" : "chip"
                }
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
        </>
      )}

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

      {diagnosticsV4 && (
        <>
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

          <div className="filter-row" data-testid="filter-quality-flag">
            <span>quality</span>
            {QUALITY_FLAG_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={filters.qualityFlag === opt.id ? "chip chip--active" : "chip"}
                onClick={() => setFilters((prev) => ({ ...prev, qualityFlag: opt.id }))}
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
        </>
      )}

      <div className="table-wrap table-wrap--fill">
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
                DIAGNOSTICS_COLUMNS.map((col) => (
                  <th key={col.id} title={col.hint}>
                    {col.header}
                  </th>
                ))}
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
  const { core, diagnostics } = buildTradeDiagnosticFields(trade);

  return (
    <aside className="trade-detail">
      <div className="trade-detail__heading">
        <h3>Trade #{trade.trade_id}</h3>
        <TradeStatusChip status={trade.status} />
      </div>
      <dl>
        {core.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>
              {f.key === "exit_reason" ? <code>{f.value}</code> : f.value}
            </dd>
          </div>
        ))}
      </dl>
      {diagnostics.length > 0 && (
        <>
          <h4 className="trade-detail__subtitle">Diagnostics</h4>
          <dl>
            {diagnostics.map((f) => (
              <div key={f.key}>
                <dt>
                  {f.hint ? (
                    <span className="diagnostic-dt__label-group">
                      <span className="diagnostic-dt__label">{f.label}</span>
                      <span className="diagnostic-dt__hint">{f.hint}</span>
                    </span>
                  ) : (
                    f.label
                  )}
                </dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}
