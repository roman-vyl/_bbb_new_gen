import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pipelineDebug", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "true");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dbgExport includes last_meta from timed and mark steps", async () => {
    const { dbgTimedSync, dbgMark, dbgExport, dbgReset } = await import("./pipelineDebug");
    dbgReset();
    dbgTimedSync("wb.chart_window_slice", () => 1, () => ({ barCount: 42 }));
    dbgMark("wb.pan.no_shift", { shifted: false });
    const rows = dbgExport();
    const slice = rows.find((r) => r.step === "wb.chart_window_slice");
    const pan = rows.find((r) => r.step === "wb.pan.no_shift");
    expect(slice?.last_meta).toEqual({ barCount: 42 });
    expect(slice?.avg_ms).toBeGreaterThanOrEqual(0);
    expect(pan?.last_meta).toEqual({ shifted: false });
  });

  it("is no-op when debug flag is off", async () => {
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "false");
    vi.resetModules();
    const metaFactory = vi.fn(() => ({ expensive: true }));
    const { dbgTimedSync, dbgExport } = await import("./pipelineDebug");
    dbgTimedSync("x", () => "ok", metaFactory);
    expect(metaFactory).not.toHaveBeenCalled();
    expect(dbgExport()).toEqual([]);
  });
});
