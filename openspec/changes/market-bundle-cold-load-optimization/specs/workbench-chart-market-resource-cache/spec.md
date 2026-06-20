## MODIFIED Requirements

### Requirement: Candles and overlays are cached as separate resources

Workbench Chart SHALL maintain frontend market resource identity separately for candles and overlays. Candle cache identity MUST be based on symbol, timeframe, and reload identity, and MUST NOT include variant or anchor-stack periods.

Candle and overlay spans MUST support incremental window merges. Cache identity MUST NOT require the full report `data_range` as the fetch or storage unit.

Overlay cache identity MUST include symbol, timeframe, source, period or overlay role, and reload identity.

#### Scenario: Variant switch reuses identical candles

- **GIVEN** two variants in the same run share symbol, chart timeframe, and overlapping cached candle span
- **AND** candles for the target display window are already covered in cache
- **WHEN** the user switches from the first variant to the second variant
- **THEN** Workbench reuses cached candles for the covered span
- **AND** Workbench does not start another candle fetch solely because the variant changed

#### Scenario: Variant switch refreshes changed overlays

- **GIVEN** two variants share candle span coverage but use different anchor-stack periods
- **WHEN** the user switches variants
- **THEN** Workbench resolves overlay cache keys for the new periods
- **AND** Workbench only loads overlays whose cache keys are missing for the current display window
- **AND** candle span reuse is preserved when symbol/timeframe/reload identity is unchanged

## ADDED Requirements

### Requirement: Market resource cache supports span coverage queries

`marketResourceCache` MUST expose `coversRange(fromMs, toMs)` and `missingRange(fromMs, toMs)` for candles and per-overlay spans within a run reload identity.

Merged window chunks MUST form a contiguous span without duplicate bar times.

#### Scenario: Partial span reports missing range

- **GIVEN** candles cached for `[1000, 5000)` ms
- **WHEN** `missingRange(0, 10000)` is evaluated
- **THEN** result is `{ fromMs: 0, toMs: 1000 }` merged with any gap after 5000 if applicable
- **AND** `coversRange(2000, 4000)` is true

#### Scenario: Merged chunks dedupe by bar time

- **GIVEN** two chart-window responses with overlapping display bounds
- **WHEN** both are seeded into the cache
- **THEN** the stored candle array has no duplicate `time` values
- **AND** bars are sorted ascending by `time`

### Requirement: Chart-window responses seed split resource caches

Workbench MUST use `/api/market/chart-window` responses as the primary cold-load and incremental network source. Each accepted response MUST store candles and EMA overlays into separate resource cache layers via span merge.

#### Scenario: Chart-window seeds split caches

- **GIVEN** Workbench receives a `ChartMarketWindowBundle` for display bounds `[X, Y)`
- **WHEN** the response is accepted for the current run/variant
- **THEN** candles are merged into the candle span for symbol/timeframe/reload identity
- **AND** each overlay is merged into its overlay span identity
- **AND** `RunMarketView` resolves the selected variant to the required candle and overlay resources for the current display window

## REMOVED Requirements

### Requirement: Chart bundle responses can seed split resource caches

**Reason**: Replaced by windowed chart-window seeding as the primary network source; full-range chart-bundle is no longer the cold-load path.

**Migration**: Use `seedChartWindowBundle` (or equivalent merge API) for `/api/market/chart-window` responses. Full-range `/api/market/chart-bundle` may remain as legacy fallback only.
