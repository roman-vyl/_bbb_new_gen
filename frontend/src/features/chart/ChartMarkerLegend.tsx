import { EXIT_MARKER_LEGEND } from "@/features/chart/chartMarkers";

export function ChartMarkerLegend() {
  return (
    <div className="chart-legend" aria-label="Trade marker legend">
      <p className="chart-legend__note">
        Markers show bar timing (E, SL, TP, SIG). Selected trade entry/exit prices use horizontal
        price lines, not marker position.
      </p>
      {EXIT_MARKER_LEGEND.map((item) => (
        <span key={item.label + item.kind} className="chart-legend__badge" title={item.description}>
          <span className={`chart-legend__chip chart-legend__chip--${item.kind}`}>{item.label}</span>
          <span className="chart-legend__text">{item.description}</span>
        </span>
      ))}
    </div>
  );
}
