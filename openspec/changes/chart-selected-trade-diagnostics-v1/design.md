## Context

- **Chart today**: `ChartPanel.tsx` renders OHLC via Lightweight Charts, anchor-stack EMA overlays from BFF `chartEmaOverlays`, and trade markers via `chartMarkers.ts` (`buildTradeMarkers`). Markers use bar-time + `aboveBar`/`belowBar` for entry/exit—not `entry_price`/`exit_price`.
- **Selection**: `WorkbenchContext` exposes `selectedTradeId`; `findTradeById(selectedVariant.trade_records, …)` resolves the trade; chart view centers on `entry_time_ms` (`around-trade` mode). `ChartTradeFocusNav` allows prev/next trade.
- **Reports parity**: `ReportsPanel` `TradeDetail` already lists v4 diagnostics fields; this change mirrors that data on Chart without duplicating aggregate breakdowns.
- **Exit policy source**: `selectedVariant.strategy_spec.trade_management.exit_policy` — `always_on.exits[]` and `profiles.{aligned,countertrend,neutral}.exits[]` (see `composerDraft.ts` fixture shape). Trade row carries winning attribution: `exit_instance_id`, `exit_component_id`, `exit_kind`, `active_exit_profile`, `exit_group`, `exit_profile`.
- **Constraints**: Frontend-only; no indicator computation in browser (anchor EMA comes from BFF). Exit-component EMA overlays require either (a) extending BFF overlay payload in a follow-up, or (b) reusing periods already present in `chartEmaOverlays` / matching `anchor_stack` only in v1.

## Goals / Non-Goals

**Goals:**

- Price-accurate entry/exit visualization for the selected trade.
- In-chart diagnostics panel with full closed-trade v4 fields when present.
- Active exit components list derived from `strategy_spec` + trade attribution, with closing component highlighted.
- Exit EMA **availability/info** per rule (anchor-stack covered vs unavailable); no new series rendering in v1.
- Clear v1 stance on ATR bands: config only, no guessed levels.

**Non-Goals:**

- Optimizer, Composer editing, research/backtest changes, Data Engine, new API fields.
- Drawing ATR stop/take price lines without exact levels in JSON.
- Recomputing EMA/ATR in the browser from candles.

## Decisions

### 1. Price lines via Lightweight Charts `createPriceLine`

Use the candlestick series API `createPriceLine` / `removePriceLine` for `entry_price` and `exit_price` when `selectedTrade` is set and prices are non-null.

- **Labels**: `title` on price line — e.g. `Entry #12` (long: line below price scale label on right; use `axisLabelVisible: true`). Exit: `Exit #12 · stop_loss` using `exit_kind` or abbreviated `exit_reason` class.
- **Colors**: Entry green/red by direction; exit amber when selected (match highlighted marker `#fbbf24`) or exit-kind palette from `chartMarkers.ts`.
- **Lifecycle**: Dedicated `useEffect` keyed on `[selectedTrade, chart series ref]`; remove all trade price lines when `selectedTradeId === null` or trade changes.
- **Alternative considered**: Separate `LineSeries` spanning two points — rejected; price lines are the idiomatic LC pattern for horizontal levels.

### 2. Diagnostics UI placement: chart sidebar column

Extend `chart-panel__body` layout: keep canvas + `SignalTimelineLanes` + `ChartTradeFocusNav` in `chart-panel__main`; add `ChartTradeDiagnostics` beside or below `ChartBarInspector` (right column), visible when `selectedTradeId !== null`.

**Stale selection**: When `selectedTradeId` is set but `findTradeById` returns undefined (variant/run switch), show neutral empty state in the panel (reuse or mirror `chartTradeFocusWarning` from `WorkbenchContext`), draw **no** price lines, and do not throw.

- Reuse `TradeDetail`-like field list from Reports (shared presenter module `tradeDiagnosticsFields.ts` to avoid drift).
- v3 trades: show core overlay fields; v4-only keys show em dash + optional hint “schema v4 fields unavailable”.
- **Alternative**: Floating tooltip on marker click — rejected for v1; too easy to conflate with bar inspector.

### 3. Exit policy resolution — pure parser module

New `exitPolicyForTrade.ts` (under `features/chart/`):

```ts
type ExitComponentRow = {
  group: "always_on" | "profile";
  profile: ExitProfileLabel | null;
  component_id: string;
  instance_id: string;
  exit_kind: string | null; // resolved per priority below
  parameters: Record<string, string | number>; // normalized display
  isClosing: boolean;
};

function listActiveExitComponents(
  exitPolicy: JsonObject,
  activeExitProfile: ExitProfileLabel | undefined,
  closingInstanceId: string | null | undefined,
): ExitComponentRow[]
```

