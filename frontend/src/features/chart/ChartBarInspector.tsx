import type { ChartBar, ChartEmaOverlay, SignalTraceBundle, SideSignalTrace } from "@/api/types";
import {
  barIndexAtTime,
  candleAtTime,
  emaValuesAtBar,
  firstBlockingGate,
  formatBool,
  formatChartPrice,
  ohlcPriceDecimals,
} from "@/features/chart/signalTraceLookup";

type ChartBarInspectorProps = {
  selectedBarTimeSec: number | null;
  candles: ChartBar[];
  emaOverlays: ChartEmaOverlay[];
  signalTrace: SignalTraceBundle | null;
  signalTraceError: string | null;
  signalTraceLoading: boolean;
  onClear: () => void;
};

function InternalsBlock({
  title,
  fields,
  index,
}: {
  title: string;
  fields: Record<string, boolean[] | (number | null)[]> | undefined;
  index: number;
}) {
  if (!fields) {
    return null;
  }
  return (
    <details className="bar-inspector__details" open>
      <summary>{title}</summary>
      <dl className="bar-inspector__dl">
        {Object.entries(fields).map(([key, values]) => {
          const raw = values[index];
          const display =
            typeof raw === "boolean"
              ? formatBool(raw)
              : raw === null || raw === undefined
                ? "—"
                : String(raw);
          return (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{display}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

function readInternals(side: SideSignalTrace): {
  setup?: Record<string, boolean[] | (number | null)[]>;
  trigger?: Record<string, boolean[] | (number | null)[]>;
  direction?: Record<string, boolean[] | (number | null)[]>;
  blockers?: Record<string, Record<string, boolean[] | (number | null)[]>>;
} {
  const root = side.internals;
  if (!root || typeof root !== "object") {
    return {};
  }
  return root as {
    setup?: Record<string, boolean[] | (number | null)[]>;
    trigger?: Record<string, boolean[] | (number | null)[]>;
    direction?: Record<string, boolean[] | (number | null)[]>;
    blockers?: Record<string, Record<string, boolean[] | (number | null)[]>>;
  };
}

function SideBlock({
  label,
  side,
  index,
  trace,
}: {
  label: string;
  side: SideSignalTrace;
  index: number;
  trace: SignalTraceBundle;
}) {
  const blocker = firstBlockingGate(side, index);
  const { setup: setupFields, trigger: triggerFields, direction: directionFields, blockers: blockersByInstance } =
    readInternals(side);

  return (
    <div className="bar-inspector__side">
      <h4>{label}</h4>
      <dl className="bar-inspector__dl bar-inspector__dl--compact">
        <dt>signal_entry</dt>
        <dd>{formatBool(side.signal_entry[index] ?? false)}</dd>
        <dt>portfolio_entry</dt>
        <dd>{formatBool(side.portfolio_entry[index] ?? false)}</dd>
      </dl>
      <p className="bar-inspector__gates">
        <span>direction</span> {formatBool(side.direction_ok[index] ?? false)}
        {" · "}
        <span>blockers</span> {formatBool(side.blockers_ok[index] ?? false)}
        {" · "}
        <span>setup</span> {formatBool(side.setup_ok[index] ?? false)}
        {" · "}
        <span>trigger</span> {formatBool(side.trigger_ok[index] ?? false)}
        {" · "}
        <span>risk</span> {formatBool(side.risk_ok[index] ?? false)}
        {" · "}
        <span>stop_ready</span> {formatBool(side.stop_ready[index] ?? false)}
      </p>
      {blocker && (
        <p className="bar-inspector__blocker" role="status">
          No entry: <strong>{blocker.label}</strong>=false
        </p>
      )}
      <InternalsBlock
        title={`Setup (${trace.meta.component_ids.setup})`}
        fields={setupFields}
        index={index}
      />
      <InternalsBlock
        title={`Trigger (${trace.meta.component_ids.trigger})`}
        fields={triggerFields}
        index={index}
      />
      <InternalsBlock title="Direction" fields={directionFields} index={index} />
      {blockersByInstance &&
        Object.entries(blockersByInstance).map(([instanceId, fields]) => (
          <InternalsBlock
            key={instanceId}
            title={`Blocker ${instanceId}`}
            fields={fields}
            index={index}
          />
        ))}
    </div>
  );
}

export function ChartBarInspector({
  selectedBarTimeSec,
  candles,
  emaOverlays,
  signalTrace,
  signalTraceError,
  signalTraceLoading,
  onClear,
}: ChartBarInspectorProps) {
  if (selectedBarTimeSec === null) {
    return (
      <aside className="bar-inspector bar-inspector--empty">
        <h3>Bar Inspector</h3>
        <p className="bar-inspector__hint">Click a candle to inspect entry pipeline gates.</p>
      </aside>
    );
  }

  const candle = candleAtTime(candles, selectedBarTimeSec);
  const ema = emaValuesAtBar(emaOverlays, selectedBarTimeSec);
  const priceDecimals = candle ? ohlcPriceDecimals(candle) : 0;
  const timeLabel = new Date(selectedBarTimeSec * 1000).toISOString().replace("T", " ").slice(0, 19);

  let index = -1;
  if (signalTrace) {
    index = barIndexAtTime(signalTrace.times, selectedBarTimeSec);
  }

  return (
    <aside className="bar-inspector">
      <div className="bar-inspector__header">
        <h3>Bar Inspector</h3>
        <button type="button" className="link-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <p className="bar-inspector__time">
        <strong>Time</strong> {timeLabel} UTC
      </p>
      {candle && (
        <dl className="bar-inspector__dl">
          <dt>OHLC</dt>
          <dd>
            O {formatChartPrice(candle.open, priceDecimals)} H{" "}
            {formatChartPrice(candle.high, priceDecimals)} L{" "}
            {formatChartPrice(candle.low, priceDecimals)} C{" "}
            {formatChartPrice(candle.close, priceDecimals)}
          </dd>
          <dt>EMA fast / anchor / slow</dt>
          <dd>
            {formatChartPrice(ema.fast, priceDecimals)} / {formatChartPrice(ema.anchor, priceDecimals)}{" "}
            / {formatChartPrice(ema.slow, priceDecimals)}
          </dd>
        </dl>
      )}
      {signalTraceLoading && <p className="bar-inspector__hint">Loading signal trace…</p>}
      {signalTraceError && (
        <p className="banner banner--warn" role="status">
          {signalTraceError}
        </p>
      )}
      {signalTrace && index >= 0 && (
        <>
          <h4 className="bar-inspector__section">Final entry</h4>
          <SideBlock label="Long" side={signalTrace.long} index={index} trace={signalTrace} />
          <SideBlock label="Short" side={signalTrace.short} index={index} trace={signalTrace} />
        </>
      )}
      {signalTrace && index < 0 && (
        <p className="bar-inspector__hint">Selected bar is outside the loaded signal trace window.</p>
      )}
    </aside>
  );
}
