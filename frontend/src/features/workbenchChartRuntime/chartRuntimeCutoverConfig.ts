import type {
  ChartRuntimeCutoverConfig,
  ChartRuntimeDomainOwners,
  ChartRuntimeOwner,
} from "./runtimeTypes";

/** Pre-cutover baseline: every mutable chart domain stays on the old production pipeline. */
export const ALL_OLD_PRODUCTION_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "old_production",
  render_window: "old_production",
  viewport: "old_production",
  trace: "old_production",
  aux_overlay: "old_production",
  market: "old_production",
};

/** Phase 6.3A: model domain only on runtime v2; all other domains remain old. */
export const PHASE_63A_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "runtime_v2_production",
  render_window: "old_production",
  viewport: "old_production",
  trace: "old_production",
  aux_overlay: "old_production",
  market: "old_production",
};

/**
 * Single source of truth for staged owner-domain cutover.
 * Phase 6.3A transfers final chart model/adapter only.
 */
export const chartRuntimeCutoverConfig: ChartRuntimeCutoverConfig = {
  cutoverPhase: "6.3A",
  domainOwners: PHASE_63A_DOMAIN_OWNERS,
};

export function domainOwnerFor(
  domain: keyof ChartRuntimeDomainOwners,
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): ChartRuntimeOwner {
  return config.domainOwners[domain];
}

export function isModelDomainRuntimeV2Production(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return config.domainOwners.model === "runtime_v2_production";
}
