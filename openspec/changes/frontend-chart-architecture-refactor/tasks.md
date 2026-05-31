## 0. Baseline lock and branch setup

- [x] 0.1 Capture `git status` snapshot before any implementation edits.
- [x] 0.2 Create working branch `chart-runtime-controller-cutover` (user branch: `BIG-frontend-refactoring`).
- [x] 0.3 Record starting commit hash for rollback/reference (`0bc6e070`).
- [ ] 0.4 Capture heavy BTCUSDT 5m baseline debug counters (`setData`, trace fetch, focus/restore related counters) — procedure in `implementation/baseline.md`.

## 1. Ownership map before coding

- [x] 1.1 Enumerate current runtime ownership in `WorkbenchContext` (window/fetch/focus/trace/report wiring).
- [x] 1.2 Enumerate current runtime ownership in `ChartPanel` (viewport refs/guards, pan decisions, renderer side-effects).
- [x] 1.3 Define explicit move-map: what goes to `RenderWindowController`, `ViewportController`, `TraceDisplayController`, `ChartViewModel`, and what remains in shell/report selection.

## 2. Controller modules as source of truth

- [x] 2.1 Introduce controller contracts/types for `RunDataController`, `MarketDataStore`, `RenderWindowController`, `TraceDisplayController`, `ViewportController`, and `ChartViewModel`.
- [x] 2.2 Implement controller state ownership (`committedWindow`, `pendingShift`, interaction state, viewport FSM, committed-window trace scheduling).
- [x] 2.3 Wire chart runtime to controller-owned orchestration path as primary implementation (no long-lived compatibility adapter).

## 3. Committed window and pan lifecycle invariants

- [x] 3.1 Implement active pan lifecycle: boundary crossing during drag records `pendingShift` only and does not mutate committed window.
- [x] 3.2 Ensure pending shift does not publish new `chartWindowKey`; trace orchestration is keyed only by committed window.
- [x] 3.3 Implement commit policy: `pointerup` commit for pointer lifecycle, idle debounce fallback (300-500ms) for wheel/touchpad or missed `pointerup`.
- [x] 3.4 Implement time-based restore anchor (visible-time center or cursor-time anchor) and forbid logical-index-based restore as primary method (slice-1.1: `restoreVisibleRangeByTimeAnchor` primary path).

## 4. ViewportController as single owner

- [x] 4.1 Move all viewport command emission to `ViewportController`; remove all other viewport command sources.
- [x] 4.2 Encode explicit rules for `tradeSelected`, `userPanStart`, `windowSwapCommitted`, and enforce hard rule `traceReady -> noViewportChange`.
- [x] 4.3 Ensure trade focus commands are suppressed while `user_panning` is active.
- [x] 4.4 Remove legacy policy-owner refs/guards (`pendingViewportRestoreRef`, `viewportCommandSeqRef`, stale RAF policy guards) or demote them to non-owner plumbing only.

## 5. TraceDisplayController committed-window orchestration

- [x] 5.1 Make trace scheduling read committed window only; transient pending windows must not trigger fetch.
- [x] 5.2 Implement pan-time request coalescing so oscillating boundary intents do not create fetch storms.
- [x] 5.3 Enforce strict idle-only fetch for uncovered pending windows during active pan (no active-pan prefetch, except cache-hit display updates for committed window).
- [ ] 5.4 Ensure cache hit and cache merge update markers/HTF overlays only, without viewport side effects.
- [ ] 5.5 Preserve pan-back behavior: returning to cached trace coverage does not trigger unnecessary fetch.
- [ ] 5.6 Remove legacy trace-fetch decisions caused by pending state or chartWindowKey churn outside committed-window policy.

## 6. Thin ChartRenderer / ChartPanel

- [ ] 6.1 Refactor renderer to apply only supplied `ChartViewModel` data and supplied viewport command.
- [x] 6.2 Remove renderer-side business decisions: `should shift`, `should fetch trace`, `should focus trade`, `should restore viewport` (immediate pan shift path removed).
- [x] 6.3 Introduce explicit interaction adapter that normalizes pointer/wheel/programmatic/range-change events for controllers.
- [ ] 6.4 After each cutover slice, delete old owner paths immediately (do not leave dormant "temporary" owner branches).
- [ ] 6.5 Ensure final diff leaves one orchestration truth only (no active coexistence of old ChartPanel multi-owner effects and new controllers).

