## 0. Ownership audit (before code)

- [ ] 0.1 Locate signal-trace `useEffect` in `WorkbenchContext.tsx` (~1467–1709); export full dependency array
- [ ] 0.2 Classify each dep: committed input | effect output | cache revision | unrelated object identity | instance display state
- [ ] 0.3 Inventory dedupe guards to delete or replace: `loadingTraceWindowKeyRef`, `inFlightTraceRequestRef`, `skip_identical_in_flight`, `skip_display_cache_hit`, `skip_already_loading`, `load_start`, `signalTraceStatus === "loading"` gate, `displayCacheVersion` dep
- [ ] 0.4 Confirm keep only `traceLoadGenerationRef` (or equivalent) for superseded async responses
- [ ] 0.5 Confirm no edits planned: `ChartPanel.tsx`, BFF/research_api, backtest, market bundle, viewport/pan modules
- [ ] 0.6 Confirm `selectedStrategyInstanceId` is not a BFF `/signal-trace` query param and must not enter `traceRequestKey`
- [ ] 0.7 Confirm `coordinator.reset()` is not tied to instance switch or pan-only `chartWindowKey` change

## 1. SignalTraceRequestCoordinator module

- [ ] 1.1 Add `frontend/src/features/chart/runtime/signalTraceRequestCoordinator.ts` with `buildTraceRequestKey` from exact normalized fetch params (ms `from`, `to_open_time_ms`, run, variant, context ref)
- [ ] 1.2 Implement ledgers: `inFlightKeys` Map, `mergedKeys` Set (or bounded LRU), `failedKeys` Map
- [ ] 1.3 Implement `evaluate`, `markInFlight`, `clearInFlight`, `markMerged`, `markFailed`, `reset` with identity-only reset policy
- [ ] 1.4 Implement superseded/stale response generation check (pair with Workbench generation ref)
- [ ] 1.5 Unit tests: `cache_hit`, `in_flight`, `already_merged` when `displayCacheCoversWindow=false`, `failed_same_key`, `superseded`, `session_restore` via `markMerged`, pan K1→K2→K1 no refetch, multi-instance same-K dedup

## 2. Policy refactor (gates only)

- [ ] 2.1 Remove from `signalTraceLoadPolicy.ts`: `skip_display_cache_hit`, `skip_already_loading`, `skip_identical_in_flight`, `load_start` network authorization
- [ ] 2.2 Keep bootstrap/session/idle/pan-related types used by `planTraceDisplayLoad` / orchestrator
- [ ] 2.3 Move former policy dedupe tests to coordinator tests; policy tests cover gates only (`skip_idle`, `restore_session_cache`, lanes helpers)
- [ ] 2.4 Audit `traceDisplayOrchestrator.ts` for any durable network dedupe branches; remove or delegate to coordinator contract

## 3. Workbench wiring

- [ ] 3.1 Create coordinator once per `WorkbenchProvider` via `useRef(createSignalTraceRequestCoordinator())`
- [ ] 3.2 Build `traceRequestKey` from committed primitives inside effect (not from `chartWindowKey` alone)
- [ ] 3.3 Replace effect deps with primitives only; remove `displayCacheVersion`, `displayCacheCoversWindow`, `report`, `selectedVariant` object
- [ ] 3.4 Read `coversRange` via `signalTraceDisplayCacheRef.current` inside effect
- [ ] 3.5 Flow: bootstrap → policy pan gates → `coordinator.evaluate` → fetch only on `fetch`
- [ ] 3.6 `markInFlight` before `await fetchSignalTrace`; `markMerged` after merge; `markFailed` on error; ignore superseded responses
- [ ] 3.7 Session restore path: `markMerged(K, "session_restore")` with merge (no network bypass)
- [ ] 3.8 Remove local dedupe refs/guards (`inFlightTraceRequestRef` network role, loading-window dedupe)
- [ ] 3.9 Instance switch: re-run display apply / marker filter only; no fetch when key unchanged
- [ ] 3.10 `coordinator.reset()` on run/variant/context overlay/reload; not on pan or instance switch

## 4. Pipeline debug

- [ ] 4.1 Extend `wb.signal_trace_decision` meta: `traceRequestKey`, `decisionReason`, `skipReason`, coverage fields, ledger hits, `effectTriggerReason`, `selectedStrategyInstanceId` as display-only
- [ ] 4.2 Extend `wb.signal_trace.fetch_start` with `traceRequestKey`
- [ ] 4.3 Document new fields in `debug/README.md` or `research/diagnostics/README.md` (frontend section)

## 5. Acceptance

### Automated

- [ ] 5.1 All coordinator unit tests pass (`npm test` / vitest target for new module)
- [ ] 5.2 Policy + Workbench load tests pass (`signalTraceLoadPolicy.test.ts`, `workbenchLoad.test.tsx` if applicable)

### Manual (`VITE_EMA_PIPELINE_DEBUG=true`)

- [ ] 5.3 One backtest click → wait for chart load → `window.__pipelineDebugFlush("workbench-after-signal-trace")`
- [ ] 5.4 Assert `api.fetchSignalTrace` count ≤ 1 per distinct `traceRequestKey` (not 362)
- [ ] 5.5 Assert `wb.signal_trace.fetch_start` and `wb.trace_display.merge_chunk` ≤ 1 per key
- [ ] 5.6 BFF log: no storm of identical `/signal-trace` GET lines
- [ ] 5.7 After first merge, repeated decisions show `already_merged` / `cache_hit` in `last_meta`
- [ ] 5.8 Run with 2+ strategy instances: switch instance without URL param change → no second identical GET; markers may update
- [ ] 5.9 Verify HTF context EMA overlays on variant with `strategy.contexts` (`workbench-chart-htf-context-overlays`)
- [ ] 5.10 Pan/viewport behavior unchanged; ChartPanel diff empty
