## Context

Workbench Chart currently mixes four concerns in one reactive surface (`WorkbenchContext` + `ChartPanel` effects): market render-window slicing, viewport control, trace fetch/cache orchestration, and interaction interpretation (`user pan`, `trade focus`, restore guards). This creates non-deterministic ordering under load:

1. User pan reaches safe zone and triggers render-window shift.
2. Heavy `setData` for candles and overlays commits before viewport restore.
3. `chartWindowKey` changes trigger trace decisions and possibly fetch bursts.
4. Chart and viewport effects race with each other via refs/RAF guards.

Observed result is not a permanent teleport but a visible intermediate frame (`target window -> transient wrong viewport -> restored viewport`) plus pan-time trace request storms.

Constraints:
- Workbench must remain responsive in production while refactor is introduced incrementally.
- Existing BFF signal trace contract remains valid; no mandatory API break.
- HTF context overlays and component markers must keep their current feature behavior and cache semantics.
- Rollback is handled by normal git workflow (branch/commit/reset), not by keeping legacy chart runtime as supported fallback.

## Goals / Non-Goals

**Goals:**
- Establish explicit ownership boundaries for chart runtime via controllers.
- Make pan interaction deterministic: no render-window swap while active drag is in progress.
- Ensure viewport commands come from one policy owner and are not emitted by trace/display updates.
- Reduce pan-time request amplification by separating interaction lifecycle from trace fetch scheduling.
- Deliver a direct cutover to controller-owned runtime without compatibility adapter around legacy orchestration.

**Non-Goals:**
- Rewriting Lightweight Charts integration or replacing charting library.
- Redesigning research-side signal semantics, component event contract, or HTF calculation sources.
- Introducing cross-layer architectural changes outside frontend chart runtime orchestration.
- Achieving full TradingView-style seamless infinite pan during drag in the first iteration.

## Decisions

### Decision 1: Introduce controller pipeline and a thin renderer

Adopt a layered runtime:

- `RunDataController`: selected run/variant and report payload.
- `MarketDataStore`: full cached market bundle for run+variant.
- `RenderWindowController`: sliding window indices, interaction mode, pending shift.
- `TraceDisplayController`: display cache coverage, chunk scheduling, merge/slice.
- `ChartViewModel`: pure derivation of chart-ready series/markers/overlays/loading flags.
- `ViewportController`: single-owner viewport command state machine.
- `ChartRenderer` (`ChartPanel`): imperative adapter only (`setData`, markers, execute viewport command).

Rationale: existing bugs come from multi-owner orchestration spread across React effects/refs. Controller boundaries make event order explicit and testable.

Alternative considered: keep current architecture and add more guards around `ChartPanel` refs/RAF sequencing. Rejected because it reduces symptom frequency but does not remove multi-owner coupling.

### Decision 1b: No compatibility adapter over legacy orchestration

The refactor will not preserve old `WorkbenchContext`/`ChartPanel` orchestration behavior as a supported runtime path. Temporary helper code is allowed only as local extraction scaffolding, but final runtime ownership must fully move to controllers before completion.

Rationale: legacy behavior is the broken model under diagnosis; parity with old pan/viewport behavior is not a design target.

Alternative considered: keep a long-lived adapter/fallback path and progressively route behavior behind runtime flags. Rejected because dual runtime ownership prolongs race conditions and increases maintenance/debug complexity.

### Decision 2: Defer render-window shift until pan idle

When user drags into safe-zone boundary:
- Record `pendingShift(direction, anchorTime)` only.
- Keep current data window during active pan.
- Commit a single shift after pan idle debounce (300-500ms).

Rationale: `setData` on 50k bars is heavy and cannot be treated as atomic with viewport restore. Avoiding data swap during active drag removes the visible transient frame.

Alternative considered: double-buffer/offscreen swap to keep intra-drag seamless shift. Deferred for later due to complexity and uncertain performance gains.

### Decision 3: Explicit viewport command policy

`ViewportController` is the only owner that can emit:
- `focusTrade(entryTime)`
- `restoreAfterWindowSwap(anchorTime)`
- `preserveUserRange()`
- `noViewportChange()`