- Flatten `always_on.exits` with `group: always_on`, `profile: null`.
- Append `profiles[activeExitProfile].exits` when profile defined; if `active_exit_profile` missing, show always_on only + warning in panel.
- Set `isClosing` when `instance_id === trade.exit_instance_id`.
- **Parameters display** (read from rule object, no computation):
  - ATR: `distance.timeframe`, `distance.period`, `distance.multiplier`
  - EMA exits: `ema`, `fast_ema`, `slow_ema`, `confirm_bars` as present on rule
- **`exit_kind` resolution priority** (do not guess from `component_id` when explicit fields exist):
  1. `rule.exit_kind` on the exit policy rule object
  2. `trade.exit_kind` — **only** for the closing row (`isClosing === true`)
  3. Known `component_id` mapping table (small static map for catalog ids without `exit_kind`)
  4. `—` (em dash)

### 4. Exit-component EMA — availability/info only in v1

**Decision**: v1 does **not** implement interactive toggles or new `LineSeries` for exit EMA periods. Render **availability rows** in the active exit components section (or a sub-list):

| Case | v1 UI |
|------|--------|
| EMA period matches `anchor_stack` role | Info: “Shown as anchor stack EMA `{role}`” |
| Period exists in `chartEmaOverlays` but not anchor stack | Info: “Series available in bundle” — **do not** add rendering unless series already wired to a visible overlay (out of v1 scope) |
| Period not in bundle | Info: “EMA overlay unavailable (requires BFF)” |

**Hard constraints for implementers:**

- Do **not** implement new EMA series rendering unless the series already exists in `chartEmaOverlays` and is already displayed (v1: treat as info only; no new wiring).
- No client-side EMA calculation from candles.
- No BFF/API change in this change.

**Follow-up** (Open Question): BFF adds `exit_ema_overlays` or extends `chartEmaOverlays`; then a follow-up change may add toggles or auto-draw.

### 5. ATR levels — config panel only

Active exit components panel renders ATR `distance` fields. No horizontal bands at `entry ± ATR×mult` in v1.

**Open Question / follow-up change**: Extend `trade_records[]` or a `selected_trade_overlay` object with `stop_level`, `take_level` (and optionally per-bar trail) from backtest serialization.

### 6. Marker correctness — document, minimal marker change

Keep `buildTradeMarkers` time markers for scanability. Add comment + spec requirement: markers are **not** price truth. Price lines are authoritative for entry/exit levels. Optional: reduce SL/TP marker text opacity in legend note.

No change to marker `position` in v1 (still above/below bar); price lines address the misleading-level problem.

### 7. Testing strategy

Lightweight Charts draws price lines on **canvas** — do not assert brittle canvas DOM for line presence.

| Layer | What to test |
|-------|----------------|
| **Unit** | Pure builders: `chartTradePriceLines` options, `exitPolicyForTrade` parsing, `exit_kind` priority, EMA availability classification |
| **Component** | `ChartTradeDiagnostics` / `ActiveExitComponentsList` DOM (`data-testid`), stale-trade empty state |
| **E2E** | Panel fields + trade focus hint after Reports row click; no canvas line assertions |
| **Manual / Playwright screenshot** | Visual confirmation of entry/exit price lines on chart |

Extend `diagnostics-acceptance.spec.ts` for panel DOM only; chart line verification is manual or screenshot per `.cursor/rules/workbench-chart-screenshots.mdc`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Price lines clutter when many trades visible | Only render for **selected** trade |
| `entry_price` / `exit_price` null on bad data | Skip line; show em dash in panel |
| `strategy_spec.exit_policy` missing or malformed | Panel shows trade fields; components section empty state + parse warning |
| Exit EMA info rows look like broken toggles | Use static info text, not toggle controls, in v1 |
| Stale `selectedTradeId` after variant/run switch | Empty state + no price lines; surface existing warning |
| Lightweight Charts price line limit / z-order | Max 2 lines per selected trade; remove on cleanup |
| v3 reports lack v4 fields | Graceful placeholders; core prices still work if present |

## Migration Plan

- Ship as incremental Chart UI; no DB/API migration.
- Rollback: hide diagnostics panel and price-line effect behind no feature flag (revert PR).
- Manual QA: v4 fixture run, select trade from Reports → Chart focus, verify lines + panel; v3 fixture unchanged except optional panel with sparse fields.

## Open Questions

1. **ATR exact levels**: Should research add per-trade `stop_price` / `take_price` (or time series) to report JSON, or a dedicated `GET /runs/{id}/trades/{trade_id}/overlay` BFF endpoint?
2. **Exit EMA overlays**: Prioritize BFF batch EMA for referenced exit periods vs. expanding `chartEmaOverlays` roles beyond anchor stack?
3. **Panel vs drawer on narrow viewports**: Stack diagnostics below chart on mobile width, or collapse accordion?
