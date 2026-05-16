import { useWorkbench } from "@/shared/context/WorkbenchContext";

export function ContextBar() {
  const {
    symbol,
    timeframe,
    report,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedVariantKey,
    setSelectedVariantKey,
    selectedTradeId,
    candlesSource,
  } = useWorkbench();

  if (!report) {
    return null;
  }

  return (
    <header className="context-bar">
      <div className="context-bar__brand">Research Workbench</div>
      <div className="context-bar__fields">
        <label className="context-field">
          <span>Symbol</span>
          <strong>{symbol}</strong>
        </label>
        <label className="context-field">
          <span>Timeframe</span>
          <strong>{timeframe}</strong>
        </label>
        <label className="context-field context-field--grow">
          <span>Run</span>
          <select
            value={selectedRunId ?? report.run_id}
            onChange={(e) => setSelectedRunId(e.target.value)}
          >
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.run_id}
              </option>
            ))}
          </select>
        </label>
        <label className="context-field context-field--grow">
          <span>Instance</span>
          <select
            value={selectedVariantKey}
            onChange={(e) => setSelectedVariantKey(e.target.value)}
          >
            {report.variants.map((v) => (
              <option key={v.variant} value={v.variant}>
                {v.variant}
              </option>
            ))}
          </select>
        </label>
        {selectedTradeId !== null && (
          <span className="context-pill">Trade #{selectedTradeId}</span>
        )}
      </div>
      <span className="context-bar__phase">
        Phase 1 · report API
        {candlesSource === "fixture" ? " · stub candles" : ""}
      </span>
    </header>
  );
}
