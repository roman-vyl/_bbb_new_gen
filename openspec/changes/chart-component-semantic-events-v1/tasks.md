## 1. Contract and types

- [ ] 1.1 Add `ComponentEvent` to `research_api/contracts/signal_trace.py` — top-level: `time`, `event_type`, `role`, `side`, `component_id`, `instance_id`, `label`, `tooltip`, `span_id`, `feature_family`, `source_timeframe`, `base_timeframe`, `metadata`; remove `component_event_markers`
- [ ] 1.2 Map `component_events` in `research_api/services/signal_trace_service.py`; remove marker mapping
- [ ] 1.3 Add frontend `ComponentEvent` types in `frontend/src/api/types.ts`; HTF hints read top-level `source_timeframe` / `base_timeframe`

## 2. Research emitters

- [ ] 2.1 Add `ComponentEventData` dataclass, `_contiguous_blocked_runs()`, and `_rising_edge_indices()` helpers in `signal_trace.py`
- [ ] 2.2 Implement `build_component_events()` — replace `build_component_event_markers()`
- [ ] 2.3 RSI blocker emitter: `source` (raw threshold rising edge) + `span_start` / `span_end` per run; **`span_end.time = last blocked bar`**; shared top-level `span_id`; RSI keys in `metadata` only; timeframes at top level
- [ ] 2.4 RSI exit emitter: `event_type: point`, `role: exit_signal`
- [ ] 2.5 Wire `build_component_events` into `build_signal_trace_from_spec` and `slice_signal_trace`; delete old marker builder

## 3. Research tests

- [ ] 3.1 Synthetic source test: raw `F T T T F F T T` → exactly **two** `source` events (rising edges), not one per raw-T bar
- [ ] 3.2 Synthetic span test: `span_end.time` equals **last blocked** index, not first inactive bar after run
- [ ] 3.3 HTF 1h block on 5m → span pair + source (not 12 markers); top-level `source_timeframe` / `base_timeframe`
- [ ] 3.4 Exit point test for `event_type: point`
- [ ] 3.5 Slice test: window inside block may return only `span_end` — assert no error, no synthetic span_start
- [ ] 3.6 Update `tests/test_research_api_signal_trace.py` for full top-level contract shape

## 4. Frontend rendering

- [ ] 4.1 Create `chartComponentEvents.ts` (replace `chartComponentEventMarkers.ts`) — style by `event_type` + `role` + `side`; no `component_id` branching
- [ ] 4.2 Update `WorkbenchContext.tsx` — `chartDisplayComponentEvents`, stale freeze, role toggles
- [ ] 4.3 Update `ChartPanel.tsx` — merge trade + component event markers; update hints
- [ ] 4.4 Update `ChartMarkerLegend.tsx` and CSS — role + event_type legend (no RSI/catalog labels); remove “X-RSI” copy
- [ ] 4.5 Vitest: render styles keyed by event_type; assert no component_id in style switch

## 5. Cleanup

- [ ] 5.1 Remove `chartComponentEventMarkers.ts` and `.test.ts` after migration
- [ ] 5.2 Grep repo for `component_event_markers` / `ComponentEventMarker` — zero remaining references

## 6. Verification

- [ ] 6.1 `pytest tests/test_ema_pullback_signal_trace.py tests/test_research_api_signal_trace.py -q`
- [ ] 6.2 `npm test` in `frontend/` for chart component event tests
- [ ] 6.3 Manual Workbench: RSI blocker shows source + span boundaries (not dense bar spam)
- [ ] 6.4 Manual Workbench: HTF 1h blocker on 5m — one span start/end pair; hint uses top-level timeframes
- [ ] 6.5 Manual Workbench: scroll window **into middle of block** — only `span_end` visible is OK (partial span, not a bug)
- [ ] 6.6 Manual Workbench: `rsi_signal_exit` point markers; tooltips show `component_id` + metadata
