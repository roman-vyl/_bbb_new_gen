export type RuntimeMarketWindow = {
  fromMs: number;
  toMs: number;
  toOpenTimeMs: number;
};

export type MarketWindowRuntimeBoundary = {
  implemented: false;
  focusWindow: RuntimeMarketWindow | null;
  coverageWindow: RuntimeMarketWindow | null;
  focusWindowKey: string | null;
  coverageWindowKey: string | null;
};

export function createMarketWindowRuntimeBoundary(): MarketWindowRuntimeBoundary {
  return {
    implemented: false,
    focusWindow: null,
    coverageWindow: null,
    focusWindowKey: null,
    coverageWindowKey: null,
  };
}
