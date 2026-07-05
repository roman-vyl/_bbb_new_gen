import { dbgMark, dbgTimedSync } from "@/shared/diagnostics/pipelineDebug";

import { chartRuntimeCutoverConfig } from "./chartRuntimeCutoverConfig";
import type {
  ChartRuntimeCutoverConfig,
  ChartRuntimeDomain,
  ChartRuntimeDomainOwners,
  ChartRuntimeCutoverPhase,
  ChartRuntimeOwner,
} from "./runtimeTypes";

export const CUTOVER_DOMAIN_OWNERS_STEP = "wb.cutover.domain_owners";

export const CHART_RUNTIME_DOMAINS: readonly ChartRuntimeDomain[] = [
  "model",
  "render_window",
  "viewport",
  "trace",
  "aux_overlay",
  "market",
];

export function cutoverDebugMeta(
  domain: ChartRuntimeDomain,
  extra?: Record<string, unknown>,
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): Record<string, unknown> {
  return {
    owner: config.domainOwners[domain],
    domain,
    phase: config.cutoverPhase,
    ...extra,
  };
}

export function dbgMarkCutover(
  step: string,
  domain: ChartRuntimeDomain,
  meta?: Record<string, unknown>,
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): void {
  dbgMark(step, cutoverDebugMeta(domain, meta, config));
}

export function dbgTimedSyncCutover<T>(
  step: string,
  domain: ChartRuntimeDomain,
  fn: () => T,
  meta?: () => Record<string, unknown>,
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): T {
  return dbgTimedSync(step, fn, () => cutoverDebugMeta(domain, meta?.(), config));
}

export function emitCutoverDomainOwnersSnapshot(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): void {
  dbgMark(CUTOVER_DOMAIN_OWNERS_STEP, {
    phase: config.cutoverPhase,
    owners: { ...config.domainOwners },
  });
}

export function getCutoverDebugExportFields(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): {
  cutoverPhase: ChartRuntimeCutoverPhase;
  domainOwners: ChartRuntimeDomainOwners;
} {
  return {
    cutoverPhase: config.cutoverPhase,
    domainOwners: { ...config.domainOwners },
  };
}

export function domainOwner(
  domain: ChartRuntimeDomain,
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): ChartRuntimeOwner {
  return config.domainOwners[domain];
}

export function hasRuntimeV2ProductionOwner(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): boolean {
  return CHART_RUNTIME_DOMAINS.some(
    (domain) => config.domainOwners[domain] === "runtime_v2_production",
  );
}

export function runtimeV2ProductionDomains(
  config: ChartRuntimeCutoverConfig = chartRuntimeCutoverConfig,
): ChartRuntimeDomain[] {
  return CHART_RUNTIME_DOMAINS.filter(
    (domain) => config.domainOwners[domain] === "runtime_v2_production",
  );
}
