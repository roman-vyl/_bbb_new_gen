## 1. Contracts and types (generic, component-agnostic)

- [x] 1.1 Add `ComponentEventMarker` to `research_api/contracts/signal_trace.py` with generic fields: `time`, `role`, `side`, `component_id`, `instance_id`, `feature_family`, `source_timeframe`, `base_timeframe`, `rsi_value`, `condition`, `params`, `label`, optional `tooltip`
- [x] 1.2 Extend `SignalTraceBundle` with `component_event_markers: list[ComponentEventMarker]` default `[]`
- [x] 1.3 Mirror generic types in `frontend/src/api/types.ts` (no component-specific marker types in v1)

## 2. Research — v1 emitters only (two components)

- [x] 2.1 Add `rsi_signal_exit_trace(...)` in `components/exits.py` (component-specific; aligned RSI column)
- [x] 2.2 Add v1 emitters in `execution/signal_trace.py`: **`rsi_lookback_extreme_blocker`** → `role: entry_block`; **`rsi_signal_exit`** → `role: exit_signal`; populate full generic contract fields
- [x] 2.3 Do **not** add emitters for other components in v1; unsupported components emit nothing
- [x] 2.4 `build_component_event_markers` — one record per active base index on aligned columns; wire into `build_signal_trace_from_spec` and `slice_signal_trace`
- [x] 2.5 pytest: generic field shape; both v1 emitters; **HTF `1h` on `5m` → twelve records**; empty when no v1 components; no markers for `counter_candle_blocker`-only variant

## 3. research_api — mapping

- [x] 3.1 Map research trace → generic `component_event_markers[]` in `signal_trace_service.py` (pass-through, no field stripping)
- [x] 3.2 pytest/API test: payload shape matches generic contract for RSI blocker fixture

## 4. Frontend — component-agnostic dense rendering

- [x] 4.1 Create `chartComponentEventMarkers.ts` — style from **`role` + `side` + `time` + `label`** only; **`component_id` tooltip-only**; no `component_id` render branches
- [x] 4.2 Dense mode: 1:1 trace event → `SeriesMarker`; merge with trade markers; filter to view window
- [x] 4.3 `ChartPanel.tsx`: legend/toggles by **`role`** (`entry_block` / `exit_signal`)
- [x] 4.4 `WorkbenchContext.tsx`: role layer toggles; stale/window semantics aligned with HTF aux overlays
- [x] 4.5 Chart hint when `source_timeframe` ≠ `base_timeframe` or markers stale
- [x] 4.6 Vitest: role-based styling; assert no `component_id` switch in render path; dense N→N; toggles by role; no HTF expansion

## 5. Manual verification

- [x] 5.1 `pytest` marker/emitter tests
- [x] 5.2 `npm test` frontend marker tests
- [ ] 5.3 `rsi_lookback_extreme_blocker` on base TF — dense entry_block markers; tooltip shows `component_id`
- [ ] 5.4 `rsi_lookback_extreme_blocker` `1h` on `5m` — twelve dense markers; trace unchanged when layer off
- [ ] 5.5 `rsi_signal_exit` — dense exit_signal markers; distinct from trade SIG markers
