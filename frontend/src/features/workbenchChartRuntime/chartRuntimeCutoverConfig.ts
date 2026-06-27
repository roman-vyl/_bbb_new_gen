import type {
  ChartRuntimeCutoverConfig,
  ChartRuntimeDomainOwners,
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

/**
 * Single source of truth for staged owner-domain cutover.
 * Phase 6.3-debug wires telemetry only; each later slice updates this config.
 */
export const chartRuntimeCutoverConfig: ChartRuntimeCutoverConfig = {
  cutoverPhase: "6.3-debug",
  domainOwners: ALL_OLD_PRODUCTION_DOMAIN_OWNERS,
};
