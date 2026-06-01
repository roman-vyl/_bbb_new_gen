## 1. Research — event metadata

- [x] 1.1 Extend `_ema_bounce_metadata()` in `signal_trace.py` with full snapshot from trace at event index: `trend_active`, `in_touch_lookback`, `armed`, `raw_touch`, `pending_bounce`, `setup_allowed`, `touch_lookback_left` (plus existing bounce/EMA/trend fields)
- [x] 1.2 Confirm `metadata.event_name` is `trend_start` / `trend_break` on point events (no generic `Trend` dependency)
- [x] 1.3 Extend `test_ema_bounce_counter_setup_trace_and_events` to assert metadata keys on source, span_start, span_end, and trend point events — including `trend_active` and `in_touch_lookback` on bounce events
- [x] 1.4 Add regression assertion: entry masks / `setup_allowed` unchanged vs baseline fixture (metadata-only change)

## 2. Frontend — presentation helper

- [x] 2.1 Add `emaBounceCounterComponentEventPresentation.ts` with label map (`B{n} touch`, `B{n}▶`, `B{n}■`, `T+`, `T-`) and tooltip builder from metadata (include `trend_active`, `in_touch_lookback`, and separate `raw_touch` line)
- [x] 2.2 Wire `chartComponentEvents.ts` to apply formatter for `ema_bounce_counter_setup` (label + tooltip only; styling unchanged)
- [x] 2.3 Add `showSetup` filter to `buildComponentEventChartMarkers` / `buildComponentEventsForView`
- [x] 2.4 Add **Show setup** toggle to `ChartMarkerLegend.tsx` and state in `ChartPanel.tsx` (default on)
- [x] 2.5 Vitest: formatter labels/tooltips; setup toggle hides `role: setup`; styling still role/event_type-based

## 3. Verification

- [x] 3.1 `pytest tests/test_ema_pullback_signal_trace.py -k bounce_counter` (or targeted test file)
- [x] 3.2 `npm run test -- chartComponentEvents` in `frontend/`
- [ ] 3.3 Manual Workbench (refresh trace/report first — stale cache shows generic labels): variant with `ema_bounce_counter_setup` — markers show `B{n}` / `T±`, tooltip shows bounce/lookback/gate fields and clearly distinguishes `raw_touch` vs `in_touch_lookback`, **Show setup** toggles all `role: setup` markers off (including other setup components — acceptable v1)
- [x] 3.4 Verify HTF context EMA overlays unchanged (variant with `strategy.contexts`; no WorkbenchContext/signal_trace structural changes expected)
