## Why

Chart already shows trade entry/exit markers and per-bar signal trace in Bar Inspector, but users cannot **see on the candle series** when a component vetoed entry (e.g. `rsi_lookback_extreme_blocker`) or when an RSI exit rule would fire. RSI may be computed on the chart timeframe or on a higher timeframe (aligned to base bars via the feature pipeline); without chart markers, that causal link stays hidden in inspector text.

This change adds research-backed candle markers on the same signal-trace pipeline used for HTF aux overlays and trade diagnostics—no indicator recompute in the browser.

## What Changes

- **research (v1 emitters only):** Component-specific marker emitters for **existing** catalog components only:
  - `rsi_lookback_extreme_blocker` → `role: entry_block`
  - `rsi_signal_exit` → `role: exit_signal`
  - Research owns component semantics; no generic “all RSI components” emitter framework in v1.
- **research_api + frontend (generic contract):** `component_event_markers[]` is a **component-agnostic** payload. Future components can reuse the same fields without contract changes; adding new emitters is **out of v1 scope**.
- **Generic marker fields** (normative): `time`, `role`, `side`, `component_id`, `instance_id`, `feature_family`, `source_timeframe`, `base_timeframe`, `rsi_value`, `condition`, `params`, `label` (+ optional tooltip/metadata).
- **HTF alignment (backend):** events on base/chart index after feature alignment; one HTF RSI condition → many base/chart markers; frontend does not expand HTF spans.
- **Data vs rendering:**
  - *Data:* one event record per blocked/active chart bar (full HTF runs enumerated in trace).
  - *Rendering v1:* **`dense`** — one chart marker per trace event. **`compressed`** display deferred (frontend-only, trace unchanged).
- **frontend (Chart):** Render markers from generic fields (`role`, `side`, `time`, `label`/metadata). **MUST NOT** branch on `component_id` for color/shape/position semantics (`component_id` MAY appear in tooltip only).

**Non-goals**

- No `data_engine/` changes.
- No browser-side RSI, blocker, or exit recomputation from candles.
- No frontend HTF expansion or trace collapse.
- No **`compressed`** rendering mode in v1.
- **No v1 emitters** for other components (`counter_candle_blocker`, EMA exits, context gates, future RSI variants)—contract is ready; implementation is not.
- No change to backtest execution, report schema version, or trade-record fields.
- No Composer authoring UX for marker styling.
- No replacement of Bar Inspector / trade diagnostics panels.

## Capabilities

### New Capabilities

- `workbench-chart-component-event-markers`: Generic `component_event_markers[]` on signal trace; v1 research emitters for `rsi_lookback_extreme_blocker` and `rsi_signal_exit`; dense chart rendering from `role`/`side`/`time`/`label`.

### Modified Capabilities

- _(none)_

## Impact

| Layer | Scope |
|-------|--------|
| **research** | v1 emitters for two RSI components; `signal_trace.py`, blocker/exit trace helpers, pytest |
| **research_api** | Generic `ComponentEventMarker` contract; `signal_trace_service.py` mapping |
| **frontend** | Component-agnostic marker builder; `ChartPanel.tsx`, `WorkbenchContext`, types, Vitest (no `component_id` render branches) |
| **data_engine** | _none_ |

**Depends on**: Phase 5 signal trace + feature pipeline (`add_feature_columns_from_plan`, `_align_completed_feature_to_base`).

**Reference docs**: [`docs/frontend/implementation_plan.md`](../../../docs/frontend/implementation_plan.md), [`research/strategies/ema_pullback/components/blockers.py`](../../../research/strategies/ema_pullback/components/blockers.py), [`research/strategies/ema_pullback/components/exits.py`](../../../research/strategies/ema_pullback/components/exits.py).
