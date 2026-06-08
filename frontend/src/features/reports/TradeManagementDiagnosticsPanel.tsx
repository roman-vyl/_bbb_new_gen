import type { TradeManagementSummary } from "@/api/types";
import {
  EM_DASH,
  formatExitReasonMix,
  formatMoney,
  formatProfitFactor,
  formatReturnPct,
  formatWinRate,
} from "@/features/reports/formatDiagnostics";
import {
  countMapRows,
  optionalNumber,
  phaseRows,
} from "@/features/reports/tradeManagementSummary";

type Props = {
  summary: TradeManagementSummary;
};

function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return formatReturnPct(value);
}

function SummaryMetricList({
  title,
  obj,
  fields,
}: {
  title: string;
  obj: Record<string, unknown> | undefined;
  fields: Array<{ key: string; label: string; format?: (value: unknown) => string }>;
}) {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  return (
    <div className="trade-management-summary-block">
      <h4 className="diagnostics-block__title">{title}</h4>
      <dl className="trade-management-summary-dl">
        {fields.map(({ key, label, format }) => {
          const raw = obj[key];
          const value =
            raw === null || raw === undefined
              ? EM_DASH
              : format
                ? format(raw)
                : String(raw);
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function TradeManagementDiagnosticsPanel({ summary }: Props) {
  const phases = phaseRows(summary);
  const exitLayers = countMapRows(summary.exit_layer_breakdown);
  const runner = summary.runner_capture_summary;
  const protectedSummary = summary.protected_trade_summary;

  return (
    <section
      className="diagnostics-section trade-management-diagnostics"
      aria-label="Trade management diagnostics"
      data-testid="trade-management-diagnostics"
    >
      <h3 className="diagnostics-section__title">Trade Management Diagnostics</h3>
      <p className="panel__hint diagnostics-section__hint">
        Read-only runtime diagnostics from diagnostic-only exit management. Event trace is not
        rendered here.
      </p>

      {phases.length > 0 && (
        <>
          <h4 className="diagnostics-block__title">Phase reached breakdown</h4>
          <div className="table-wrap breakdown-table-wrap">
            <table className="trade-table breakdown-table breakdown-table--trade-management">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Trades</th>
                  <th>Share</th>
                  <th>PnL</th>
                  <th>PF</th>
                  <th>Win rate</th>
                  <th>Avg MFE %</th>
                  <th>P90 MFE %</th>
                  <th>Avg giveback %</th>
                  <th>Avg capture</th>
                </tr>
              </thead>
              <tbody>
                {phases.map(({ phase, bucket }) => {
                  const count = bucket.trade_count ?? 0;
                  const empty = count === 0;
                  return (
                    <tr key={phase}>
                      <td>
                        <code>{phase}</code>
                      </td>
                      <td>{count}</td>
                      <td>
                        {empty ? EM_DASH : formatWinRate(bucket.share_of_all_trades ?? null)}
                      </td>
                      <td>{formatMoney(bucket.pnl)}</td>
                      <td>{empty ? EM_DASH : formatProfitFactor(bucket.profit_factor ?? null)}</td>
                      <td>{empty ? EM_DASH : formatWinRate(bucket.win_rate ?? null)}</td>
                      <td>{empty ? EM_DASH : formatRatio(bucket.avg_mfe_pct)}</td>
                      <td>{empty ? EM_DASH : formatRatio(bucket.p90_mfe_pct)}</td>
                      <td>{empty ? EM_DASH : formatRatio(bucket.avg_giveback_pct)}</td>
                      <td>{empty ? EM_DASH : formatRatio(bucket.avg_capture_ratio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SummaryMetricList
        title="Runner capture summary"
        obj={runner}
        fields={[
          { key: "trade_count", label: "Runner trades" },
          {
            key: "avg_capture_ratio",
            label: "Avg capture ratio",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "median_capture_ratio",
            label: "Median capture ratio",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "avg_giveback_pct",
            label: "Avg giveback %",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "median_giveback_pct",
            label: "Median giveback %",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "exit_layer_mix",
            label: "Exit layer mix",
            format: (v) =>
              typeof v === "object" && v !== null
                ? formatExitReasonMix(v as Record<string, number>)
                : EM_DASH,
          },
          {
            key: "exit_reason_mix",
            label: "Exit reason mix",
            format: (v) =>
              typeof v === "object" && v !== null
                ? formatExitReasonMix(v as Record<string, number>)
                : EM_DASH,
          },
        ]}
      />

      <SummaryMetricList
        title="Protected trade summary"
        obj={protectedSummary}
        fields={[
          { key: "trade_count", label: "Protected reached" },
          {
            key: "protected_not_runner_count",
            label: "Stopped before runner",
          },
          {
            key: "avg_capture_ratio",
            label: "Avg capture ratio",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "median_giveback_pct",
            label: "Median giveback %",
            format: (v) => formatRatio(optionalNumber(v)),
          },
          {
            key: "exit_reason_mix",
            label: "Exit reason mix",
            format: (v) =>
              typeof v === "object" && v !== null
                ? formatExitReasonMix(v as Record<string, number>)
                : EM_DASH,
          },
        ]}
      />

      {exitLayers.length > 0 && (
        <>
          <h4 className="diagnostics-block__title">Exit layer breakdown</h4>
          <div className="table-wrap breakdown-table-wrap">
            <table className="trade-table breakdown-table breakdown-table--trade-management">
              <thead>
                <tr>
                  <th>Exit layer</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {exitLayers.map(({ key, count }) => (
                  <tr key={key}>
                    <td>
                      <code>{key}</code>
                    </td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {phases.length === 0 &&
        exitLayers.length === 0 &&
        !runner &&
        !protectedSummary && (
          <p className="empty-hint">Trade-management summary present but no displayable buckets.</p>
        )}
    </section>
  );
}
