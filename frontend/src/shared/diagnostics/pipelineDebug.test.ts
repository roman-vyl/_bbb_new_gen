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
    const rows = dbgExport().steps;
    const slice = rows.find((r) => r.step === "wb.chart_window_slice");
    const pan = rows.find((r) => r.step === "wb.pan.no_shift");
    expect(slice?.last_meta).toEqual({ barCount: 42 });
    expect(slice?.avg_ms).toBeGreaterThanOrEqual(0);
    expect(pan?.last_meta).toEqual({ shifted: false });
  });

  it("includes cutover debug fields in dbgExport", async () => {
    const { dbgExport } = await import("./pipelineDebug");
    expect(dbgExport().debug.cutoverPhase).toBe("6.3F");
    expect(dbgExport().debug.domainOwners.model).toBe("runtime_v2_production");
  });

  it("is no-op when debug flag is off", async () => {
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "false");
    vi.resetModules();
    const metaFactory = vi.fn(() => ({ expensive: true }));
    const { dbgTimedSync, dbgExport } = await import("./pipelineDebug");
    dbgTimedSync("x", () => "ok", metaFactory);
    expect(metaFactory).not.toHaveBeenCalled();
    expect(dbgExport().steps).toEqual([]);
  });

  it("uses shift_applied and shift_noop instead of legacy shift step id", async () => {
    const { PIPELINE_DEBUG_STEPS, dbgMark, dbgExport, dbgReset } = await import("./pipelineDebug");
    dbgReset();
    expect(PIPELINE_DEBUG_STEPS.renderWindow).not.toHaveProperty("shift");
    expect(PIPELINE_DEBUG_STEPS.renderWindow.shiftApplied).toBe("wb.render_window.shift_applied");
    expect(PIPELINE_DEBUG_STEPS.renderWindow.shiftNoop).toBe("wb.render_window.shift_noop");
    dbgMark(PIPELINE_DEBUG_STEPS.renderWindow.shiftApplied);
    dbgMark(PIPELINE_DEBUG_STEPS.renderWindow.shiftNoop);
    const steps = dbgExport().steps.map((row) => row.step);
    expect(steps).toContain("wb.render_window.shift_applied");
    expect(steps).toContain("wb.render_window.shift_noop");
    expect(steps).not.toContain("wb.render_window.shift");
  });
});
