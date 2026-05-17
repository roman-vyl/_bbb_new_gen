import type { ChartBar, ChartEmaOverlay, SideSignalTrace, SignalTraceGate } from "@/api/types";

const GATE_ORDER: SignalTraceGate[] = [
  "direction_ok",
  "blockers_ok",
  "setup_ok",
  "trigger_ok",
  "risk_ok",
  "stop_ready",
];

const GATE_LABELS: Record<SignalTraceGate, string> = {
  direction_ok: "direction_ok",
  blockers_ok: "blockers_ok",
  setup_ok: "setup_ok",
  trigger_ok: "trigger_ok",
  risk_ok: "risk_ok",
  stop_ready: "stop_ready",
};

export function barIndexAtTime(times: readonly number[], timeSec: number): number {
  if (times.length === 0) {
    return -1;
  }
  if (timeSec < times[0]) {
    return 0;
  }
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (times[mid] <= timeSec) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

export function firstBlockingGate(
  side: SideSignalTrace,
  index: number,
): { gate: SignalTraceGate; label: string } | null {
  for (const gate of GATE_ORDER) {
    const values = side[gate];
    if (index < 0 || index >= values.length) {
      return null;
    }
    if (!values[index]) {
      return { gate, label: GATE_LABELS[gate] };
    }
  }
  return null;
}

export function emaValuesAtBar(
  overlays: readonly ChartEmaOverlay[],
  barTimeSec: number,
): { fast: number | null; anchor: number | null; slow: number | null } {
  const pick = (role: "fast" | "anchor" | "slow"): number | null => {
    const overlay = overlays.find((o) => o.role === role);
    if (!overlay) {
      return null;
    }
    const point = overlay.points.find((p) => p.time === barTimeSec);
    return point?.value ?? null;
  };
  return { fast: pick("fast"), anchor: pick("anchor"), slow: pick("slow") };
}

export function formatBool(value: boolean): string {
  return value ? "true" : "false";
}

/** Decimal places implied by stored OHLC (Bybit tick precision, no extra rounding in DB). */
export function ohlcPriceDecimals(candle: ChartBar): number {
  return Math.max(
    0,
    ...[candle.open, candle.high, candle.low, candle.close].map(decimalPlacesFromNumber),
  );
}

function decimalPlacesFromNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  // Match exchange tick precision; OHLC from DB can pick up float noise (e.g. 79413.599999…).
  for (let decimals = 8; decimals >= 0; decimals -= 1) {
    const rounded = Number(value.toFixed(decimals));
    if (Math.abs(rounded - value) <= Math.max(1e-8, Math.abs(value) * 1e-9)) {
      const trimmed = rounded.toString().replace(/\.?0+$/, "");
      const dot = trimmed.indexOf(".");
      return dot === -1 ? 0 : trimmed.length - dot - 1;
    }
  }
  return 8;
}

export function formatChartPrice(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(decimals);
}

export function candleAtTime(candles: readonly ChartBar[], timeSec: number): ChartBar | null {
  const idx = barIndexAtTime(
    candles.map((c) => c.time),
    timeSec,
  );
  if (idx < 0 || idx >= candles.length) {
    return null;
  }
  return candles[idx] ?? null;
}
