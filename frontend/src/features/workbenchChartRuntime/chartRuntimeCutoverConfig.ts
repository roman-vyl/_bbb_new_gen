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

/** Phase 6.3B: model + render-window on runtime v2; market/viewport/trace/aux remain old. */
export const PHASE_63B_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "runtime_v2_production",
  render_window: "runtime_v2_production",
  viewport: "old_production",
  trace: "old_production",
  aux_overlay: "old_production",
  market: "old_production",
};

/** Phase 6.3C: model + render-window + viewport on runtime v2; trace/aux/market remain old. */
export const PHASE_63C_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "runtime_v2_production",
  render_window: "runtime_v2_production",
  viewport: "runtime_v2_production",
  trace: "old_production",
  aux_overlay: "old_production",
  market: "old_production",
};

/** Phase 6.3D: model/render_window/viewport/trace on runtime v2; aux/market remain old. */
export const PHASE_63D_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "runtime_v2_production",
  render_window: "runtime_v2_production",
  viewport: "runtime_v2_production",
  trace: "runtime_v2_production",
  aux_overlay: "old_production",
  market: "old_production",
};

/** Phase 6.3E: all domains except market on runtime v2; market remains old. */
export const PHASE_63E_DOMAIN_OWNERS: ChartRuntimeDomainOwners = {
  model: "runtime_v2_production",
  render_window: "runtime_v2_production",
  viewport: "runtime_v2_production",
  trace: "runtime_v2_production",
  aux_overlay: "runtime_v2_production",
  market: "old_production",
};

/**
 * Single source of truth for staged owner-domain cutover.
 * Phase 6.3E transfers aux/HTF overlay display; market remains old passthrough.
 */
export const chartRuntimeCutoverConfig: ChartRuntimeCutoverConfig = {
  cutoverPhase: "6.3E",
  domainOwners: PHASE_63E_DOMAIN_OWNERS,
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

export function isRenderWindowDomainRuntimeV2Production(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return config.domainOwners.render_window === "runtime_v2_production";
}

export function isViewportDomainRuntimeV2Production(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return config.domainOwners.viewport === "runtime_v2_production";
}

export function isTraceDomainRuntimeV2Production(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return config.domainOwners.trace === "runtime_v2_production";
}

export function isAuxOverlayDomainRuntimeV2Production(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return config.domainOwners.aux_overlay === "runtime_v2_production";
}
