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

  it("defaults cutover config to phase 6.3-debug with all domains on old_production", () => {
    expect(chartRuntimeCutoverConfig.cutoverPhase).toBe("6.3-debug");
    for (const domain of CHART_RUNTIME_DOMAINS) {
      expect(chartRuntimeCutoverConfig.domainOwners[domain]).toBe("old_production");
    }
    expect(chartRuntimeCutoverConfig.domainOwners).toEqual(ALL_OLD_PRODUCTION_DOMAIN_OWNERS);
  });

  it("has no runtime_v2_production owner in 6.3-debug", () => {
    expect(hasRuntimeV2ProductionOwner(chartRuntimeCutoverConfig)).toBe(false);
    expect(runtimeV2ProductionDomains(chartRuntimeCutoverConfig)).toEqual([]);
  });

  it("cutoverDebugMeta returns owner, domain, and phase from config", () => {
    const meta = cutoverDebugMeta("market", { barCount: 12 });
    expect(meta).toMatchObject({
      owner: "old_production",
      domain: "market",
      phase: "6.3-debug",
      barCount: 12,
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
      phase: "6.3-debug",
      owners: ALL_OLD_PRODUCTION_DOMAIN_OWNERS,
    });
    expect(Object.keys((row?.last_meta as { owners: Record<string, string> }).owners)).toHaveLength(6);
  });

  it("exports cutover fields through pipeline debug export", async () => {
    const { dbgExport } = await import("@/shared/diagnostics/pipelineDebug");
    expect(dbgExport().debug).toEqual(getCutoverDebugExportFields());
    expect(dbgExport().debug.domainOwners).toEqual(ALL_OLD_PRODUCTION_DOMAIN_OWNERS);
    expect(dbgExport().debug.cutoverPhase).toBe("6.3-debug");
  });

  it("keeps exactly one owner per domain in the config record", () => {
    for (const domain of CHART_RUNTIME_DOMAINS) {
      expect(chartRuntimeCutoverConfig.domainOwners[domain]).toMatch(/^(old_production|runtime_v2_production)$/);
    }
    expect(Object.keys(chartRuntimeCutoverConfig.domainOwners)).toHaveLength(CHART_RUNTIME_DOMAINS.length);
  });
});
