# ema-bounce-counter-setup Specification

## Purpose

EMA-stack setup component for `ema_pullback`: counts anchor EMA bounce interactions within confirmed trend episodes and gates entries via `setup_allowed` until `max_bounces` is exhausted. Base timeframe EMA only (MVP). Backend owns trace, component events, and trade diagnostics; frontend is catalog-driven config only.
## Requirements
### Requirement: Setup component registration

The `ema_pullback` strategy family SHALL expose `ema_bounce_counter_setup` as a setup component with `role: setup` and `component_id: ema_bounce_counter_setup`. The component MUST NOT be registered or treated as a trigger, blocker, exit, direction, or risk component. Authors configure it as an element of `strategy.setups`, not as the sole `strategy.setup` object.

#### Scenario: Component catalog exposes setup role

- **GIVEN** the component catalog is built for `ema_pullback`
- **WHEN** the catalog lists setup components
- **THEN** `ema_bounce_counter_setup` appears under `role: setup`
- **AND** it does not appear under trigger, blocker, exit, direction, or risk roles

#### Scenario: Final entry composition keeps trigger separate

- **GIVEN** a strategy config uses `ema_bounce_counter_setup` in `strategy.setups`
- **AND** uses `trigger.component_id: reclaim_anchor`
- **WHEN** entry signals are composed
- **THEN** entries require `setup_allowed` from the bounce-counter setup instance as part of aggregate `setup_ok`
- **AND** entries also require the separate `reclaim_anchor` trigger signal

### Requirement: Setup configuration and feature inputs

The component SHALL accept MVP params `fast_ema`, `anchor_ema`, `slow_ema`, `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` on its `strategy.setups[]` entry (nested under `params` when using nested storage). For MVP, `fast_ema`, `anchor_ema`, and `slow_ema` SHALL refer to base timeframe EMA periods only; HTF EMA-stack setup evaluation is out of scope. `raw_touch_mode` MUST support `range_cross` for MVP. `max_bounces`, `touch_lookback_bars`, `trend_start_confirmation_bars`, and `trend_break_confirmation_bars` MUST be positive integers.

The component SHALL consume OHLC market data plus prepared `fast_ema`, `anchor_ema`, and `slow_ema` feature columns. It MUST request EMA features through the existing feature planning mechanism and MUST NOT compute EMA columns internally.

#### Scenario: Valid MVP config is accepted

- **GIVEN** a setup list entry with `component_id: ema_bounce_counter_setup`
- **AND** params `fast_ema: 50`, `anchor_ema: 200`, `slow_ema: 500`, `max_bounces: 3`, `raw_touch_mode: range_cross`, `touch_lookback_bars: 10`, `trend_start_confirmation_bars: 1`, and `trend_break_confirmation_bars: 1`
- **WHEN** the strategy spec is loaded and validated
- **THEN** the setup config is accepted
- **AND** those params participate in strategy identity/config id generation

#### Scenario: Feature plan requests setup EMAs

- **GIVEN** a strategy config uses `ema_bounce_counter_setup` in `setups` with fast, anchor, and slow EMA periods
- **WHEN** the feature plan is built
- **THEN** the plan includes base timeframe EMA features for the configured fast, anchor, and slow periods
- **AND** the setup component receives the corresponding prepared columns during execution

#### Scenario: HTF EMA stack is rejected in MVP

- **GIVEN** a setup list entry with `component_id: ema_bounce_counter_setup`
- **AND** the setup attempts to specify a non-base EMA timeframe for the EMA stack
- **WHEN** the strategy spec is loaded and validated
- **THEN** validation rejects the setup config
- **AND** the user must use base timeframe EMA periods for MVP

#### Scenario: Setup does not compute EMA internally

- **GIVEN** the required EMA column for the configured anchor period is missing from prepared market data
- **WHEN** the setup component is executed
- **THEN** execution fails with a clear error
- **AND** the component does not compute EMA values inline

### Requirement: Trend episodes reset counter state

The component SHALL maintain independent long and short trend episodes. For long, `trend_active` SHALL mean `fast_ema > anchor_ema > slow_ema`. For short, `trend_active` SHALL mean `fast_ema < anchor_ema < slow_ema`.

