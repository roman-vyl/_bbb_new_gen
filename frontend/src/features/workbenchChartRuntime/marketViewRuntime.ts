export type MarketViewRuntimeBoundary = {
  implemented: false;
  marketIdentity: string | null;
  expectedMarketIdentity: string | null;
  error: string | null;
};

export function createMarketViewRuntimeBoundary(): MarketViewRuntimeBoundary {
  return {
    implemented: false,
    marketIdentity: null,
    expectedMarketIdentity: null,
    error: null,
  };
}
