import {
  COMPONENT_EVENT_LEGEND,
  COMPONENT_EVENT_ROLE_LEGEND,
} from "@/features/chart/chartComponentEvents";
import { EXIT_MARKER_LEGEND } from "@/features/chart/chartMarkers";

type ChartMarkerLegendProps = {
  showEntryBlockMarkers: boolean;
  onShowEntryBlockMarkersChange: (show: boolean) => void;
  showExitSignalMarkers: boolean;
  onShowExitSignalMarkersChange: (show: boolean) => void;
  showSetupMarkers: boolean;
  onShowSetupMarkersChange: (show: boolean) => void;
  hasComponentEvents: boolean;
};

export function ChartMarkerLegend({
  showEntryBlockMarkers,
  onShowEntryBlockMarkersChange,
  showExitSignalMarkers,
  onShowExitSignalMarkersChange,
  showSetupMarkers,
  onShowSetupMarkersChange,
  hasComponentEvents,
}: ChartMarkerLegendProps) {
  return (
    <div className="chart-legend" aria-label="Chart marker legend">
      <p className="chart-legend__note">
        Trade markers show bar timing (E, SL, TP, SIG). Component events use semantic types
        (source, span start/end, point). Selected trade entry/exit prices use horizontal price
        lines, not marker position.
      </p>
      {EXIT_MARKER_LEGEND.map((item) => (
        <span key={item.label + item.kind} className="chart-legend__badge" title={item.description}>
          <span className={`chart-legend__chip chart-legend__chip--${item.kind}`}>{item.label}</span>
          <span className="chart-legend__text">{item.description}</span>
        </span>
      ))}
      {hasComponentEvents && (
        <div className="chart-legend__group">
          <p className="chart-legend__subheading">Component events</p>
          {COMPONENT_EVENT_LEGEND.map((item) => (
            <span
              key={item.event_type}
              className="chart-legend__badge"
              title={item.description}
            >
              <span className={`chart-legend__chip chart-legend__chip--event-${item.event_type}`}>
                {item.label}
              </span>
              <span className="chart-legend__text">{item.description}</span>
            </span>
          ))}
          {COMPONENT_EVENT_ROLE_LEGEND.map((item) => (
            <span key={item.role} className="chart-legend__badge" title={item.description}>
              <span className={`chart-legend__chip chart-legend__chip--${item.role}`}>
                {item.label}
              </span>
              <span className="chart-legend__text">{item.description}</span>
            </span>
          ))}
          <label className="chart-legend__toggle">
            <input
              type="checkbox"
              checked={showEntryBlockMarkers}
              onChange={(event) => onShowEntryBlockMarkersChange(event.target.checked)}
            />
            Show entry_block
          </label>
          <label className="chart-legend__toggle">
            <input
              type="checkbox"
              checked={showExitSignalMarkers}
              onChange={(event) => onShowExitSignalMarkersChange(event.target.checked)}
            />
            Show exit_signal
          </label>
          <label className="chart-legend__toggle">
            <input
              type="checkbox"
              checked={showSetupMarkers}
              onChange={(event) => onShowSetupMarkersChange(event.target.checked)}
            />
            Show setup
          </label>
        </div>
      )}
    </div>
  );
}
