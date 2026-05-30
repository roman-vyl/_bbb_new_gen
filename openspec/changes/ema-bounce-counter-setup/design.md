## Context

`ema_pullback` already composes entries from direction, setup, trigger, blockers, and risk masks. The current setup implementation is `untouched_anchor_setup`, registered under the family-local component registry and invoked from signal building and signal trace paths. EMA features are planned from `EmaPullbackStrategySpec` and materialized before strategy execution; setup components should consume prepared OHLC/EMA columns, not compute indicators themselves.

`ema_bounce_counter_setup` adds a new setup gate with richer internal market state. It must run continuously over the full OHLCV history for each enabled side, counting anchor EMA interactions inside EMA-stack trend episodes. The count is independent of whether a trade entered, was blocked, or was already open.

Likely touched modules:

- `research/strategies/ema_pullback/spec.py`
- `research/strategies/ema_pullback/component_builders.py`
- `research/strategies/ema_pullback/components/setup.py`
- `research/strategies/ema_pullback/components/registry.py`
- `research/strategies/ema_pullback/execution/signals.py`
- `research/strategies/ema_pullback/execution/signal_trace.py`
- `research/strategies/ema_pullback/features/plan.py`
- research report/trade-record diagnostics modules that snapshot entry-bar component state
- component event emitter code in signal trace/report serialization, reusing the existing `component_events[]` contract
- `research_api` catalog/validation modules, if they mirror the research component registry
- frontend catalog-driven type/display code only if needed to accept the new params and optional diagnostics

## Goals / Non-Goals

**Goals:**

- Add `role: setup`, `component_id: ema_bounce_counter_setup` for `ema_pullback`.
- Model a trend episode from EMA-stack state:
  - long: `fast_ema > anchor_ema > slow_ema`
  - short: `fast_ema < anchor_ema < slow_ema`
- Reset completed count, pending state, and lookback state at the start/end boundaries of trend episodes.
- Count completed pending bounce windows, not raw-touch candles and not entries.
- Keep `setup_allowed` true before the bounce limit is exhausted, true during the last allowed pending bounce, and false after the limit bounce completes.
- Expose per-bar internals for signal trace/report diagnostics.
- Emit optional Chart-ready semantic events from the same backend setup trace without adding frontend component-id rendering branches.
- Request all required EMA features through the existing feature plan/spec path.

**Non-Goals:**

- No trigger, reclaim, strong reclaim, or buy/sell decision logic in this setup.
- No EMA, ATR, tolerance-band, or zone calculation inside the component.
- No trade-state coupling, position-state coupling, or entry-count semantics.
- No Data Engine changes.
- No frontend-side computation of the counter.

## Decisions

### Decision: represent setup config as a typed setup spec variant

Add an `EmaBounceCounterSetupSpec` (name can follow local convention) rather than overloading `UntouchedAnchorSetupSpec`. It should carry:

- `component_id: "ema_bounce_counter_setup"`
- `fast_ema`, `anchor_ema`, `slow_ema` period specs or period fields that are converted into `EmaSpec`
- `max_bounces`
- `raw_touch_mode: "range_cross"`
- `touch_lookback_bars`
- `trend_start_confirmation_bars`
- `trend_break_confirmation_bars`

Rationale: the existing setup dataclass only has `lookback` and `active_bars`; reusing it would hide distinct semantics and make config identity ambiguous.

Alternative considered: encode the component as a plain string plus loose params. Rejected because existing research code benefits from typed validation and feature planning should know the exact EMA specs.

### Decision: keep setup output as a boolean gate and expose internals through trace helpers

The runtime setup function should return `setup_allowed` as the setup mask used by final entry composition. A companion trace function should return the full diagnostic dictionary, including `setup_allowed` and counter internals.

Rationale: this preserves the existing final composition shape:

`entry = direction_allowed AND setup_allowed AND trigger_signal AND blockers_passed AND risk_ok`

Alternative considered: make the setup return a structured object everywhere. Rejected for MVP because it would widen the execution path more than needed; trace/report paths can carry the richer payload.

### Decision: implement the counter as an explicit per-side state machine

Use a deterministic bar loop for long and short separately. On each bar:

1. Resolve `trend_active` after confirmation.
2. Start or end trend episodes, resetting counter state at episode boundaries.
3. Compute continuous `armed` from close side of anchor.
4. Compute `raw_touch` from `low <= anchor_ema <= high`.
5. Advance an existing pending/lookback window; ignore additional touches while the window is active.
6. Increment `completed_bounce_count` only when the pending window finishes.
7. Start a new pending bounce only when `trend_active AND armed AND raw_touch AND not pending_bounce AND not in_touch_lookback`.
8. Compute `setup_allowed` from the completed count and pending state.

