import type { SignalTraceBundle } from "@/api/types";

/** Matches display cache chunk cap (`MAX_CHUNKS_PER_KEY`). */
export const MAX_SESSION_TRACE_BUNDLES_PER_KEY = 10;

export type SessionCacheIdentity = string;

export function buildSessionCacheIdentity(
  runId: string,
  variant: string,
  contextOverlayRef: string | null | undefined,
  reloadToken: number,
  marketCacheKey: string | null,
): SessionCacheIdentity {
  return `${runId}:${variant}:${contextOverlayRef ?? ""}:${reloadToken}:${marketCacheKey ?? ""}`;
}

export type SignalTraceBundleSessionCache = {
  reset(identity: SessionCacheIdentity): void;
  has(windowKey: string): boolean;
  get(windowKey: string): SignalTraceBundle | null;
  set(windowKey: string, bundle: SignalTraceBundle): void;
  entryCount(): number;
};

export function createSignalTraceBundleSessionCache(): SignalTraceBundleSessionCache {
  let identity: SessionCacheIdentity = "";
  const insertionOrder: string[] = [];
  const bundles = new Map<string, SignalTraceBundle>();

  function evictOldestIfNeeded(): void {
    while (insertionOrder.length > MAX_SESSION_TRACE_BUNDLES_PER_KEY) {
      const evictedKey = insertionOrder.shift();
      if (evictedKey !== undefined) {
        bundles.delete(evictedKey);
      }
    }
  }

  return {
    reset(nextIdentity: SessionCacheIdentity) {
      identity = nextIdentity;
      insertionOrder.length = 0;
      bundles.clear();
    },

    has(windowKey: string) {
      return bundles.has(windowKey);
    },

    get(windowKey: string) {
      return bundles.get(windowKey) ?? null;
    },

    set(windowKey: string, bundle: SignalTraceBundle) {
      if (identity === "") {
        return;
      }
      if (bundles.has(windowKey)) {
        const existingIndex = insertionOrder.indexOf(windowKey);
        if (existingIndex >= 0) {
          insertionOrder.splice(existingIndex, 1);
        }
      }
      bundles.set(windowKey, bundle);
      insertionOrder.push(windowKey);
      evictOldestIfNeeded();
    },

    entryCount() {
      return bundles.size;
    },
  };
}
