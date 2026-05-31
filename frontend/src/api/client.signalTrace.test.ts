import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSignalTrace } from "@/api/client";

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
});