Rationale: the semantics depend on ordered state transitions and on incrementing at the end of a window without requiring a raw touch on that final bar. A vectorized rolling implementation would be easier to misread and harder to test against edge cases.

Alternative considered: count raw touch candles with rolling suppression. Rejected because it increments too early and can mis-handle multi-bar touches and post-touch bounce windows.

### Decision: treat `armed` as continuous calculation, not a business permission

For long, `armed = close > anchor_ema`; for short, `armed = close < anchor_ema`. It only controls whether a new pending bounce can start. `setup_allowed` remains the business gate.

Rationale: the strategy should remain allowed before the first bounce and between valid bounces even when the next trigger is handled elsewhere. Conflating `armed` with setup permission would prematurely block trigger evaluation.

Alternative considered: require `armed` in `setup_allowed`. Rejected because it changes setup from counter permission into price-side trigger-like behavior.

### Decision: gate with completed-limit semantics, not simple effective number

Use:

`setup_allowed = trend_active AND (completed_bounce_count < max_bounces OR (pending_bounce AND completed_bounce_count + 1 <= max_bounces))`

Rationale: after the third completed bounce with `max_bounces = 3`, `effective_bounce_number` is still 3 if defined naively from completed count, but new entries must be forbidden. The pending-aware formula keeps the last allowed pending bounce tradable and blocks after it completes.

Alternative considered: `effective_bounce_number <= max_bounces`. Rejected because it leaves setup allowed after the limit bounce has completed.

### Decision: surface bounce diagnostics at entry when reports are built

When the component is configured and trace/state is available, closed trade records should include the entry-bar `trend_episode_id`, `effective_bounce_number`, and `completed_bounce_count`. Aggregation can then group expectancy, profit factor, win rate, and MFE capture by bounce number.

Rationale: the feature exists to compare early vs late anchor interactions; without entry-bar diagnostics the hypothesis is hard to evaluate from reports.

Alternative considered: keep diagnostics only in signal trace. Rejected because trade-level report grouping is the main research feedback loop.

### Decision: map setup state to generic component events in the backend

When component events are emitted for `ema_bounce_counter_setup`, the backend should translate setup trace state into the existing generic `component_events[]` vocabulary:

- `source`: the eligible raw-touch bar that starts a bounce opportunity and opens a pending window.
- `span_start`: the first bar of the pending bounce window, sharing `span_id` with the source event.
- `span_end`: the last active bar of the pending bounce window, not the first inactive bar after it.
- `point`: optional `trend_start` and `trend_break` events.

Use `role: setup`, `component_id: ema_bounce_counter_setup`, `feature_family: ema`, and component-specific fields under `metadata` only. Useful metadata includes EMA periods, `trend_episode_id`, `completed_bounce_count`, `effective_bounce_number`, `max_bounces`, `touch_lookback_bars`, `price_side_of_anchor`, and a semantic `event_name` such as `bounce_opportunity_start`, `pending_bounce_start`, `pending_bounce_end`, `trend_start`, or `trend_break`.

Rationale: chart rendering already keys on `event_type`, `role`, and `side`. Keeping this mapping in research preserves component semantics in the backend and keeps the frontend generic.

Alternative considered: expose only raw per-bar booleans and let the frontend synthesize events. Rejected because the frontend must not compute setup semantics from candles or branch on `component_id`.

## Risks / Trade-offs

- Confirmation bars can be off by one around trend starts/breaks. → Add focused unit tests for confirmation `1` and larger values, including immediate touch on the first confirmed trend bar.
- Pending-window ordering can change whether the completion bar allows a new touch. → Specify and test that touches inside the active window are ignored and the completed count increments when the window expires, without requiring raw touch on that bar.
- New setup config shape may require loader/catalog changes beyond the current string setup field. → Keep loader validation explicit and ensure `component_id` plus params participate in strategy identity/config id.
- Trace/report fields can increase payload size. → Keep the required trace fields scalar per bar and make trade-record diagnostics optional when the component is not configured.
- The component can expose rich internals that frontend users might interpret as triggers. → Label fields as diagnostics and keep `setup_allowed` as the only setup gate consumed by final entry composition.
- Chart events can duplicate the same bar as both `source` and `span_start`. → Link them with `span_id` and distinct `event_type`/`metadata.event_name` so the chart can render generic markers without inferring setup rules.
