## Why

`frontend/src/shared/context/WorkbenchContext.tsx` is currently a large provider/orchestrator that owns shell, report, Composer, and chart-runtime responsibilities in one file. The chart/runtime pipeline is working, but it is tightly mixed with provider glue; moving individual effects piecemeal is risky because it can create two active owners for market windows, render-window indices, viewport commands, trace caches, or the final chart model.

This proposal is grounded in `docs/workbench-chart-runtime-analysis.md`, which maps the current `main` pipeline, public context surface, `ChartPanel` contract, lifecycle ordering, identity keys, smoke/debug contract, deletion inventory, single-owner matrix, and test gaps.

## What Changes

- Introduce a new modular Workbench chart runtime pipeline in the frontend layer, built beside the current working pipeline.
- Define explicit `ChartRuntimeInput`, `ChartRuntimeOutput`, and runtime debug snapshot contracts.
- Keep the current `main` chart pipeline as the working reference until parity and smoke gates pass.
- Switch the Chart tab through staged owner-domain cutover slices (6.3A–6.3F) only after parity and per-slice smoke gates pass — not a single atomic multi-owner cutover.
- Remove the old chart/runtime state, refs, effects, callbacks, and compatibility fields from `WorkbenchContext.tsx` after cutover.
- Keep `ChartPanel` as the imperative Lightweight Charts renderer; the new runtime supplies data, commands, and dispatch contracts but does not own chart library calls.
- Preserve current frontend behavior for market loading, render windows, viewport commands, trace/chart-events display, HTF context overlays, markers, and pan/edge behavior.
- Add explicit single-owner and deletion gates so no mutable chart domain remains permanently dual-owned.

## Capabilities

### New Capabilities

- `workbench-chart-runtime-v2`: Defines the modular Workbench Chart runtime v2 contract, build-beside strategy, cutover gates, deletion requirements, debug snapshot, smoke gates, and single-owner rules for replacing the current chart/runtime pipeline in `WorkbenchContext.tsx`.

### Modified Capabilities

- None. Existing capabilities such as `workbench-chart-controller-orchestration`, `workbench-chart-sliding-window`, `workbench-chart-market-resource-cache`, `workbench-trace-window-chunk-cache`, `workbench-chart-htf-context-overlays`, `research-api-chart-events`, and `pipeline-debug-instrumentation` remain behavioral constraints for this change. This change adds a new replacement/cutover capability rather than rewriting those delivered contracts.

## Impact

- Affected layer: `frontend`.
- Primary affected files during implementation: `frontend/src/shared/context/WorkbenchContext.tsx` and new runtime modules under `frontend/src/features/workbenchChartRuntime/`.
- Renderer boundary: `frontend/src/features/chart/ChartPanel.tsx` remains the imperative renderer and should not be changed before its contract is defined and reviewed.
- Existing helper/runtime modules expected to be reused or wrapped include market loading/view/cache helpers, render/viewport controllers, trace display/cache/network helpers, chart-events helpers, aux overlay helpers, strategy context helpers, and trade lookup helpers.
- No backend, research, data_engine, trading logic, or API contract changes are in scope.
- Non-goals:
  - Do not rewrite Composer.
  - Do not rewrite the report loader.
  - Do not rewrite `ChartPanel` as part of the runtime proposal.
  - Do not change trading logic.
  - Do not change backend/data APIs.
  - Do not implement a permanent dual-pipeline fallback.
  - Do not perform a big-bang cutover that enables all runtime v2 production owners at once.
  - Do not start runtime implementation before this OpenSpec is approved.

Success criteria:

- The new runtime produces a complete authoritative `ChartRuntimeOutput`.
- Smoke scenarios from `docs/workbench-chart-runtime-analysis.md` pass.
- The Chart tab works through the new runtime after staged owner-domain cutover (6.3A–6.3F) and Phase 6.4 smoke matrix.
- Old chart/runtime code is physically removed from `WorkbenchContext.tsx`.
- `WorkbenchContext.tsx` is materially smaller, targeting at least 1000 fewer lines from the 3096-line baseline unless review approves a different target.
- No mutable chart domain has two active owners after cutover.