When a new confirmed trend episode starts, the component SHALL set `completed_bounce_count` to `0`, `pending_bounce` to `false`, reset touch lookback state, and assign a new `trend_episode_id`. When the confirmed trend episode breaks, the component SHALL reset completed count, pending state, lookback state, and trend episode state.

#### Scenario: Long trend starts from EMA stack

- **GIVEN** long-side EMA values become `fast_ema > anchor_ema > slow_ema`
- **AND** `trend_start_confirmation_bars` is satisfied
- **WHEN** the first confirmed trend bar is evaluated
- **THEN** a new long trend episode is active
- **AND** `completed_bounce_count` is `0`
- **AND** `pending_bounce` is `false`

#### Scenario: Short trend starts from inverted EMA stack

- **GIVEN** short-side EMA values become `fast_ema < anchor_ema < slow_ema`
- **AND** `trend_start_confirmation_bars` is satisfied
- **WHEN** the first confirmed trend bar is evaluated
- **THEN** a new short trend episode is active
- **AND** `completed_bounce_count` is `0`
- **AND** `pending_bounce` is `false`

#### Scenario: Trend break clears active pending bounce

- **GIVEN** a trend episode is active
- **AND** `pending_bounce` is `true`
- **WHEN** the EMA stack break satisfies `trend_break_confirmation_bars`
- **THEN** the trend episode ends
- **AND** `pending_bounce` is reset to `false`
- **AND** `completed_bounce_count` and touch lookback state are reset

### Requirement: Continuous armed and raw touch states

The component SHALL compute `armed` on every bar. For long, `armed` SHALL be `close > anchor_ema`; for short, `armed` SHALL be `close < anchor_ema`. `armed` SHALL control whether a new pending bounce can start, but MUST NOT be treated as the business meaning of setup permission.

For MVP `raw_touch_mode: range_cross`, `raw_touch` SHALL be `low <= anchor_ema <= high` for both long and short.

#### Scenario: Long armed state follows close side

- **GIVEN** a long trend episode is active
- **WHEN** a bar has `close > anchor_ema`
- **THEN** `armed` is `true`
- **AND** `setup_allowed` is still determined by the trend and bounce-limit rule

#### Scenario: Short armed state follows close side

- **GIVEN** a short trend episode is active
- **WHEN** a bar has `close < anchor_ema`
- **THEN** `armed` is `true`
- **AND** `setup_allowed` is still determined by the trend and bounce-limit rule

#### Scenario: Range-cross touch is side-neutral

- **GIVEN** either side is being evaluated
- **WHEN** a bar has `low <= anchor_ema <= high`
- **THEN** `raw_touch` is `true`

### Requirement: Pending bounce window collapses multi-bar EMA interaction

The component SHALL start a pending bounce window only when `trend_active`, `armed`, `raw_touch`, `not pending_bounce`, and `not in_touch_lookback` are all true. Starting a pending bounce SHALL set `pending_bounce` to `true` and initialize `touch_lookback_left` from `touch_lookback_bars`.

`touch_lookback_bars` SHALL be inclusive of the raw-touch start bar. If a pending bounce starts at index `i0` with `touch_lookback_bars = N`, then the pending/lookback window is active on bars `i0` through `i0 + N - 1`. The final active lookback bar is `i0 + N - 1`; the next pending bounce MUST NOT start before bar `i0 + N`.

While a pending/lookback window is active, additional `raw_touch` bars SHALL NOT start another pending bounce and SHALL NOT increment `completed_bounce_count`.

#### Scenario: First eligible touch opens pending bounce

- **GIVEN** a trend episode is active
- **AND** `armed` is `true`
- **AND** no pending/lookback window is active
- **WHEN** `raw_touch` becomes `true`
- **THEN** `pending_bounce` becomes `true`
- **AND** `touch_lookback_left` is initialized
- **AND** `completed_bounce_count` is not incremented on that raw-touch bar

#### Scenario: Repeated touches inside lookback are ignored

- **GIVEN** a pending bounce window started on bar 100
- **WHEN** bars 101, 102, and 103 also have `raw_touch: true` while the window remains active
- **THEN** no additional pending bounce is started
- **AND** `completed_bounce_count` remains unchanged until the original window completes

