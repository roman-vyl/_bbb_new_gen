import { EXIT_MARKER_LEGEND } from "@/features/chart/chartMarkers";

export function ChartMarkerLegend() {
  return (
    <div className="chart-legend" aria-label="Trade marker legend">
      {EXIT_MARKER_LEGEND.map((item) => (
        <span key={item.label + item.kind} className="chart-legend__badge" title={item.description}>
          <span className={`chart-legend__chip chart-legend__chip--${item.kind}`}>{item.label}</span>
          <span className="chart-legend__text">{item.description}</span>
        </span>
      ))}
    </div>
  );
}
