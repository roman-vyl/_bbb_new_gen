import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALL_OLD_PRODUCTION_DOMAIN_OWNERS,
  chartRuntimeCutoverConfig,
} from "./chartRuntimeCutoverConfig";
import {
  CHART_RUNTIME_DOMAINS,
  cutoverDebugMeta,
  getCutoverDebugExportFields,
  hasRuntimeV2ProductionOwner,
  runtimeV2ProductionDomains,
} from "./chartRuntimeCutoverTelemetry";
import type { ChartRuntimeCutoverConfig } from "./runtimeTypes";

describe("Phase 6.3-debug cutover telemetry", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_EMA_PIPELINE_DEBUG", "true");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults cutover config to phase 6.3A with model on runtime_v2_production", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3A");
    expect(chartRuntimeCutoverConfig.domainOwners.model).toBe("runtime_v2_production");
    for (const domain of CHART_RUNTIME_DOMAINS) {
      if (domain === "model") continue;
      expect(chartRuntimeCutoverConfig.domainOwners[domain]).toBe("old_production");
    }
    expect(hasRuntimeV2ProductionOwner(chartRuntimeCutoverConfig)).toBe(true);
    expect(runtimeV2ProductionDomains(chartRuntimeCutoverConfig)).toEqual(["model"]);
  });

  it("has no runtime_v2_production owner outside model in 6.3A", () => {
    const nonModelV2 = CHART_RUNTIME_DOMAINS.filter(
      (domain) =>
        domain !== "model" &&
        chartRuntimeCutoverConfig.domainOwners[domain] === "runtime_v2_production",
    );
    expect(nonModelV2).toEqual([]);
  });

  it("cutoverDebugMeta returns owner, domain, and phase from config", () => {
    const meta = cutoverDebugMeta("market", { barCount: 12 });
    expect(meta).toMatchObject({
      owner: "old_production",
      domain: "market",
      phase: "6.3A",
      barCount: 12,
    });
    const modelMeta = cutoverDebugMeta("model", { seriesKey: "x" });
    expect(modelMeta).toMatchObject({
      owner: "runtime_v2_production",
      domain: "model",
      phase: "6.3A",
    });
  });

  it("simulated 6.3A config transfers only model to runtime_v2_production", () => {
    const simulated6_3A: ChartRuntimeCutoverConfig = {
      cutoverPhase: "6.3A",
      domainOwners: {
        ...ALL_OLD_PRODUCTION_DOMAIN_OWNERS,
        model: "runtime_v2_production",
      },
    };

    expect(hasRuntimeV2ProductionOwner(simulated6_3A)).toBe(true);
    expect(runtimeV2ProductionDomains(simulated6_3A)).toEqual(["model"]);
    expect(cutoverDebugMeta("model", undefined, simulated6_3A)).toMatchObject({
      owner: "runtime_v2_production",
      domain: "model",
      phase: "6.3A",
    });
    expect(cutoverDebugMeta("market", undefined, simulated6_3A)).toMatchObject({
      owner: "old_production",
      domain: "market",
      phase: "6.3A",
    });
  });

  it("emits wb.cutover.domain_owners with all six domains", async () => {
    const { dbgExport, dbgReset } = await import("@/shared/diagnostics/pipelineDebug");
    const { emitCutoverDomainOwnersSnapshot, CUTOVER_DOMAIN_OWNERS_STEP } = await import(
      "./chartRuntimeCutoverTelemetry"
    );
    dbgReset();
    emitCutoverDomainOwnersSnapshot();

    const row = dbgExport().steps.find((entry) => entry.step === CUTOVER_DOMAIN_OWNERS_STEP);
    expect(row).toBeDefined();
    expect(row?.last_meta).toMatchObject({
      phase: "6.3A",
      owners: chartRuntimeCutoverConfig.domainOwners,
    });
    expect(Object.keys((row?.last_meta as { owners: Record<string, string> }).owners)).toHaveLength(6);
  });

  it("exports cutover fields through pipeline debug export", async () => {
    const { dbgExport } = await import("@/shared/diagnostics/pipelineDebug");
    expect(dbgExport().debug).toEqual(getCutoverDebugExportFields());
    expect(dbgExport().debug.domainOwners).toEqual(chartRuntimeCutoverConfig.domainOwners);
    expect(dbgExport().debug.cutoverPhase).toBe("6.3A");
  });

  it("keeps exactly one owner per domain in the config record", () => {
    for (const domain of CHART_RUNTIME_DOMAINS) {
      expect(chartRuntimeCutoverConfig.domainOwners[domain]).toMatch(/^(old_production|runtime_v2_production)$/);
    }
    expect(Object.keys(chartRuntimeCutoverConfig.domainOwners)).toHaveLength(CHART_RUNTIME_DOMAINS.length);
  });
});