Rules:
- `tradeSelected` may emit focus.
- `userPanStart` cancels pending focus.
- `traceReady` always emits `noViewportChange`.
- `windowSwapCommitted` emits restore or focus based on active intent.

Rationale: avoids hidden viewport writes from trace/overlay effects and removes current guard-matrix complexity in `ChartPanel`.

Alternative considered: keep viewport logic in `ChartPanel` but refactor to fewer refs. Rejected because ownership remains ambiguous and side effects stay co-located with rendering.

### Decision 4: Keep trace display updates independent from viewport and pan-time churn

`TraceDisplayController` consumes render-window bounds but does not control viewport. Cache coverage checks, fetch scheduling, and slice updates are decoupled from viewport transitions.

Additional policy:
- While pan is active, avoid spawning multiple overlapping window fetches from transient boundary oscillations.
- Coalesce to latest requested uncovered window once pan becomes idle, unless a cache hit already satisfies display slice.

Rationale: current storms are caused by coupling trace decisions to rapidly changing window state.

Alternative considered: throttling API calls only. Rejected as partial mitigation; still leaves ownership overlap and stale-state races.

### Decision 5: Preserve full BFF/report data surface in ChartViewModel

Controller refactor MUST preserve all current data layers consumed by Workbench chart runtime. `ChartViewModel` is a transformation boundary, not a narrowing boundary.

The new runtime must continue to ingest and expose:
- Run/report selection and variant/report diagnostics surfaces.
- Trade records and selected-trade diagnostics/attribution fields.
- Market bundle candles and anchor-stack EMA overlays.
- Aux BFF EMA overlays for exit-rule chart-timeframe lines.
- Signal trace (`times`, `meta`, long/short lanes, internals).
- HTF context trace series and metadata by selected `context_overlay_ref`.
- Context consumption trace diagnostics.
- Component semantic events across roles (`entry_block`, `exit_signal`, `setup`, and future roles).
- Display/session cache behavior for markers/HTF and lane/diagnostics pan-back restore.

Rationale: architecture ownership changes must not drop existing analytical capabilities currently exposed in Workbench.

Alternative considered: reduce first-cut scope to candles + minimal markers only. Rejected because this would silently regress diagnostics and inspector features and create a false "stable" milestone.

### Decision 6: Use explicit interaction adapter, not range-change heuristics

Active user interaction MUST be produced by a dedicated interaction adapter layer that normalizes chart/UI events into explicit controller events:
- `pointerdown`, `pointermove`, `pointerup`
- `wheel` / touchpad scroll
- programmatic viewport command start/commit
- visible-range-changed notifications

`RenderWindowController` MUST consume these normalized events and MUST NOT infer interaction mode from `subscribeVisibleLogicalRangeChange` alone.

Rationale: visible range changes have many causes (drag, wheel, restore, focus, resize, `setData` effects); heuristic classification reintroduces the old race class.

Alternative considered: keep only visible-range subscription and infer active-pan via thresholds/timers. Rejected as fragile and non-deterministic.

### Decision 7: Restore anchor is time-based, not logical-index-based

Window-swap restore anchor MUST be time-based:
- preferred anchor: pre-swap visible-time center;
- optional higher-priority anchor: pointer/cursor time anchor when available.

Restore MUST NOT rely on pre-swap logical indexes because index frames differ across render windows.

Rationale: logical-index restore causes micro-teleports after window swaps.

Alternative considered: restore by logical index with tolerance. Rejected because index identity is window-local, not global.

### Decision 8: Commit policy is pointerup-first with idle fallback

For active pointer drag:
- commit pending shift on `pointerup` when lifecycle is available.

Fallback policy:
- commit via idle debounce (300-500ms) for wheel/touchpad interactions or missing `pointerup`.

Rationale: keeps interaction responsive while preserving anti-storm guarantees.

Alternative considered: idle-only commit for all input modes. Rejected due to sluggish UX for drag completion.

### Decision 9: Trace prefetch policy for v1 is strict idle-only

During active pan, trace controller MUST NOT start network prefetch for uncovered pending windows. The only active-pan updates allowed are cache-hit display slices for the committed window.