#### Scenario: Final active lookback touch is ignored

- **GIVEN** a pending bounce window starts at index `i0`
- **AND** `touch_lookback_bars` is `N`
- **WHEN** the final active lookback bar `i0 + N - 1` has `raw_touch: true`
- **THEN** that raw touch is ignored for starting another pending bounce
- **AND** no new pending bounce can start until the previous window has completed
- **AND** the earliest bar that can start a next pending bounce is `i0 + N`

#### Scenario: Unarmed raw touch does not open pending bounce

- **GIVEN** a trend episode is active
- **AND** `armed` is `false`
- **WHEN** `raw_touch` is `true`
- **THEN** `pending_bounce` remains `false`
- **AND** `completed_bounce_count` is unchanged

### Requirement: Bounce count increments only at window completion

The component SHALL complete a pending lookback window after its final active lookback bar. If a pending bounce starts at index `i0` with `touch_lookback_bars = N`, the final active lookback bar SHALL be `i0 + N - 1`; `completed_bounce_count` SHALL increase on the completion transition after that bar and be reflected from the next evaluated bar, `i0 + N`. The final active lookback bar SHALL NOT require `raw_touch` to be true. After completion, `pending_bounce` SHALL become `false` and `touch_lookback_left` SHALL be `0`.

`completed_bounce_count` SHALL mean the number of completed pending bounce windows in the current trend episode.

#### Scenario: Bounce completes after final active lookback bar without touch

- **GIVEN** a pending bounce started from a raw touch
- **AND** subsequent bars move away from the anchor EMA
- **WHEN** the final active lookback bar is evaluated with `raw_touch: false`
- **THEN** the window is completed after that final active lookback bar
- **AND** `completed_bounce_count` increases by `1` from the next evaluated bar
- **AND** `pending_bounce` becomes `false` from the next evaluated bar
- **AND** `touch_lookback_left` is `0`

#### Scenario: Count represents windows not entries

- **GIVEN** a pending bounce window starts on a bar where trigger and blocker conditions do not produce an entry
- **WHEN** the pending window completes
- **THEN** `completed_bounce_count` increases by `1`
- **AND** the count is unchanged by whether any trade entered

### Requirement: Setup allowed follows bounce limit semantics

The component SHALL expose `setup_allowed` as the setup gate consumed by final entry composition. `setup_allowed` SHALL be true only while a trend episode is active and the bounce limit has not been exhausted.

The formula SHALL be:

`setup_allowed = trend_active AND (completed_bounce_count < max_bounces OR (pending_bounce AND completed_bounce_count + 1 <= max_bounces))`

The component SHALL expose `effective_bounce_number` as `completed_bounce_count + 1` when `pending_bounce` is true, otherwise `completed_bounce_count`. `effective_bounce_number` is diagnostic and MUST NOT replace the pending-aware `setup_allowed` formula.

#### Scenario: Setup allowed before first bounce

- **GIVEN** `max_bounces` is `3`
- **AND** a trend episode is active with `completed_bounce_count: 0` and `pending_bounce: false`
- **WHEN** the bar is evaluated
- **THEN** `effective_bounce_number` is `0`
- **AND** `setup_allowed` is `true`

#### Scenario: Setup allowed during last permitted pending bounce

- **GIVEN** `max_bounces` is `3`
- **AND** a trend episode is active with `completed_bounce_count: 2`
- **WHEN** the third pending bounce is active
- **THEN** `effective_bounce_number` is `3`
- **AND** `setup_allowed` is `true`

#### Scenario: Setup blocked after limit bounce completes

- **GIVEN** `max_bounces` is `3`
- **AND** a trend episode is active
- **WHEN** the third pending bounce completes and `completed_bounce_count` becomes `3`
- **THEN** `pending_bounce` is `false`
- **AND** `setup_allowed` is `false`

#### Scenario: Fourth interaction cannot enable entry

- **GIVEN** `max_bounces` is `3`
- **AND** `completed_bounce_count` is already `3` in the active trend episode
- **WHEN** price later becomes armed and touches the anchor EMA again
- **THEN** `setup_allowed` remains `false`
- **AND** any trigger signal on that bar cannot produce an entry through final composition

