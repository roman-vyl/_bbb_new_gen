# workbench-chart-market-resource-cache Specification

## Purpose

Split frontend market resource identity so candles are reusable across variants with the same symbol/timeframe while overlays refresh independently. Workbench cold load uses `/api/market/candles-window` and `/api/market/ema-window`; `/api/market/chart-bundle` is legacy only.
## Requirements
### Requirement: Candles and overlays are cached as separate resources

Workbench Chart SHALL maintain frontend market resource identity separately for candles and overlays. Candle cache identity MUST be based on symbol, timeframe, and reload identity, and MUST NOT include variant or anchor-stack periods.

Candle and overlay storage MUST support incremental window chunks loaded via **independent network resources** (`candles-window` and `ema-window`). Cache identity MUST NOT require the full report `data_range` as the fetch or storage unit.

Overlay cache identity MUST include symbol, timeframe, source, period or overlay role, and reload identity.

#### Scenario: Variant switch reuses identical candles

- **GIVEN** two variants in the same run share symbol, chart timeframe, and a cached candle interval covering the target display window
- **WHEN** the user switches from the first variant to the second variant
- **THEN** Workbench reuses cached candles for the covered window
- **AND** Workbench does not start another candle fetch solely because the variant changed

#### Scenario: Variant switch refreshes changed overlays

- **GIVEN** two variants share candle interval coverage but use different anchor-stack periods
- **WHEN** the user switches variants
- **THEN** Workbench resolves overlay cache keys for the new periods
- **AND** Workbench fetches only missing `ema-window` intervals per changed period
- **AND** candle interval reuse is preserved when symbol/timeframe/reload identity is unchanged

### Requirement: Market resource cache uses interval/chunk storage with union coverage

`marketResourceCache` MUST store candles and overlays as a **list of intervals (chunks)** per resource identity, not as a single contiguous span.

Each chunk MUST record `{ fromMs, toMs, data }` where `data` is the sorted bar or overlay point array for that interval.

`coversRange(fromMs, toMs)` MUST return `true` only when the **union** of stored intervals fully covers `[fromMs, toMs)`.

`missingRange(fromMs, toMs)` MUST return the first uncovered sub-interval within `[fromMs, toMs)`.

Overlapping window responses for the same resource MUST merge into one interval (dedupe by `time`). Non-overlapping windows MUST remain separate intervals.

#### Scenario: Distant trade creates second interval without loading gap

- **GIVEN** candle interval A cached for the report tail (2026)
- **AND** user navigates to a distant trade in 2017
- **WHEN** `candles-window` fetch for trade bounds completes
- **THEN** cache holds two candle intervals A and B with a gap between them
- **AND** `coversRange` is true for each interval's bounds independently
- **AND** the gap is not covered and not fetched unless navigated into

#### Scenario: Candles and overlays have independent interval sets

- **GIVEN** candle interval covers `[X, Y)`
- **AND** overlay `EMA(50)` interval covers `[X, Y)` but `EMA(500)` does not
- **WHEN** readiness is evaluated
- **THEN** `marketCandlesReady` is true for `[X, Y)`
- **AND** `marketOverlaysReady` is false until `EMA(500)` interval is seeded

### Requirement: Split window endpoints seed respective cache layers

Workbench MUST use `/api/market/candles-window` and `/api/market/ema-window` as primary network sources — not monolithic `chart-bundle` or bundled `chart-window`.

- `candles-window` responses MUST seed candle chunks only
- `ema-window` responses MUST seed one overlay chunk per period

#### Scenario: Candles-window does not seed overlays

- **GIVEN** a `CandlesWindowBundle` is accepted
- **WHEN** merge completes
- **THEN** only candle chunk storage changes
- **AND** overlay chunk count is unchanged

