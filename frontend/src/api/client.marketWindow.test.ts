import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCandlesWindow, fetchEmaWindow } from "@/api/client";

describe("fetchCandlesWindow / fetchEmaWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses to_open_time_ms for candles-window", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/api/market/candles-window?");
      expect(url).toContain("from=1700000000000");
      expect(url).toContain("to_open_time_ms=1700000297000");
      expect(url).not.toMatch(/[?&]to=/);
      return {
        ok: true,
        json: async () => ({
          candles: [],
          coverage: {
            requested_from_ms: 1_700_000_000_000,
            requested_to_ms: 1_700_000_300_000,
            actual_from_ms: 1_700_000_000_000,
            actual_to_ms: 1_700_000_300_000,
            truncated: false,
          },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCandlesWindow({
      symbol: "BTCUSDT",
      timeframe: "5m",
      fromMs: 1_700_000_000_000,
      toOpenTimeMs: 1_700_000_297_000,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("passes period and origin_policy for ema-window", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/api/market/ema-window?");
      expect(url).toContain("period=200");
      expect(url).toContain("origin_policy=canonical");
      return {
        ok: true,
        json: async () => ({
          points: [],
          coverage: {
            requested_from_ms: 1,
            requested_to_ms: 2,
            actual_from_ms: 1,
            actual_to_ms: 2,
            calculation_origin_ms: 1,
            coverage_to_ms: 2,
            cache_hit: false,
            truncated: false,
          },
        }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEmaWindow({
      symbol: "BTCUSDT",
      timeframe: "5m",
      period: 200,
      fromMs: 1,
      toOpenTimeMs: 2,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("passes AbortSignal to fetchEmaWindow", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        points: [],
        coverage: {
          requested_from_ms: 1,
          requested_to_ms: 2,
          actual_from_ms: 1,
          actual_to_ms: 2,
          calculation_origin_ms: 1,
          coverage_to_ms: 2,
          cache_hit: false,
          truncated: false,
        },
      }),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEmaWindow({
      symbol: "BTCUSDT",
      timeframe: "5m",
      period: 200,
      fromMs: 1,
      toOpenTimeMs: 2,
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  });
});
