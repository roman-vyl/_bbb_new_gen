## Why

Current Workbench chart behavior mixes user interaction, render-window lifecycle, trace loading, and viewport commands in the same reactive chain. Under active pan this causes competing side effects (`setData`, trace fetch/apply, viewport restore/focus guards), visible viewport flash, and unstable performance at report-scale windows.

The system now needs a controller-based architecture that separates responsibilities and introduces an explicit interaction state machine, so pan remains user-owned and data/trace updates are applied deterministically without viewport drift.

## What Changes

- Introduce a layered chart runtime architecture. **v1 (delivered):** orchestration lives in `frontend/src/features/chart/runtime/` (`RenderWindowController`, `ViewportController`, `traceDisplayOrchestrator`, `ChartViewModel`, `chartRuntime`); **shell IO** (run/report, market bundle, trace fetch effect) remains in `WorkbenchContext`; **rendering** stays in `ChartPanel`.
- Logical roles `RunDataController` / `MarketDataStore` / `TraceDisplayController` are satisfied **in place** in Workbench for v1, not as separate files. See `implementation/ownership-map.md`.
- Replace implicit effect/guard behavior with explicit controller events and state transitions (`trade_selected`, pointer pan, `window_swap_committed`, `trace_ready` → `noViewportChange`).
- Change pan boundary behavior: during active drag, render-window shifts are queued as pending and committed only after pan idle debounce (no immediate window swap during live drag).
- Enforce viewport ownership rules: trace updates never issue viewport commands; viewport changes come only from `ViewportController` policy.
- Decouple trace display updates from render-window identity churn so cached slices can update markers/HTF overlays without triggering viewport side effects.
- Replace broken multi-owner chart runtime directly instead of preserving it as a supported compatibility fallback path.

## Capabilities

### New Capabilities
- `workbench-chart-controller-orchestration`: Defines controller boundaries, interaction event model, and single-owner viewport command policy for chart runtime.

### Modified Capabilities
- `workbench-chart-sliding-window`: Render-window shifts are deferred while user drag is active; shift commits after pan idle and restores anchor via controller policy.
- `workbench-trace-window-chunk-cache`: Trace display/cache pipeline becomes independent from viewport control and avoids pan-time fetch storms from window-key churn.
- `workbench-chart-htf-context-overlays`: HTF/context overlays remain display-only consumers of trace cache and are explicitly forbidden from issuing viewport/focus actions.

## Impact

- Frontend: chart **decisions** moved to `features/chart/runtime/*`; `WorkbenchContext` slimmed on policy (still hosts data fetch/cache); `ChartPanel` is renderer + interaction emitter only.
- Research API and trace contract remain source-compatible; orchestration and fetch timing semantics in frontend change.
- Existing observability/debug counters will be reorganized around controller events/state transitions.
- Manual QA and debug instrumentation must prove new invariants on heavy runs: no active-pan `setData` storm, no active-pan trace-fetch storm, one committed shift -> one key update -> one viewport command, and `traceReady` without viewport movement.
