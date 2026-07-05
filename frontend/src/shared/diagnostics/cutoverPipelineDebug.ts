import type { ChartRuntimeDomain } from "@/features/workbenchChartRuntime/runtimeTypes";
import { isModelDomainRuntimeV2Production } from "@/features/workbenchChartRuntime/chartRuntimeCutoverConfig";
import { cutoverDebugMeta } from "@/features/workbenchChartRuntime/chartRuntimeCutoverTelemetry";
import { dbgMark, dbgTimedSync, PIPELINE_DEBUG_STEPS } from "./pipelineDebug";

export { dbgMark, dbgTimedSync, PIPELINE_DEBUG_STEPS };

export function dbgMarkCutoverDomain(
  step: string,
  domain: ChartRuntimeDomain,
  meta?: Record<string, unknown>,
): void {
  dbgMark(step, cutoverDebugMeta(domain, meta));
}

export function dbgTimedSyncCutoverDomain<T>(
  step: string,
  domain: ChartRuntimeDomain,
  fn: () => T,
  meta?: () => Record<string, unknown>,
): T {
  return dbgTimedSync(step, fn, () => cutoverDebugMeta(domain, meta?.()));
}

/** Chart model-domain marks use runtime_v2 owner when Phase 6.3A+ model cutover is active. */
export function dbgTimedSyncChartModel<T>(
  step: string,
  fn: () => T,
  meta?: () => Record<string, unknown>,
): T {
  const domain: ChartRuntimeDomain = "model";
  if (isModelDomainRuntimeV2Production()) {
    return dbgTimedSyncCutoverDomain(step, domain, fn, meta);
  }
  return dbgTimedSync(step, fn, meta);
}
