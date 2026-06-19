import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChartEventsBundle, SignalTraceBundle } from "@/api/types";
import { createSignalTraceDisplayCache } from "@/features/chart/signalTraceDisplayCache";
import { createSignalTraceRequestCoordinator } from "@/features/chart/runtime/signalTraceRequestCoordinator";
import {
  loadDenseLanesTrace,
  loadDisplayTraceChunk,
  mergeDisplayFromDenseFallback,
  type WorkbenchTraceNetworkLoadContext,
} from "@/features/chart/runtime/workbenchTraceNetworkLoad";

const fetchChartEvents = vi.fn<typeof import("@/api/client").fetchChartEvents>();
const fetchSignalTrace = vi.fn<typeof import("@/api/client").fetchSignalTrace>();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchChartEvents: (...args: Parameters<typeof fetchChartEvents>) => fetchChartEvents(...args),
    fetchSignalTrace: (...args: Parameters<typeof fetchSignalTrace>) => fetchSignalTrace(...args),
  };
});

const TRACE_META: SignalTraceBundle["meta"] = {
  variant: "v1",
  component_ids: { direction: "d", setups: [], trigger: "t", risk: "r" },
  setup_params: [],
  blocker_instances: [],
};

const EMPTY_SIDE = {
  direction_ok: [] as boolean[],
  blockers_ok: [] as boolean[],
  setup_ok: [] as boolean[],
  trigger_ok: [] as boolean[],
  risk_ok: [] as boolean[],
  signal_entry: [] as boolean[],
  stop_ready: [] as boolean[],
  portfolio_entry: [] as boolean[],
  internals: {},
};

const CHART_EVENTS_BUNDLE: ChartEventsBundle = {
  times: [1000],
  component_events: [
    {
      event_type: "point",
      role: "exit_signal",
      side: "long",
      component_id: "c1",
      instance_id: "i1",
      label: "evt",
      time: 1000,
      span_id: null,
      feature_family: null,
      source_timeframe: null,
      base_timeframe: null,
      metadata: {},
    },
  ],
  htf_context: { fast: [1], anchor: [2], slow: [3], meta: {} },
  meta: TRACE_META,
  coverage: {
    schema_version: 1,
    from_sec: 1000,
    to_sec: 1000,
    bar_count: 1,
    requested_from_sec: 1000,
    requested_to_sec: 1000,
    truncated: false,
    max_bars: 50_000,
  },
};

const DENSE_BUNDLE: SignalTraceBundle = {
  times: [1000],
  meta: TRACE_META,
  long: EMPTY_SIDE,
  short: EMPTY_SIDE,
  component_events: [],
};

function makeCtx(overrides?: Partial<WorkbenchTraceNetworkLoadContext["params"]>): WorkbenchTraceNetworkLoadContext {
  const coordinator = createSignalTraceRequestCoordinator();
  const displayRequestKey = "chart-events\u001frun\u001fv1\u001f1000000\u001f1000000\u001f";
  const networkCoordinatorKey = displayRequestKey;
  coordinator.markInFlight(displayRequestKey, 1);
  coordinator.markInFlight(networkCoordinatorKey, 1);
  return {
    params: {
      runId: "run",
      variant: "v1",
      fromMs: 1_000_000,
      toOpenTimeMs: 1_000_000,
      contextOverlayRef: null,
      windowKey: "wk",
      displayRequestKey,
      networkCoordinatorKey,
      fetchGeneration: 1,
      signal: new AbortController().signal,
      lanesOnlyFetch: false,
      ...overrides,
    },
    cache: createSignalTraceDisplayCache(),
    coordinator,
    requestedBounds: { fromSec: 1000, toSec: 1000 },
    onCommitDisplay: vi.fn(),
  };
}

describe("loadDisplayTraceChunk", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("commits display from chart-events when flag enabled", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    fetchChartEvents.mockResolvedValue(CHART_EVENTS_BUNDLE);
    const ctx = makeCtx();

    const result = await loadDisplayTraceChunk(ctx);

    expect(result).toEqual({
      outcome: "committed",
      displayMerged: true,
      mergeSource: "chart-events",
    });
    expect(ctx.onCommitDisplay).toHaveBeenCalledOnce();
    expect(fetchChartEvents).toHaveBeenCalledOnce();
  });

  it("returns continue on chart-events failure without committing", async () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    fetchChartEvents.mockRejectedValue(new Error("404"));
    const ctx = makeCtx();

    const result = await loadDisplayTraceChunk(ctx);

    expect(result.outcome).toBe("continue");
    expect(ctx.onCommitDisplay).not.toHaveBeenCalled();
  });
});

describe("loadDenseLanesTrace", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns bundle on success", async () => {
    fetchSignalTrace.mockResolvedValue(DENSE_BUNDLE);
    const ctx = makeCtx();

    const result = await loadDenseLanesTrace(ctx);

    expect(result).toEqual({ outcome: "ok", bundle: DENSE_BUNDLE });
  });

  it("returns error without throwing", async () => {
    fetchSignalTrace.mockRejectedValue(new Error("dense fail"));
    const ctx = makeCtx();

    const result = await loadDenseLanesTrace(ctx);

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.error).toBeInstanceOf(Error);
    }
  });
});

describe("mergeDisplayFromDenseFallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("merges dense bundle and commits display", () => {
    vi.stubEnv("VITE_CHART_EVENTS_API", "1");
    const ctx = makeCtx();
    mergeDisplayFromDenseFallback({
      ...ctx,
      bundle: DENSE_BUNDLE,
      mergeSource: "signal-trace-fallback",
    });
    expect(ctx.onCommitDisplay).toHaveBeenCalledOnce();
    expect(ctx.cache.sliceEventsForWindow(1000, 1000)).toHaveLength(0);
  });
});
