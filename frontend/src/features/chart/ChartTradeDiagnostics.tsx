import type { ChartAuxEmaOverlay, ChartEmaOverlay, JsonObject, TradeRecord } from "@/api/types";
import { ActiveExitComponentsList } from "@/features/chart/ActiveExitComponentsList";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";
import { attachEmaAvailabilityHints } from "@/features/chart/exitEmaOverlayAvailability";
import { listActiveExitComponents, readExitPolicy } from "@/features/chart/exitPolicyForTrade";
import {
  buildTradeDiagnosticFields,
  EM_DASH,
} from "@/features/reports/tradeDiagnosticsFields";

type Props = {
  trade: TradeRecord | undefined;
  selectedTradeId: number;
  strategySpec: JsonObject | undefined;
  chartEmaOverlays: ChartEmaOverlay[];
  chartAuxEmaOverlays?: ChartAuxEmaOverlay[];
  focusWarning: string | null;
};

function DiagnosticDl({
  title,
  fields,
}: {
  title: string;
  fields: { key: string; label: string; value: string }[];
}) {
  return (
    <>
      <h4 className="trade-detail__subtitle">{title}</h4>
      <dl>
        {fields.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ChartTradeDiagnostics({
  trade,
  selectedTradeId,
  strategySpec,
  chartEmaOverlays,
  chartAuxEmaOverlays = [],
  focusWarning,
}: Props) {
  if (!trade) {
    return (
      <aside
        className="chart-trade-diagnostics trade-detail"
        data-testid="chart-trade-diagnostics"
      >
        <h3 className="chart-trade-diagnostics__title">Trade #{selectedTradeId}</h3>
        <p className="chart-trade-diagnostics__empty" data-testid="chart-trade-diagnostics-stale">
          {focusWarning ?? "Trade not found in the current variant."}
        </p>
      </aside>
    );
  }

  const { core, diagnostics } = buildTradeDiagnosticFields(trade);
  let anchorStack = null;
  try {
    if (strategySpec) anchorStack = anchorStackPeriodsFromStrategySpec(strategySpec);
  } catch {
    anchorStack = null;
  }

  const exitPolicy = strategySpec ? readExitPolicy(strategySpec) : null;
  const { rows, warning } = listActiveExitComponents(exitPolicy, trade);
  const loadedAuxPeriods = new Set(chartAuxEmaOverlays.map((o) => o.period));
  const rowsWithEma = attachEmaAvailabilityHints(rows, anchorStack, chartEmaOverlays).map(
    (row) => {
      if (row.emaPeriods.length === 0) return row;
      const onChart = row.emaPeriods.every((p) => loadedAuxPeriods.has(p) || anchorStack?.fast === p || anchorStack?.anchor === p || anchorStack?.slow === p);
      if (onChart && row.emaAvailabilityHint?.includes("unavailable")) {
        return { ...row, emaAvailabilityHint: "Shown on chart (auxiliary EMA line)" };
      }
      return row;
    },
  );

  return (
    <aside className="chart-trade-diagnostics trade-detail" data-testid="chart-trade-diagnostics">
      <h3 className="chart-trade-diagnostics__title">Trade #{trade.trade_id}</h3>
      <DiagnosticDl title="Trade" fields={core} />
      {diagnostics.length > 0 ? (
        <DiagnosticDl title="Diagnostics" fields={diagnostics} />
      ) : (
        <p className="chart-trade-diagnostics__hint">Schema v4 diagnostics not present on this trade.</p>
      )}
      <h4 className="trade-detail__subtitle">Active exit components</h4>
      <ActiveExitComponentsList rows={rowsWithEma} warning={warning} />
      {anchorStack && rowsWithEma.length === 0 && (
        <p className="chart-trade-diagnostics__hint">{EM_DASH}</p>
      )}
    </aside>
  );
}
