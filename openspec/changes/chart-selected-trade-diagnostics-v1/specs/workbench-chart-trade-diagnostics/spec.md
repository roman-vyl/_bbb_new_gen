## ADDED Requirements

### Requirement: Selected trade entry and exit price lines

When the Workbench Chart tab has a resolved `selectedTrade` from `selectedVariant.trade_records`, the chart SHALL render horizontal price lines at `entry_price` and, for closed trades with non-null `exit_price`, at `exit_price`. The lines SHALL be removed when `selectedTradeId` is cleared, changed to another trade, or when `selectedTradeId` is set but no matching trade exists in the current variant.

When `selectedTradeId` is non-null but the trade is not found in `selectedVariant.trade_records`, the chart SHALL NOT render selected-trade price lines and SHALL NOT error.

Price line labels SHALL be direction-aware and include trade identity:

- Entry label: `Entry #<trade_id>`
- Exit label: `Exit #<trade_id>` plus `exit_kind` when present (e.g. `Exit #12 · stop_loss`), otherwise a compact exit class derived from `exit_reason`.

The chart MUST NOT treat series marker position (`aboveBar` / `belowBar`) as the authoritative entry or exit price. Price lines backed by `entry_price` and `exit_price` are the authoritative visual price levels for the selected trade.

#### Scenario: Selected closed trade shows entry and exit price lines

- **WHEN** the user selects a closed trade with `entry_price` 100 and `exit_price` 105
- **THEN** the chart displays a horizontal line at price 100 labeled with `Entry #<trade_id>`
- **AND** the chart displays a horizontal line at price 105 labeled with exit information including `Exit #<trade_id>`

#### Scenario: Deselecting trade removes price lines

- **WHEN** the user clears trade selection (`selectedTradeId` becomes null)
- **THEN** no selected-trade entry or exit price lines remain on the chart

#### Scenario: Open trade shows entry line only

- **WHEN** the user selects an open trade with `entry_price` set and `exit_price` null
- **THEN** the chart displays an entry price line only
- **AND** no exit price line is drawn

#### Scenario: Missing prices skip lines without error

- **WHEN** the selected trade has null `entry_price` or null `exit_price` for a closed trade
- **THEN** the chart skips the corresponding price line
- **AND** the diagnostics panel shows a neutral placeholder for the missing price

#### Scenario: Stale selected trade id draws no price lines

- **WHEN** `selectedTradeId` is set to a value not present in `selectedVariant.trade_records` (e.g. after switching variant or run)
- **THEN** the chart does not render entry or exit price lines for that id
- **AND** the UI does not throw

### Requirement: Chart trade diagnostics panel

When `selectedTradeId` is set, the Chart tab SHALL show a trade diagnostics panel listing the selected trade's fields:

- `trade_id`, `direction`, `status`
- `entry_time_ms`, `exit_time_ms`
- `entry_price`, `exit_price`
- `pnl`, `return_pct`, `gross_pnl`, `fees_paid`, `gross_return_pct` (when present)
- `exit_reason`, `exit_group`, `exit_profile`, `exit_component_id`, `exit_instance_id`, `exit_kind`
- `hold_bars`, `hold_minutes` (when present)
- `entry_profile`, `active_exit_profile`, `entry_context_state` (when present)

The panel SHALL use the same field semantics as Reports trade detail and [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../../../specs/ema-pullback-report-diagnostics/spec.md) (e.g. `active_exit_profile` is the locked lifetime profile, not interchangeable with `exit_profile`).

#### Scenario: v4 trade shows full diagnostics panel

- **WHEN** the user selects a closed trade row that includes schema v4 diagnostic fields
- **THEN** the Chart diagnostics panel displays those fields with non-null values shown as formatted numbers/strings
- **AND** null or missing fields display a neutral placeholder

#### Scenario: No trade selected hides diagnostics panel

- **WHEN** `selectedTradeId` is null
- **THEN** the Chart trade diagnostics panel is not shown (or shows only an instruction to select a trade)

#### Scenario: Stale selected trade id shows empty state

- **WHEN** `selectedTradeId` is non-null but no trade with that `trade_id` exists in `selectedVariant.trade_records`
- **THEN** the Chart trade diagnostics panel shows a neutral empty state (e.g. trade not found for current variant)
- **AND** trade field rows are not shown with fabricated data

### Requirement: Active exit components for selected trade

When a trade is selected and `selectedVariant.strategy_spec.trade_management.exit_policy` is present, the Chart SHALL list active exit components comprising:

