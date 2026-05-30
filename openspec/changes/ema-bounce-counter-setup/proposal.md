## Why

`ema_pullback` needs a setup gate that limits entries to early interactions with the anchor EMA inside a fresh EMA-stack trend episode. This lets research test the hypothesis that the first anchor EMA bounce/touch opportunities are higher quality, while later interactions often indicate trend exhaustion, chop, or anchor breakdown attempts.

## What Changes

- Add a new `ema_bounce_counter_setup` setup component for `ema_pullback`.
- Register the component with `role: setup` and `component_id: ema_bounce_counter_setup`; it is not a trigger, blocker, or exit.
- Keep MVP EMA-stack evaluation on the base timeframe only; HTF EMA-stack setup is out of scope.
- Compute market state continuously bar-by-bar, independent of trade state, entries, exits, PnL, and vectorbt position state.
- Track long/short EMA-stack trend episodes, continuous arming, raw anchor EMA range touches, inclusive pending bounce windows, lookback/cooldown state, completed bounce count, and setup permission.
- Gate entry composition through `setup_allowed`, while existing trigger components (`touch_anchor`, `reclaim_anchor`, `strong_reclaim_anchor`) remain responsible for concrete entry signals.
- Expose diagnostic fields for signal trace/report consumers: `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `setup_allowed`, and `price_side_of_anchor`.
- Prepare setup diagnostics for Chart `component_events[]`: eligible raw-touch/bounce opportunity as `source`, pending bounce window as `span_start`/`span_end`, and optional trend start/break as `point`.
- Add optional report diagnostics for grouping trades by bounce state at entry, including `trend_episode_id`, `effective_bounce_number`, `completed_bounce_count`, and `side`.

**Non-goals (explicit)**

- No EMA computation inside the component; EMA features must come from the existing feature planning mechanism.
- MVP is base timeframe EMA only; HTF EMA stack evaluation is out of scope for this change.
- No ATR bands, tolerance bands, zone model, or separation model in MVP; `raw_touch_mode: range_cross` uses exact `low <= anchor_ema <= high`.
- No trigger semantics, reclaim semantics, or entry timing decisions inside this component.
- No dependency on open/closed trade state, trade count, PnL, or vectorbt position state.
- No Data Engine changes.
- No frontend-side EMA or strategy computation.

## Capabilities

### New Capabilities

- `ema-bounce-counter-setup`: Defines the `ema_bounce_counter_setup` research setup component contract, continuous market-state counter semantics, configuration, feature requirements, setup gate behavior, and diagnostics.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: Add optional entry diagnostics for grouping closed trades by trend episode and bounce number at entry when `ema_bounce_counter_setup` is configured.
- `workbench-chart-component-event-markers`: Add an EMA setup event emitter mapping `ema_bounce_counter_setup` market-state diagnostics to generic `component_events[]`.

## Impact

| Layer | Scope |
|-------|-------|
| **research** | EMA pullback setup component implementation, component registry/catalog source, feature planning requests, signal builder setup gate integration, signal trace diagnostics, report trade diagnostics |
| **research_api** | Component catalog/validation exposure for the new setup component and params, if the catalog is served through the BFF |
| **frontend** | Catalog-driven Composer/diagnostic display may surface the new setup and optional diagnostic fields; Chart renders emitted component events through existing `event_type`/`role`/`side` rules only; no browser-side EMA/counter computation |
| **data_engine** | _none_ |

**Reference docs/specs**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`docs/research/README.md`](../../../docs/research/README.md), [`openspec/specs/ema-pullback-report-diagnostics/spec.md`](../../specs/ema-pullback-report-diagnostics/spec.md), [`openspec/specs/workbench-chart-component-event-markers/spec.md`](../../specs/workbench-chart-component-event-markers/spec.md), [`openspec/specs/workbench-strategy-contexts/spec.md`](../../specs/workbench-strategy-contexts/spec.md).
