## Context

Workbench Chart currently loads report data, full-range market candles, anchor EMA overlays, auxiliary overlays, render-window state, signal trace display cache, lanes trace state, and viewport commands through a large `WorkbenchContext`. The chart candle path is relatively fast during pan because it slices from a full in-memory market bundle. The event/HTF path is slower because it depends on exact-window dense `/signal-trace` requests that rebuild research features and trace data on the backend.

The user-facing symptom is most visible when the user pans or navigates trades beyond the current render-window safe zone: candles update from cache, while component events and HTF overlays can lag, flicker, or show stale/frozen display state. The intended roadmap is documented in `docs/research/24_workbench_chart_loading_roadmap.md`.

This change spans `frontend` first and `research_api` later. It must preserve layer boundaries:

- `data_engine/` remains candles only.
- `research/` remains strategy/backtest/report logic.
- `research_api/` remains the BFF boundary.
- `frontend/` does not compute strategy signals or EMA semantics beyond display plumbing already owned by the chart.

## Goals / Non-Goals

**Goals:**

- Make chart-heavy IO lazy so non-chart tabs do not trigger market bundle or initial trace loads by accident.
- Add measurement points before changing semantics.
- Add abort/stale-response foundations for frontend requests, while documenting that this is not backend CPU cancellation.
- Split chart data runtime responsibilities out of shell/report state without changing behavior in that refactor step.
- Prevent component events and HTF overlays from fully disappearing on partial trace cache misses.
- Use normalized trace display chunks and missing-range planning only after request identity, supersede, and review gates are in place.
- Split market cache identity so candles are reusable across variants with the same symbol/timeframe/range.
- Define a later sparse/materialized chart-events backend path for marker/HTF display.
- Stop after each PR slice for user review before implementing the next slice.

**Non-Goals:**

- No Data Engine changes.
- No browser-side strategy computation.
- No `/signal-trace` contract break in PR 1-5.
- No active-pan prefetch until stable resource identity, abort/supersede, and in-flight ledgers are reviewed.
- No backend materialization before the sparse chart-events OpenSpec step.
- No broad rewrite of `ChartPanel` in the context split step.

## Decisions

### Decision 1: Start with instrumentation and lazy activation before context split

PR 1 will add diagnostics, chart activation gating, and abortable client plumbing without moving ownership boundaries. This gives measurable baseline scenarios and avoids mixing behavior changes with a large refactor.

Alternative considered: start by splitting `WorkbenchContext`. Rejected for the first PR because it makes it harder to distinguish refactor regressions from existing chart load behavior.

### Decision 2: Treat AbortController as frontend stale-response protection

`api/client.ts` fetch helpers will accept `AbortSignal` for market and trace requests, and chart orchestration will abort/supersede old requests when run, variant, context, or window identity changes.

This is not considered backend cancellation. The current sync FastAPI trace path can continue CPU work after a client abort. Backend cooperative cancellation is deferred to the sparse/materialized events phase if needed.

Alternative considered: implement backend cancellation first. Rejected because the immediate UX risk is stale response application and request identity; backend cancellation requires a separate execution-model design.

### Decision 3: Review-gated rollout is part of the contract

The change is explicitly sliced into PR steps. After each step, implementation stops for review. The next step must not start until the user accepts the prior step.

Alternative considered: implement all frontend phases in one branch. Rejected because chart behavior is regression-sensitive, especially HTF overlays and pan/trade viewport semantics.

### Decision 4: Context split preserves existing semantics

PR 2 will extract chart data IO/runtime from shell/report state but will not change cache keys, API contracts, trace scheduling, render-window behavior, or marker semantics. It should reduce subscription fanout: report-facing UI should not rerender from chart display revisions.

Alternative considered: combine context split with missing-range scheduling. Rejected because it would make behavior changes harder to review.

### Decision 5: Partial display state precedes missing-range scheduling

PR 3 will introduce `TraceDisplayState` with `current`, `partial`, `stale`, `loading_missing`, and `empty` states. A committed render-window shift must not clear component markers solely because the full exact window is not covered yet.

Alternative considered: go directly to normalized chunk fetch. Rejected because all-or-nothing display clearing is the visible bug and can be fixed before changing request planning.

### Decision 6: Missing-range scheduling uses normalized chunks, not arbitrary micro-ranges

