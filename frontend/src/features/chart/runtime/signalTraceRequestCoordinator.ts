/**
 * Durable network fetch authorization for GET .../signal-trace.
 * Owns traceRequestKey and in-flight / merged / failed ledgers only — no merge, React, or display.
 */

export type TraceFetchParams = {
  runId: string;
  variant: string;
  fromMs: number;
  toOpenTimeMs: number;
  contextOverlayRef?: string | null;
};

export type TraceMergedSource = "network" | "session_restore";

export type CoordinatorSkipReason =
  | "cache_hit"
  | "in_flight"
  | "already_merged"
  | "failed_same_key"
  | "superseded";

export type CoordinatorDecision =
  | { action: "fetch"; key: TraceRequestKey; generation: number }
  | { action: "skip"; key: TraceRequestKey; reason: CoordinatorSkipReason };

export type TraceRequestKey = string;

const KEY_SEP = "\u001f";

/** Deterministic key from exact BFF query params (matches api/client fetchSignalTrace). */
export function buildTraceRequestKey(params: TraceFetchParams): TraceRequestKey {
  const overlayRef = params.contextOverlayRef ?? "";
  return [params.runId, params.variant, String(params.fromMs), String(params.toOpenTimeMs), overlayRef].join(
    KEY_SEP,
  );
}

/** Same query string shape as `fetchSignalTrace` in api/client.ts (for tests). */
export function buildSignalTraceUrlPath(params: TraceFetchParams): string {
  const qs = new URLSearchParams({
    variant: params.variant,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  if (params.contextOverlayRef) {
    qs.set("context_overlay_ref", params.contextOverlayRef);
  }
  return `/api/research/runs/${encodeURIComponent(params.runId)}/signal-trace?${qs.toString()}`;
}

const CHART_EVENTS_KEY_PREFIX = "chart-events";

/** Display fetch key when chart-events API is enabled (distinct from dense trace key). */
export function buildChartEventsRequestKey(params: TraceFetchParams): TraceRequestKey {
  const overlayRef = params.contextOverlayRef ?? "";
  return [
    CHART_EVENTS_KEY_PREFIX,
    params.runId,
    params.variant,
    String(params.fromMs),
    String(params.toOpenTimeMs),
    overlayRef,
  ].join(KEY_SEP);
}

/** Same query string shape as `fetchChartEvents` in api/client.ts (for tests). */
export function buildChartEventsUrlPath(params: TraceFetchParams): string {
  const qs = new URLSearchParams({
    variant: params.variant,
    from: String(params.fromMs),
    to_open_time_ms: String(params.toOpenTimeMs),
  });
  if (params.contextOverlayRef) {
    qs.set("context_overlay_ref", params.contextOverlayRef);
  }
  return `/api/research/runs/${encodeURIComponent(params.runId)}/chart-events?${qs.toString()}`;
}

export type SignalTraceRequestCoordinator = {
  evaluate(input: {
    key: TraceRequestKey;
    generation: number;
    displayCacheCoversWindow: boolean;
  }): CoordinatorDecision;
  markInFlight(key: TraceRequestKey, generation: number): void;
  clearInFlight(key: TraceRequestKey, generation: number): void;
  markMerged(key: TraceRequestKey, _source: TraceMergedSource): void;
  markFailed(key: TraceRequestKey): void;
  isResponseCurrent(key: TraceRequestKey, generation: number): boolean;
  reset(): void;
  ledgerSnapshotForKey(key: TraceRequestKey): {
    inFlightKeysCount: number;
    mergedKeysHit: boolean;
    failedKeysHit: boolean;
    inFlightKey: TraceRequestKey | null;
  };
};

const MAX_MERGED_KEYS = 64;

export function createSignalTraceRequestCoordinator(): SignalTraceRequestCoordinator {
  const inFlightKeys = new Map<TraceRequestKey, number>();
  const mergedKeys = new Set<TraceRequestKey>();
  const mergedInsertionOrder: TraceRequestKey[] = [];
  const failedKeys = new Map<TraceRequestKey, { at: number }>();

  function touchMerged(key: TraceRequestKey): void {
    if (mergedKeys.has(key)) {
      const idx = mergedInsertionOrder.indexOf(key);
      if (idx >= 0) {
        mergedInsertionOrder.splice(idx, 1);
      }
    } else {
      mergedKeys.add(key);
    }
    mergedInsertionOrder.push(key);
    while (mergedInsertionOrder.length > MAX_MERGED_KEYS) {
      const evicted = mergedInsertionOrder.shift();
      if (evicted !== undefined) {
        mergedKeys.delete(evicted);
      }
    }
  }

  return {
    evaluate(input): CoordinatorDecision {
      const { key, generation, displayCacheCoversWindow } = input;

      if (failedKeys.has(key)) {
        return { action: "skip", key, reason: "failed_same_key" };
      }

      if (mergedKeys.has(key)) {
        return {
          action: "skip",
          key,
          reason: displayCacheCoversWindow ? "cache_hit" : "already_merged",
        };
      }

      if (inFlightKeys.has(key)) {
        return { action: "skip", key, reason: "in_flight" };
      }

      return { action: "fetch", key, generation };
    },

    markInFlight(key, generation) {
      inFlightKeys.set(key, generation);
    },

    clearInFlight(key, generation) {
      if (inFlightKeys.get(key) === generation) {
        inFlightKeys.delete(key);
      }
    },

    markMerged(key) {
      failedKeys.delete(key);
      touchMerged(key);
    },

    markFailed(key) {
      failedKeys.set(key, { at: Date.now() });
      inFlightKeys.delete(key);
    },

    isResponseCurrent(key, generation) {
      return inFlightKeys.get(key) === generation;
    },

    reset() {
      inFlightKeys.clear();
      mergedKeys.clear();
      mergedInsertionOrder.length = 0;
      failedKeys.clear();
    },

    ledgerSnapshotForKey(key) {
      const inFlightKey = inFlightKeys.size === 1 ? (inFlightKeys.keys().next().value ?? null) : null;
      return {
        inFlightKeysCount: inFlightKeys.size,
        mergedKeysHit: mergedKeys.has(key),
        failedKeysHit: failedKeys.has(key),
        inFlightKey,
      };
    },
  };
}