1. All rules under `exit_policy.always_on.exits`
2. All rules under `exit_policy.profiles.<active_exit_profile>.exits`, where `<active_exit_profile>` is the selected trade's `active_exit_profile`

Each listed row SHALL include: `group` (`always_on` or `profile`), `profile` (null for always_on), `component_id`, `instance_id`, `exit_kind`, and a parameters summary.

`exit_kind` for each row SHALL be resolved in this order:

1. `exit_kind` on the exit policy rule object when present
2. `trade.exit_kind` when the row is the closing component (`instance_id` equals `trade.exit_instance_id`)
3. A known `component_id` mapping when neither of the above is present
4. A neutral placeholder when still unknown

The UI MUST NOT infer `exit_kind` from `component_id` naming when `rule.exit_kind` is already set.

- ATR rules: distance `timeframe`, `period`, `multiplier`
- EMA-related rules: `ema`, `fast_ema`, `slow_ema`, `confirm_bars` when present on the rule object

The row whose `instance_id` equals the trade's `exit_instance_id` SHALL be visually indicated as the closing component.

#### Scenario: Always-on and profile exits listed

- **WHEN** the selected trade has `active_exit_profile` `countertrend` and the exit policy defines two always-on exits and one countertrend profile exit
- **THEN** the active exit components list shows two `always_on` rows and one `profile` row for `countertrend`

#### Scenario: Closing component highlighted

- **WHEN** the selected trade has `exit_instance_id` `atr_sl` and an always-on rule with `instance_id` `atr_sl` exists
- **THEN** that rule's row is marked as the closing component

#### Scenario: Missing exit policy shows empty state

- **WHEN** `strategy_spec.trade_management.exit_policy` is absent or unparsable
- **THEN** the active exit components section shows an empty state or warning
- **AND** the trade diagnostics panel still renders trade record fields

#### Scenario: Rule exit_kind takes priority over component_id heuristic

- **WHEN** an exit policy rule has `exit_kind` `signal` and a `component_id` that would map to `stop_loss` heuristically
- **THEN** the active exit components row displays `exit_kind` `signal`
- **AND** the UI does not override with a `component_id`-derived kind

### Requirement: Exit-component EMA availability info without new rendering in v1

For exit rules that reference EMA parameters, the Chart SHALL show **availability/info** (not interactive toggles required in v1): whether the period is already covered by the anchor-stack overlay, or whether an EMA overlay is unavailable in the current chart bundle.

The UI SHALL NOT compute EMA values from candles in the browser. The UI SHALL NOT add new EMA `LineSeries` or rendering paths in v1 unless the series already exists in `chartEmaOverlays` and is already displayed (v1: info rows only; no new wiring). This change SHALL NOT include BFF or API changes.

#### Scenario: Anchor-stack period shows covered info

- **WHEN** an exit rule references EMA period 500 and anchor-stack overlay already includes period 500 for role `anchor`
- **THEN** the UI shows info that the EMA is covered by the anchor stack overlay
- **AND** no additional EMA line is added for that rule

#### Scenario: Unavailable EMA period shows hint only

- **WHEN** an exit rule references an EMA period not present in `chartEmaOverlays`
- **THEN** the UI shows a static hint that the EMA overlay is unavailable in v1
- **AND** no new EMA series is rendered and no client-side EMA is computed

### Requirement: No approximate ATR stop or take bands in v1

The Chart SHALL NOT draw approximate ATR-based stop-loss or take-profit horizontal bands computed from entry price and ATR parameters in the frontend.

The active exit components panel SHALL still display ATR distance configuration (`timeframe`, `period`, `multiplier`) for ATR exit rules.

#### Scenario: ATR config visible without price bands

- **WHEN** the selected trade was closed by an ATR stop rule and the exit policy includes ATR distance parameters
- **THEN** the active exit components panel shows those parameters
- **AND** the chart does not render inferred stop/take price levels from those parameters alone

### Requirement: Trade markers remain time indicators only

Entry and exit series markers SHALL continue to indicate bar timing and exit class (E, SL, TP, SIG) at `entry_time_ms` / `exit_time_ms`. For the selected trade, exact entry and exit prices SHALL be communicated via price lines and the diagnostics panel, not via marker vertical position.

#### Scenario: Selected trade has both marker and price line

- **WHEN** the user selects a closed long trade
- **THEN** an entry marker appears at the entry bar time
- **AND** an entry price line appears at `entry_price` regardless of marker `aboveBar`/`belowBar` placement
