## Why

`ema_bounce_counter_setup` already emits semantic `component_events[]`, but the Chart still shows generic setup markers (`Src`, `Setup▶`, `Setup■`, `Trend`) and sparse tooltips. Researchers cannot read bounce number, raw-touch vs lookback window, trend episode boundaries, or gate state (`setup_allowed`, `armed`) without digging into trace internals. This follow-up improves **presentation only** — trading semantics and entry gating stay unchanged.

## What Changes

- **research**: Extend `ema_bounce_counter_setup` event `metadata` on every emitted bounce/trend event with the full per-bar diagnostic snapshot already in setup trace — including `trend_active` and `in_touch_lookback` (explains active trend zone vs lookback-window bars when `raw_touch` is false), plus `armed`, `raw_touch`, `pending_bounce`, `setup_allowed`, lookback fields, bounce counts, EMA periods, etc. Distinguish trend points via `metadata.event_name` (`trend_start` / `trend_break`).
- **frontend**: Add a **presentation helper** for `component_id: ema_bounce_counter_setup` that maps `metadata.event_name` + bounce fields to chart labels (`B{n} touch`, `B{n}▶`, `B{n}■`, `T+`, `T-`) and human-readable tooltips. Generic marker **styling** remains `role` + `event_type` + `side` only.
- **frontend**: Add **Show setup** layer toggle in `ChartMarkerLegend` (parallel to entry_block / exit_signal).
- **tests**: Extend signal-trace and `chartComponentEvents` unit tests for new metadata keys and label/tooltip formatting.

**Non-goals**

- No changes to `ema_bounce_counter_setup` trading logic, `setup_allowed` computation, bounce counting rules, or entry composition.
- No frontend synthesis of touches, pending windows, or trend episodes from candles/EMA.
- No Data Engine or research_api contract changes beyond passthrough of enriched trace JSON.
- No new component emitters or changes to RSI / other setup components' labels.

## Capabilities

### New Capabilities

_None — extends existing chart and setup capabilities._

### Modified Capabilities

- `workbench-chart-component-event-markers`: Richer bounce metadata contract; setup role layer toggle; component-specific **label/tooltip** presentation via registered formatter (not styling branches).
- `ema-bounce-counter-setup`: Event emitter metadata SHALL include full diagnostic snapshot per bar for Chart tooltips.

## Impact

| Layer | Scope |
|-------|-------|
| **research** | `signal_trace.py` — `_ema_bounce_metadata`, optional generic label cleanup; tests in `test_ema_pullback_signal_trace.py` |
| **research_api** | _none_ (trace JSON passthrough) |
| **frontend** | `chartComponentEvents.ts`, new presentation module, `ChartMarkerLegend.tsx`, `ChartPanel.tsx`, unit tests |
| **data_engine** | _none_ |

**Reference**: Archived change [`openspec/changes/archive/2026-05-30-ema-bounce-counter-setup/`](../../archive/2026-05-30-ema-bounce-counter-setup/), [`openspec/specs/workbench-chart-component-event-markers/spec.md`](../../specs/workbench-chart-component-event-markers/spec.md), [`openspec/specs/ema-bounce-counter-setup/spec.md`](../../specs/ema-bounce-counter-setup/spec.md).