PR 4 will make `missingRange()` part of scheduling, but requests should be normalized to chunk boundaries such as 25k or 50k bars while `/signal-trace` remains dense and expensive. This avoids creating many small heavy backend recomputes.

Alternative considered: fetch every exact missing micro-gap. Rejected because dense signal trace recomputation could become worse than the current exact-window model.

### Decision 7: No active-pan prefetch in the first missing-range pass

The first prefetch allowed by this change is post-commit idle prefetch of a neighboring normalized chunk. Near-edge and active-pan low-priority prefetch are deferred until after stable range identity, in-flight ledgers, and abort handling prove reliable.

Alternative considered: prefetch during active pan. Rejected because current chart bugs are race-sensitive; prefetch during pan can amplify stale window/context races.

### Decision 8: Market cache split starts frontend-only

PR 5 will keep `/api/market/chart-bundle` as a source if needed, but frontend cache storage will split candles from overlays. A later implementation may switch to `/api/market/candles` and `/api/market/indicators/ema` or chunked backend endpoints.

Alternative considered: change backend market endpoints first. Rejected because the first benefit is reusing identical candles across variants, which can be achieved in the frontend cache layer.

### Decision 9: Sparse chart events are a later backend product

PR 6 introduces or proposes `/api/research/runs/{run_id}/chart-events` or materialized chart event chunks. This endpoint is for sparse display data: component events, HTF display points/context states, and coverage metadata. Dense `/signal-trace` remains for lanes, bar inspector, and diagnostics over a focused window.

Alternative considered: keep using dense `/signal-trace` forever with more frontend cache. Rejected because chart marker display should not depend on dense per-bar internals over 50k bars.

## Risks / Trade-offs

- [Risk] Lazy chart activation may delay first chart open if no background prefetch is allowed. → Mitigation: PR 1 records cold chart timing and keeps explicit idle-prefetch as a later policy option.
- [Risk] AbortController may be mistaken for backend cancellation. → Mitigation: proposal, specs, and tasks explicitly state that CPU-bound `signal_trace_service.py` may continue.
- [Risk] Partial display state can show stale markers from an overlapping cache while the user expects exact-window freshness. → Mitigation: expose stale/partial state and coverage metadata in UI/debug hints; update markers only after merge/fingerprint change.
- [Risk] Normalized chunk scheduling over dense `/signal-trace` can increase backend work if chunk size is too small. → Mitigation: use coarse chunks and do not add speculative fanout in PR 4.
- [Risk] Market cache split can create overlay/candle identity mismatches. → Mitigation: add `RunMarketView` as the resolver between report/run/variant and cache keys.
- [Risk] Sparse chart-events endpoint duplicates trace semantics incorrectly. → Mitigation: derive sparse events from the same research signal trace/event generation path, and keep dense `/signal-trace` as the diagnostic source of truth until parity is verified.
- [Risk] HTF context overlays regress during trace cache/context ref changes. → Mitigation: every chart/trace step includes HTF context EMA verification against `workbench-chart-htf-context-overlays`.

## Migration Plan

1. PR 1: Add instrumentation, lazy chart activation, and abortable client foundation. Stop for review.
2. PR 2: Split `WorkbenchContext` responsibilities without behavior changes. Stop for review.
3. PR 3: Add partial/stale event display state and marker fingerprinting. Stop for review.
4. PR 4: Add normalized missing-range scheduling and post-commit idle prefetch only. Stop for review.
5. PR 5: Split frontend market resource cache into candles and overlays. Stop for review.
6. PR 6: Propose/implement sparse or materialized chart-events backend product. Stop for review.

Rollback strategy is per PR: each step must preserve prior behavior or be small enough to revert independently. PR 6 must be guarded so existing `/signal-trace` consumers continue to work.

## Open Questions

- What normalized trace chunk size should be used while `/signal-trace` remains dense: 25k or 50k bars?
- Should lazy chart activation allow automatic idle prefetch after report ready, or require explicit Chart activation only for the first implementation?
- Should sparse chart-events materialization live beside run artifacts immediately, or start as an in-memory/server-cache endpoint first?
- Should backend cooperative cancellation be designed before or after sparse chart-events, if dense trace remains slow for diagnostics?
