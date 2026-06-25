import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, fetchChartEvents, fetchChartMarketBundle, fetchSignalTrace } from "@/api/client";
import {
  buildChartEventsUrlPath,
  buildChartEventsRequestKey,
  buildSignalTraceUrlPath,
  buildTraceRequestKey,
} from "@/features/chart/runtime/signalTraceRequestCoordinator";

describe("fetchSignalTrace query params", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses to_open_time_ms (exclusive end) not legacy to param", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("from=1700000000000");
      expect(url).toContain("to_open_time_ms=1700000297000");
      expect(url).not.toMatch(/[?&]to=/);
      return {
        ok: true,
        json: async () => ({
          times: [],
          meta: { variant: "v1", component_ids: {}, setup_params: [], blocker_instances: [] },
          long: {
            direction_ok: [],
            blockers_ok: [],
            setup_ok: [],
            trigger_ok: [],
            risk_ok: [],
            signal_entry: [],
            stop_ready: [],
            portfolio_entry: [],
            internals: {},
          },
          short: {
            direction_ok: [],
            blockers_ok: [],
            setup_ok: [],
            trigger_ok: [],
            risk_ok: [],
            signal_entry: [],
            stop_ready: [],
            portfolio_entry: [],
            internals: {},
          },
          component_events: [],
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSignalTrace({
      runId: "run-1",
      variant: "v1",
      fromMs: 1_700_000_000_000,
      toOpenTimeMs: 1_700_000_297_000,
      contextOverlayRef: "ctx_a",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("context_overlay_ref=ctx_a");
  });

  it("passes AbortSignal to fetchSignalTrace", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        times: [],
        meta: { variant: "v1", component_ids: {}, setup_params: [], blocker_instances: [] },
        long: {
          direction_ok: [],
          blockers_ok: [],
          setup_ok: [],
          trigger_ok: [],
          risk_ok: [],
          signal_entry: [],
          stop_ready: [],
          portfolio_entry: [],
          internals: {},
        },
        short: {
          direction_ok: [],
          blockers_ok: [],
          setup_ok: [],
          trigger_ok: [],
          risk_ok: [],
          signal_entry: [],
          stop_ready: [],
          portfolio_entry: [],
          internals: {},
        },
        component_events: [],
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSignalTrace({
      runId: "run-1",
      variant: "v1",
      fromMs: 1,
      toOpenTimeMs: 2,
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it("passes AbortSignal to fetchChartMarketBundle", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ candles: [], ema_overlays: [] }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChartMarketBundle({
      symbol: "BTCUSDT",
      timeframe: "5m",
      fromMs: 1,
      toOpenTimeMs: 2,
      emaFast: 100,
      emaAnchor: 200,
      emaSlow: 500,
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it("traceRequestKey identifies the same URL resource as fetchSignalTrace", () => {
    const params = {
      runId: "run-1",
      variant: "v1",
      fromMs: 1_700_000_000_000,
      toOpenTimeMs: 1_700_000_297_000,
      contextOverlayRef: "ctx_a",
    };
    const key = buildTraceRequestKey(params);
    const path = buildSignalTraceUrlPath(params);
    expect(path).toContain(`/runs/${encodeURIComponent(params.runId)}/signal-trace`);
    expect(path).toContain(`from=${params.fromMs}`);
    expect(path).toContain(`to_open_time_ms=${params.toOpenTimeMs}`);
    expect(buildTraceRequestKey({ ...params })).toBe(key);
    expect(buildTraceRequestKey({ ...params, contextOverlayRef: null })).not.toBe(key);
  });
});

describe("fetchChartEvents query params", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses to_open_time_ms (exclusive end) on chart-events endpoint", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/chart-events?");
      expect(url).toContain("from=1700000000000");
      expect(url).toContain("to_open_time_ms=1700000297000");
      expect(url).not.toMatch(/[?&]to=/);
      return {
        ok: true,
        json: async () => ({
          times: [],
          component_events: [],
          htf_context: { fast: [], anchor: [], slow: [], meta: {} },
          meta: { variant: "v1", component_ids: {}, setup_params: [], blocker_instances: [] },
          coverage: {
            schema_version: 1,
            from_sec: 0,
            to_sec: 0,
            bar_count: 0,
            requested_from_sec: 0,
            requested_to_sec: 0,
            truncated: false,
            max_bars: 50_000,
          },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchChartEvents({
      runId: "run-1",
      variant: "v1",
      fromMs: 1_700_000_000_000,
      toOpenTimeMs: 1_700_000_297_000,
      contextOverlayRef: "ctx_a",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("context_overlay_ref=ctx_a");
  });

  it("passes AbortSignal to fetchChartEvents", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        times: [],
        component_events: [],
        htf_context: { fast: [], anchor: [], slow: [], meta: {} },
        meta: { variant: "v1", component_ids: {}, setup_params: [], blocker_instances: [] },
        coverage: {
          schema_version: 1,
          from_sec: 0,
          to_sec: 0,
          bar_count: 0,
          requested_from_sec: 0,
          requested_to_sec: 0,
          truncated: false,
          max_bars: 50_000,
        },
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChartEvents({
      runId: "run-1",
      variant: "v1",
      fromMs: 1,
      toOpenTimeMs: 2,
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });

  it("chartEventsRequestKey identifies the same URL resource as fetchChartEvents", () => {
    const params = {
      runId: "run-1",
      variant: "v1",
      fromMs: 1_700_000_000_000,
      toOpenTimeMs: 1_700_000_297_000,
      contextOverlayRef: "ctx_a",
    };
    const key = buildChartEventsRequestKey(params);
    const path = buildChartEventsUrlPath(params);
    expect(path).toContain(`/runs/${encodeURIComponent(params.runId)}/chart-events`);
    expect(path).toContain(`from=${params.fromMs}`);
    expect(path).toContain(`to_open_time_ms=${params.toOpenTimeMs}`);
    expect(buildChartEventsRequestKey({ ...params })).toBe(key);
    expect(buildChartEventsRequestKey({ ...params, contextOverlayRef: null })).not.toBe(key);
    expect(buildChartEventsRequestKey(params)).not.toBe(buildTraceRequestKey(params));
  });

  it("chartEventsFallbackReasonFromError maps ApiError status", async () => {
    const { chartEventsFallbackReasonFromError } = await import("@/features/chart/runtime/chartEventsLoad");
    expect(chartEventsFallbackReasonFromError(new ApiError(404, "not found"))).toBe("endpoint_404");
    expect(chartEventsFallbackReasonFromError(new ApiError(500, "fail"))).toBe("http_error");
    expect(chartEventsFallbackReasonFromError(new Error("parse"))).toBe("parse_error");
  });
});