Trace fetch for uncovered range starts only after committed shift (pointerup/idle commit).

Rationale: v1 priority is deterministic stability and eliminating fetch storms.

Alternative considered: allow one in-flight prefetch during active pan. Rejected for v1 to reduce race surface.

### Decision 10: Temporary extraction helpers must not survive final cut

Temporary helper code is allowed during implementation to extract responsibilities, but final merged runtime MUST have one source of truth for orchestration ownership.

Final state MUST NOT leave legacy multi-owner `ChartPanel` refs/effects active alongside new controllers.

Rationale: dual runtime truth is a direct path to regression and debugging ambiguity.

## Risks / Trade-offs

- [Risk] Deferred shift changes user feel near window edges (requires release/idle). -> Mitigation: explicit chart hint (`Release to load adjacent window`) and configurable debounce.
- [Risk] Direct cutover can surface integration defects quickly. -> Mitigation: implement in tight vertical slices with deterministic acceptance gates and reproducible heavy-run scenarios before merge.
- [Risk] Regressions in HTF/context overlays due to state ownership move. -> Mitigation: mandatory HTF regression checklist in tasks and cache-slice parity checks.
- [Risk] Lanes/diagnostics readiness might lag if trace coalescing is too aggressive. -> Mitigation: separate display cache and session bundle cache logic retained; instrument queue/dequeue decisions.
- [Risk] Large refactor may hide performance regressions in non-pan flows. -> Mitigation: add perf counters per controller event (`setData`, window commit latency, fetch count/latency, restore latency) and compare baseline.

## Migration Plan

1. **Baseline lock before edits**
   - Capture `git status`, create working branch `chart-runtime-controller-cutover`, and record starting commit hash.
   - Capture heavy-run debug counters before refactor (`setData`, trace fetch, focus/restore counters) as comparison baseline.

2. **Produce ownership map from current code**
   - Enumerate current ownership in `WorkbenchContext` and `ChartPanel`.
   - Map target ownership transfers to `RenderWindowController`, `ViewportController`, `TraceDisplayController`, and `ChartViewModel`.
   - Separate chart-runtime ownership from shell/report-selection ownership that remains outside runtime controllers.

3. **Create controller modules as new source of truth**
   - Implement controller modules and runtime state contracts (`committedWindow`, `pendingShift`, interaction state, viewport FSM, committed-window trace scheduling, cache slicing, view-model projection).
   - Keep controllers authoritative; do not wrap legacy decision paths as permanent runtime logic.

4. **Perform destructive ownership cutover**
   - Replace owner paths, do not add parallel owner paths.
   - Wire Workbench shell as input provider and controller runtime as decision layer.
   - Keep `ChartPanel` as renderer/event-emitter only.

5. **Delete old owner logic immediately per vertical slice**
   - After render-window ownership cut: remove immediate shift decisions from old pan handlers and legacy render-window mutations in renderer.
   - After viewport ownership cut: remove old pending-restore/seq/guard ownership logic and all non-controller focus/restore decision sources.
   - After trace ownership cut: remove fetch decisions from pending/transient window states and key-churn side effects.
   - After renderer cut: remove `shouldShift/shouldFetch/shouldFocus/shouldRestore` branches.

6. **Run final cleanup audit before acceptance**
   - Audit code/diff for legacy owner artifacts and classify each hit as removed or non-owner plumbing.
   - Red flags include: active legacy refs/guards as decision owners, direct viewport control outside `ViewportController`, direct trace fetch from pending state, active-drag boundary causing `setData`, old immediate-shift path.
   - Merge only when no dual orchestration ownership remains.

7. **Acceptance and merge**
   - Run heavy-run acceptance checklist (data-surface + invariants).
   - Merge only after invariant-driven acceptance and cleanup audit pass.

Rollback strategy:
- Use git branch/commit reset workflow; do not maintain legacy runtime as a supported fallback mode in production code.

## Open Questions

- Is current `chartWindowKey` still the right identity boundary, or should trace display/session caches move to explicit window revision tokens from `RenderWindowController`?
- Do we need an ADR for controller orchestration boundaries, or can this remain OpenSpec-only within frontend scope?