### Requirement: Component state is market-state not trade-state

The component SHALL compute continuously over the full bar history and MUST NOT depend on open trades, closed trades, entries, exits, PnL, or vectorbt position state. Raw touches and pending windows SHALL be counted even when a trigger does not fire, a blocker blocks entry, or a trade is already open.

#### Scenario: Blocked entry still counts market interaction

- **GIVEN** a trend episode is active
- **AND** an eligible raw touch starts a pending bounce
- **AND** a blocker prevents entry on the touch bar and all bars in the lookback window
- **WHEN** the pending window completes
- **THEN** `completed_bounce_count` increases by `1`

#### Scenario: Open position does not pause counter

- **GIVEN** a trade is already open during an active trend episode
- **WHEN** price starts and completes another eligible pending bounce window
- **THEN** `completed_bounce_count` increases according to market interaction rules
- **AND** the count does not depend on the position remaining open

### Requirement: Per-bar diagnostics are exposed

The component SHALL expose per-bar diagnostics for at least: `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `setup_allowed`, and `price_side_of_anchor`.

Optional diagnostics MAY include `trend_start_event`, `trend_break_event`, `pending_bounce_start_time`, `last_completed_bounce_time`, `bars_since_pending_bounce_start`, and `bars_since_last_completed_bounce`.

The diagnostics SHALL be sufficient for backend emitters to derive Chart `component_events[]` without recomputing EMA/counter semantics in the frontend.

#### Scenario: Signal trace includes required diagnostics

- **GIVEN** signal trace is built for a strategy using `ema_bounce_counter_setup`
- **WHEN** the trace includes setup internals
- **THEN** each required diagnostic field is present as a per-bar series aligned to the OHLCV index

#### Scenario: Diagnostics do not change final entries

- **GIVEN** two otherwise identical runs use `ema_bounce_counter_setup`
- **AND** one run emits setup diagnostics while the other only computes runtime masks
- **WHEN** final entry signals are compared
- **THEN** the entry masks are identical

#### Scenario: Diagnostics identify event boundaries

- **GIVEN** signal trace is built for a strategy using `ema_bounce_counter_setup`
- **WHEN** a raw touch opens a pending bounce window and the window later completes
- **THEN** diagnostics identify the bounce opportunity start bar
- **AND** diagnostics identify the pending window start and end bars
- **AND** no frontend candle or EMA computation is required to derive those event boundaries

### Requirement: Bounce counter setup may coexist in a setup stack

`ema_bounce_counter_setup` SHALL be usable as one instance within `strategy.setups` alongside other setup components (including `untouched_anchor_setup`). Its trading semantics, params, and feature requirements MUST remain unchanged from the standalone component spec. Entry composition MUST apply bounce-counter `setup_allowed` as one factor in the aggregate AND gate, not as a replacement for other setup instances.

#### Scenario: Combined with untouched anchor

- **GIVEN** `setups` contains `untouched_anchor_setup` and `ema_bounce_counter_setup`
- **WHEN** entry signals are composed
- **THEN** entries require bounce-counter `setup_allowed` from the bounce-counter instance
- **AND** entries require untouched-anchor setup allowance from the untouched instance
- **AND** entries still require the configured trigger component

### Requirement: Bounce counter trace and events use instance_id in a stack

When `ema_bounce_counter_setup` appears in `strategy.setups`, signal trace internals, optional trade entry diagnostics, and `component_events[]` entries emitted for that component MUST include the setup instance's `instance_id` so they do not collide with another setup instance on the same strategy.

#### Scenario: Trace keyed by instance_id

- **GIVEN** a strategy whose `setups` includes instance_id `bounce_counter` with `ema_bounce_counter_setup`
- **WHEN** signal trace is built
- **THEN** bounce-counter diagnostics appear under `internals.setups.bounce_counter`
- **AND** are not stored as the sole `internals.setup` object

#### Scenario: Chart events include instance_id

- **GIVEN** a report includes `component_events` from `ema_bounce_counter_setup`
- **WHEN** the Chart renders setup-role markers
- **THEN** each event includes `instance_id` matching the setup list entry
- **AND** tooltip/metadata distinguishes instances without chart code branching on `component_id`

