import type { ChartBar, ChartEmaOverlay, IndicatorPoint } from "@/api/types";
import type { CandlesWindowBundle, EmaWindowBundle } from "@/api/types";

const STEP_MS = 300_000;

export function mockCandlesWindowBundle(
  candles: ChartBar[],
  fromMs: number,
  toMs: number,
): CandlesWindowBundle {
  return {
    candles,
    coverage: {
      requested_from_ms: fromMs,
      requested_to_ms: toMs,
      actual_from_ms: fromMs,
      actual_to_ms: toMs,
      truncated: false,
    },
  };
}

export function mockEmaWindowBundle(
  points: IndicatorPoint[],
  fromMs: number,
  toMs: number,
): EmaWindowBundle {
  return {
    points,
    coverage: {
      requested_from_ms: fromMs,
      requested_to_ms: toMs,
      actual_from_ms: fromMs,
      actual_to_ms: toMs,
      calculation_origin_ms: fromMs,
      coverage_to_ms: toMs,
      cache_hit: false,
      truncated: false,
    },
  };
}

export function installSplitMarketWindowMocks(input: {
  fetchCandlesWindow: {
    mockImplementation: (
      fn: (params: {
        fromMs: number;
        toOpenTimeMs: number;
      }) => Promise<CandlesWindowBundle>,
    ) => void;
  };
  fetchEmaWindow: {
    mockImplementation: (
      fn: (params: {
        period: number;
        fromMs: number;
        toOpenTimeMs: number;
      }) => Promise<EmaWindowBundle>,
    ) => void;
  };
  candles: ChartBar[];
  emaOverlays?: ChartEmaOverlay[];
}) {
  input.fetchCandlesWindow.mockImplementation(async ({ fromMs, toOpenTimeMs }) =>
    mockCandlesWindowBundle(input.candles, fromMs, toOpenTimeMs + STEP_MS),
  );
  input.fetchEmaWindow.mockImplementation(async ({ period, fromMs, toOpenTimeMs }) => {
    const overlay = input.emaOverlays?.find((candidate) => candidate.period === period);
    const points =
      overlay?.points ??
      ([
        {
          time: input.candles[0]?.time ?? Math.floor(fromMs / 1000),
          value: period,
          kind: "chart_overlay_ema" as const,
        },
      ] satisfies IndicatorPoint[]);
    return mockEmaWindowBundle(points, fromMs, toOpenTimeMs + STEP_MS);
  });
}
