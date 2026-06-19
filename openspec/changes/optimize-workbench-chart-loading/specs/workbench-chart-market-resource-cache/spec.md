## ADDED Requirements

### Requirement: Candles and overlays are cached as separate resources
Workbench Chart SHALL maintain frontend market resource identity separately for candles and overlays. Candle cache identity MUST be based on symbol, timeframe, requested range, and reload identity, and MUST NOT include variant or anchor-stack periods.

Overlay cache identity MUST include symbol, timeframe, source, period or overlay role, requested range, and reload identity.

#### Scenario: Variant switch reuses identical candles
- **GIVEN** two variants in the same run share symbol, chart timeframe, and report data range
- **AND** candles for that symbol/timeframe/range are already cached
- **WHEN** the user switches from the first variant to the second variant
- **THEN** Workbench reuses cached candles
- **AND** Workbench does not start another candle fetch solely because the variant changed

#### Scenario: Variant switch refreshes changed overlays
- **GIVEN** two variants share candle identity but use different anchor-stack periods
- **WHEN** the user switches variants
- **THEN** Workbench resolves overlay cache keys for the new periods
- **AND** Workbench only loads or recomputes overlays whose cache keys are missing

### Requirement: Chart bundle responses can seed split resource caches
While `/api/market/chart-bundle` remains in use, Workbench MAY use a chart-bundle response as a source payload but MUST store its candles and EMA overlays into separate resource cache layers.

#### Scenario: Existing chart-bundle seeds split caches
- **GIVEN** Workbench receives a chart-bundle containing candles and anchor EMA overlays
- **WHEN** the response is accepted for the current run/variant
- **THEN** candles are stored under candle resource identity
- **AND** each overlay is stored under overlay resource identity
- **AND** `RunMarketView` resolves the selected variant to the required candle and overlay resources
