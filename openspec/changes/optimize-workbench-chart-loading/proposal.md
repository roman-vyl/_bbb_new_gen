## Why

Workbench Chart currently has a fast candle pipeline and a slower event pipeline: candles are sliced locally from a full frontend market cache, while component events and HTF context are loaded through exact-window dense `/signal-trace` recomputation. This causes visible event lag/flicker at render-window boundaries and makes chart-heavy IO start too early for non-chart tabs.

This change follows `docs/research/24_workbench_chart_loading_roadmap.md` and defines a review-gated roadmap: each implementation step must stop for review before the next step begins.

## What Changes

- Add instrumentation and baseline diagnostics for chart-heavy IO, trace cache coverage, chart `setData`, marker updates, duplicate/superseded trace requests, and key user scenarios.
- Gate chart-heavy IO so run/report loading remains eager, but `chart-bundle` and initial `signal-trace` do not start until Chart is activated or an explicit background prefetch policy allows it.
- Add abortable frontend request plumbing for market and trace fetches. This is UI/network stale-response protection, not guaranteed backend CPU cancellation.
- Split Workbench responsibilities so shell/report state does not subscribe to chart display revisions, while preserving existing API, cache, and render-window semantics.
- Introduce partial/stale trace display state so component events and HTF overlays do not fully disappear when a new committed render window is not yet fully covered.
- Make `missingRange()` part of trace scheduling using normalized trace display chunks, without active-pan prefetch in the first pass.
- Split frontend market caching into candle and overlay resource layers so variant switches do not refetch candles when symbol/timeframe/range are unchanged.
- Propose a later sparse/materialized `chart-events` backend product so chart markers and HTF display no longer depend on dense `/signal-trace`.
- Require a review stop after each PR slice before starting the next slice.

No breaking change is intended for existing report artifacts, current `/signal-trace` consumers, or Data Engine candle storage.

## Capabilities

### New Capabilities

- `workbench-chart-lazy-activation`: Chart-heavy market and trace IO starts only after chart activation or an explicit background prefetch policy.
- `workbench-chart-market-resource-cache`: Candles and overlays are cached as separate frontend resources so variant switches can reuse candles.
- `workbench-chart-events-api`: Sparse/materialized chart event data can serve chart markers and HTF display independently from dense signal trace diagnostics.
- `workbench-chart-review-gated-rollout`: Implementation is sliced into PR-sized phases with a mandatory review stop after each phase.

### Modified Capabilities

- `pipeline-debug-instrumentation`: Add chart load, cache coverage, marker, and duplicate/superseded request diagnostics for baseline and verification.
- `workbench-chart-controller-orchestration`: Refine ownership so shell/report state and chart data runtime do not force unrelated rerenders while preserving controller boundaries.
- `workbench-trace-window-chunk-cache`: Move from exact-window-oriented display scheduling toward normalized chunks, missing-range scheduling, and partial/stale display behavior.
- `signal-trace-request-coordinator`: Extend request identity, supersede, abort/stale-response handling, and in-flight ledgers for trace display ranges.
- `workbench-chart-sliding-window`: Preserve current candle window behavior while ensuring chart-heavy IO gating and trace display changes do not alter pan/trade semantics.
- `workbench-chart-htf-context-overlays`: Preserve HTF overlay sourcing and stale/partial behavior while trace display state and chunk scheduling change.

## Impact

- Affected layers: `frontend` first; `research_api` only for the later sparse/materialized chart events phase.
- Likely frontend modules: `frontend/src/shared/context/WorkbenchContext.tsx`, `frontend/src/api/client.ts`, `frontend/src/features/chart/runtime/*`, `frontend/src/features/chart/signalTraceDisplayCache.ts`, `frontend/src/features/chart/signalTraceBundleSessionCache.ts`, `frontend/src/features/chart/marketDataCache.ts`, `frontend/src/features/chart/ChartPanel.tsx`.
- Likely backend modules for the later phase: `research_api/routers/research_runs.py`, `research_api/services/signal_trace_service.py`, new chart-events service/contracts, and related tests.
- Existing contracts to preserve until explicitly changed: `/api/research/runs`, `/api/research/runs/{run_id}`, `/api/market/chart-bundle`, `/api/market/candles`, `/api/market/indicators/ema`, `/api/research/runs/{run_id}/signal-trace`.
- Relevant docs/specs: `docs/research/24_workbench_chart_loading_roadmap.md`, `openspec/specs/workbench-chart-sliding-window/spec.md`, `openspec/specs/workbench-trace-window-chunk-cache/spec.md`, `openspec/specs/workbench-chart-controller-orchestration/spec.md`, `openspec/specs/workbench-chart-htf-context-overlays/spec.md`.
