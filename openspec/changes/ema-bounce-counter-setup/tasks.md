## 1. Contracts and Loading

- [x] 1.1 Add setup component constants and registry entry for `ema_bounce_counter_setup` with `role: setup`
- [x] 1.2 Add a typed setup spec/config model for `ema_bounce_counter_setup` with validation for base timeframe EMA params, `max_bounces`, `raw_touch_mode`, `touch_lookback_bars`, and trend confirmation bars
- [x] 1.3 Update config loader/external spec parsing so setup can be described with `component_id` plus params instead of only the legacy setup string
- [x] 1.4 Ensure setup component id and all params participate in strategy identity/config id generation
- [x] 1.5 Add or update component builder helpers for constructing `ema_bounce_counter_setup` configs in tests/examples

## 2. Feature Planning and Runtime Signals

- [x] 2.1 Update feature planning to request the setup's base timeframe fast, anchor, and slow EMA features through existing EMA feature mechanisms
- [x] 2.2 Implement `ema_bounce_counter_setup_trace` in the setup component module with per-side trend episode, armed, raw touch, pending window, lookback, completed count, effective number, and setup gate series
- [x] 2.3 Implement the runtime setup function as the `setup_allowed` series derived from the trace helper
- [x] 2.4 Update signal building to call the new setup with its configured EMA columns and params while preserving final `direction AND setup AND trigger AND blockers AND risk` composition
- [x] 2.5 Add unit tests for trend episode reset, long/short armed logic, raw touch detection, pending-window collapse, inclusive lookback timing, end-of-lookback count increment, final-active-lookback raw touch ignore, and post-limit setup blocking

## 3. Trace and Diagnostics

- [x] 3.1 Register the new setup trace function in signal trace generation
- [x] 3.2 Ensure setup internals include required fields: `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `setup_allowed`, and `price_side_of_anchor`
- [x] 3.3 Add trace tests proving diagnostics are aligned to the OHLCV index and do not alter final entry masks
- [x] 3.4 Add `component_events[]` emitter for `ema_bounce_counter_setup`: `source` for bounce opportunity start, `span_start`/`span_end` for pending bounce window, optional `point` for trend start/break
- [x] 3.5 Add component event tests for shared `span_id`, inclusive base-index `span_end`, final-active-lookback raw touch ignore, `role: setup`, `feature_family: ema`, and metadata-only EMA/counter details
- [x] 3.6 Snapshot entry-bar bounce counter fields into closed trade records when the setup is configured and trace/state is available
- [x] 3.7 Add optional variant breakdown metrics by side and entry effective bounce number, or explicitly defer aggregation while keeping trade-level fields available

## 4. Catalog, API, and Frontend Exposure

- [x] 4.1 Update research_api component catalog/validation to expose `ema_bounce_counter_setup` and its parameter schema if the BFF mirrors setup components
- [x] 4.2 Update frontend catalog-driven types/forms only where needed to accept the setup config, optional diagnostic fields, and emitted component events without computing EMA/counter state in the browser
- [x] 4.3 Add catalog or validation tests confirming the component appears only as setup and rejects invalid params
- [x] 4.4 Add Chart smoke coverage if needed to confirm `role: setup` events render via existing `event_type`/`role`/`side` logic without `component_id` branching

## 5. Verification

- [x] 5.1 Run focused research pytest coverage for setup component, feature planning, signal composition, signal trace, component events, loader/config identity, and report diagnostics
- [x] 5.2 Run relevant research_api tests if catalog/validation code changes
- [x] 5.3 Run relevant frontend tests/build if catalog-driven UI or TypeScript diagnostic types change
- [x] 5.4 Manually inspect a sample `ema_pullback` run using `max_bounces: 3` and `touch_lookback_bars: 10` to confirm entries are allowed through bounce #3, blocked after the third completed bounce, and Chart events mark the bounce opportunity/pending window correctly