## 7. Boundaries and non-goals enforcement

- [ ] 7.1 Verify no changes are introduced in `data_engine` for this refactor.
- [ ] 7.2 Verify no trading/research strategy semantics or signal/component event semantics are changed.
- [ ] 7.3 Verify no backend trace-calculation optimization is included in this scope.

## 8. Cleanup audit (must-pass before acceptance)

- [ ] 8.1 Audit for `pendingViewportRestoreRef` and confirm no policy ownership remains there.
- [ ] 8.2 Audit for `userPanActiveRef` and confirm it is not a decision-owner path (or remove).
- [ ] 8.3 Audit for `viewportCommandSeqRef` and stale RAF viewport guards; remove policy ownership usage.
- [ ] 8.4 Audit for direct focus/restore outside `ViewportController`; remove or justify as non-owner plumbing.
- [ ] 8.5 Audit for direct trace fetch from pending/uncommitted states; remove.
- [ ] 8.6 Audit for `setData` triggered by active drag boundary; remove immediate-shift path.
- [ ] 8.7 Audit for old immediate `maybeShiftWindowForVisibleRange`-style ownership path; remove.
- [ ] 8.8 For any retained legacy symbol names, document why they are renderer/DOM plumbing only and not orchestration ownership.

## 9. Acceptance (heavy-run invariant proof)

- [ ] 9.1 Validate heavy BTCUSDT 5m run opens successfully and initial component events appear without manual pan.
- [ ] 9.2 Validate HTF/context overlays are visible on initial load and stay stable across pan and deferred commit.
- [ ] 9.3 Validate fast pan May -> Feb/Jan does not produce visible May -> Feb -> May -> Feb flash.
- [ ] 9.4 Validate active pan has no `setData` storm and no trace-fetch storm.
- [ ] 9.5 Validate trade focus is not applied while user pan is active.
- [ ] 9.6 Validate after idle/release at most one committed window shift is applied per accepted pending shift.
- [ ] 9.7 Validate late trace arrival updates markers/HTF overlays only and does not move viewport.
- [ ] 9.8 Validate pan-back into cached trace range does not trigger unnecessary fetch.
- [ ] 9.9 Validate pending shift does not publish new `chartWindowKey` and committed shift publishes exactly one new `chartWindowKey`.
- [ ] 9.9a Validate pointerup commit path is used for pointer-drag lifecycle and idle fallback is used for wheel/touchpad or missed pointerup.
- [ ] 9.9b Validate viewport restore anchor is time-based (visible center/cursor time) and not logical-index-based.
- [ ] 9.10 Validate run/report layer remains intact (`/api/research/runs`, `/api/research/runs/{run_id}`, variant/report metrics+diagnostics, `component_counters`, `trade_records`).
- [ ] 9.11 Validate trade/chart layer remains intact (markers, entry/exit fields, selected-trade navigation+diagnostics, context attribution, setup diagnostics, quality fields when present).
- [ ] 9.12 Validate market bundle layer remains intact (`/api/market/chart-bundle` full-range OHLCV + anchor-stack EMA roles/periods).
- [ ] 9.13 Validate extra EMA overlay layer remains intact (`/api/market/indicators/ema`) and remains separate from HTF trace overlays.
- [ ] 9.14 Validate signal-trace meta and lanes remain intact (`times`, `meta.component_ids.*`, `meta.setup_params`, `meta.trigger_params`, `meta.blocker_instances`, long/short lane fields, `internals`).
- [ ] 9.15 Validate HTF trace layer remains intact (`htf_context.state/fast/anchor/slow/meta`) and pending shift never re-slices HTF to an uncommitted window.
- [ ] 9.16 Validate `context_consumption_trace[]` remains available for inspector/diagnostics and never drives viewport movement.
- [ ] 9.17 Validate `component_events[]` full contract remains available (`event_type`, `role`, `side`, ids, labels, timeframe/meta fields) and renderer remains role-driven for future components.
- [ ] 9.18 Validate cache behavior parity: market bundle full-range cache, render-window slicing, display cache for events/HTF, session bundle cache for lanes/diagnostics/pan-back, cache-hit display updates without network fetch.
