## Why

Workbench needs a **component-agnostic** chart event layer: blockers, exits, context gates, setup/trigger, and future catalog components must share one payload and one renderer. Today’s `component_event_markers[]` is dense (one marker per blocked bar) and was shaped around the first RSI emitters—`rsi_value` and RSI-centric legend copy leak into the contract mental model. That does not scale when the next components are **not RSI at all** (`counter_candle_blocker`, `ema_cross_exit`, HTF regime gate, setup/trigger).

This change establishes a universal **semantic event** model: backend emits `source` / `span_start` / `span_end` / `point` with extensible **`role`**; frontend renders only from **`event_type` + `role` + `side`**. `component_id` is provenance (tooltip only). Generic alignment fields (`feature_family`, `source_timeframe`, `base_timeframe`, `span_id`) are top-level; **component-specific** detail (RSI value, thresholds, lookback, profile, …) lives in **`metadata`**.

## What Changes

- **BREAKING**: Replace dense `component_event_markers[]` with sparse `component_events[]` using universal `event_type`: `point`, `span_start`, `span_end`, `source`.
- **Backend contract (component-agnostic top-level)**:
  - Required/generic: `time`, `event_type`, `role`, `side`, `component_id`, `instance_id`, `label`, `metadata`
  - Optional/generic: `tooltip`, `span_id`, `feature_family`, `source_timeframe`, `base_timeframe` (nullable; used by HTF hints and future non-RSI emitters—not RSI-specific)
  - **`metadata` only** for component-specific keys: `rsi_value`, `condition`, `params`, `threshold`, `lookback`, `profile`, etc.
- **Span semantics**: `span_end.time` = **last active blocked base bar** (not first inactive bar). `source` = rising edge on raw threshold (one per episode). Synthetic acceptance test required.
- **Extensible `role`**: v1 uses `entry_block` and `exit_signal`; contract reserves future roles (`setup`, `trigger`, `context_regime`, …) without frontend `component_id` branches.
- **Research emitters (this change = migration slice only)**: Refactor the two **existing** RSI emitters as proof of the contract—not as the product scope:
  - `rsi_lookback_extreme_blocker` → `source` + `span_start` / `span_end` per blocked run (HTF via `_align_completed_feature_to_base`).
  - `rsi_signal_exit` → `point`, `role: exit_signal`.
- **Documented emitter patterns** (follow-up changes, same contract): counter-candle blocker, EMA cross exit, HTF context gate, setup/trigger—see design mapping table.
- **Frontend rendering**: Map events to chart markers by **`event_type` + `role` + `side`** only; `component_id` tooltip-only. Optional span shading (background band between `span_start` and `span_end`) in v1 or follow-up—spec defines minimum marker rendering.
- **Legend / toggles**: Layer controls keyed by **`role`** (and optionally `event_type` visibility); no component-specific UI.
- **Deprecation**: Remove dense “one marker per blocked bar” trace requirement; HTF block runs become three event kinds instead of twelve identical markers.

**Non-goals (explicit)**

- No new emitters beyond migrating the two existing RSI components in **this** change (counter-candle, EMA exit, context gate, setup/trigger are **follow-ups**, not contract changes).
- No frontend condition recompute from candles; no HTF expand/collapse in browser.
- No changes to `chart-selected-trade-diagnostics-v1` trade price lines / trade detail panel (complementary Chart features).
- No Data Engine or backtest report schema changes.
- No `compressed` dense-bar fallback mode—semantic spans are the data model going forward.

## Capabilities

### New Capabilities

_(none — evolution of existing chart component events capability)_

### Modified Capabilities

- `workbench-chart-component-event-markers`: Replace marker-per-bar contract with universal semantic `component_events[]`, top-level alignment fields + `span_id`, component-specific data in `metadata`, span/source/point rules (incl. `span_end` on last active bar), partial-span window behavior; RSI emitters as first migration slice.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `execution/signal_trace.py` — new `ComponentEventData`, span run detection, RSI emitter refactor; blocker/exit trace helpers; pytest updates |
| **research_api** | `contracts/signal_trace.py`, `services/signal_trace_service.py` — rename/expose `component_events[]`; remove `component_event_markers[]` |
| **frontend** | `api/types.ts`, rename/refactor `chartComponentEventMarkers.ts` → semantic builder, `ChartPanel.tsx`, `WorkbenchContext.tsx`, `ChartMarkerLegend.tsx`, CSS, Vitest |
| **data_engine** | _none_ |

**Reference**: [`openspec/specs/workbench-chart-component-event-markers/spec.md`](../../specs/workbench-chart-component-event-markers/spec.md) (v1 dense markers, archived implementation in [`openspec/changes/archive/2026-05-30-chart-component-rsi-event-markers-v1/`](../../changes/archive/2026-05-30-chart-component-rsi-event-markers-v1/)). Complements Chart trade diagnostics in [`openspec/changes/chart-selected-trade-diagnostics-v1/`](../../changes/chart-selected-trade-diagnostics-v1/).
