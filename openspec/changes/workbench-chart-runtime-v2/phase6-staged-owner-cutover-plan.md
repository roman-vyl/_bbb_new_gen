# Phase 6 Revised — Staged Owner-Domain Cutover

## Why the plan changed

The first Phase 6.3 attempt switched too many chart-runtime owners at once:

- market/load/cache owner
- render-window owner
- viewport command owner
- trace/events owner
- aux overlay owner
- final chart model owner

Cold-start failure became opaque: the UI received an empty chart model while repeated market fetch decisions continued.

**New rule:** no big-bang chart-runtime cutover. Phase 6 proceeds by owner-domain slices. Each slice states old owner, new owner, transfer scope, what remains old, forbidden actions, browser evidence, tests, and **STOP FOR REVIEW**.

## Global invariants

- `ChartPanel` remains renderer-only.
- `data_engine` is not touched.
- No old-pipeline fallback.
- No dual owner for the same domain.
- No “all owners enabled” cutover.
- No deletion of old `WorkbenchContext` chart-runtime code before Phase 7.
- No user log files committed to repo.

Debug output for every stage MUST include:

| Field | Values |
|---|---|
| `owner` | `old_production` \| `runtime_v2_production` |
| `domain` | `model` \| `render_window` \| `viewport` \| `trace` \| `aux_overlay` \| `market` |
| `phase` | `6.3A` \| `6.3B` \| `6.3C` \| `6.3D` \| `6.3E` \| `6.3F` |

Every stage MUST keep cold Chart open working before moving to the next stage.

## Owner matrix by stage

| Domain | 6.3-reset … 6.2 | 6.3A | 6.3B | 6.3C | 6.3D | 6.3E | 6.3F |
|---|---|---|---|---|---|---|---|
| final model/adapter | old | **v2** | v2 | v2 | v2 | v2 | v2 |
| render-window | old | old | **v2** | v2 | v2 | v2 | v2 |
| viewport commands | old | old | old | **v2** | v2 | v2 | v2 |
| trace/events display | old | old | old | old | **v2** | v2 | v2 |
| aux/HTF overlays | old | old | old | old | old | **v2** | v2 |
| market/load/cache | old | old | old | old | old | old | **v2** |

## Stage index

| Stage | Document | Status |
|---|---|---|
| 6.3-reset | This section + `tasks.md` §7.0 | Baseline `5c992b130e38971b3b7c9c8b0ba9c30727a48374` |
| 6.3A | `phase6-3A-model-adapter-cutover.md` | Not started |
| 6.3B | `phase6-3B-render-window-cutover.md` | Not started |
| 6.3C | `phase6-3C-viewport-command-cutover.md` | Not started |
| 6.3D | `phase6-3D-trace-events-cutover.md` | Not started |
| 6.3E | `phase6-3E-aux-overlay-cutover.md` | Not started |
| 6.3F | `phase6-3F-market-owner-cutover.md` | Not started |
| 6.4 | `tasks.md` §7.4 | After 6.3A–6.3F approved |
| 6.5 | `tasks.md` §7.5 | After 6.4 approved |

Primary references:

- `phase6-live-contract-map.md` — live contract map (contracts 1–15)
- `docs/workbench-chart-runtime-analysis.md` — baseline pipeline map
- `frontend/src/features/workbenchChartRuntime/runtimeOutputAdapter.ts` — adapter boundary

---

## Phase 6.3-reset — discard failed full cutover spike

### Old state

Branch contained a failed full production cutover where runtime v2 was enabled as production owner for too many domains at once.

### New state

Return to clean baseline:

`5c992b130e38971b3b7c9c8b0ba9c30727a48374`

(or revert the failed full cutover commit cleanly).

### Acceptance

- Build remains green.
- Old chart pipeline works again.
- No runtime v2 production owner is enabled.
- Phase 6.2 stabilization code remains available.
- Failed debug/log artifacts are not committed.

**STOP FOR REVIEW** before 6.3A.

---

## Phase 6.3A — final chart model + adapter cutover only

### Old owner

`WorkbenchContext` prepares already-loaded chart display fields and exposes them directly to `ChartPanel` through the existing chart context shape.

Active owners (all old):

- market/load/cache, render-window, viewport commands, trace/events, aux overlays, final context shape

### New owner

- **final chart model/context shape:** runtime v2 `ChartModelRuntime` + `runtimeOutputAdapter`

Still old: market, render-window, viewport, trace, aux overlays.

### Transfer

Runtime v2 receives already-prepared old production chart data as input and returns a `ChartPanel`-compatible output through the adapter. It MUST NOT fetch candles, fetch EMA, mutate market cache, own render windows, own viewport commands, or own trace display.

### Forbidden

- No runtime v2 market/EMA fetch or cache writes.
- No runtime v2 render-window slicing, viewport command emission, or trace/chart-events fetch.
- No fallback from v2 to old data inside adapter.
- No `chartRuntimeV2ProductionEnabled = true` for all domains.

### Browser acceptance

- Cold Chart open shows candles; `chart.setData.candles` receives `barCount > 0`.
- Anchor EMA overlays visible; no repeated empty `chart.setData`.
- Debug: old owner for market/render/viewport/trace/aux; `runtime_v2_production` only for `domain: model`.

### Report

`phase6-3A-model-adapter-cutover.md` — exact old fields consumed and adapter fields produced.

**STOP FOR REVIEW.**

---

## Phase 6.3B — render-window owner cutover

### New owner

- **render-window:** runtime v2 (`renderWindowRuntime`, `chartWindowRuntime`)

Still old: market/load/cache, viewport commands, trace/events, aux overlays.

Already transferred: final model/adapter (6.3A).

### Transfer

Runtime v2 receives already-loaded full/focus market bundle from old market owner and decides the render window. Market loading remains old.

### Forbidden

- No runtime v2 market fetch or cache writes.
- No viewport, trace, or pan/coverage expansion ownership yet.

### Browser acceptance

- Cold Chart open shows candles; render window has non-empty candle slice.
- Selected report/variant does not reset chart to empty.
- No repeated render re-init when foundation key unchanged.
- Debug: `runtime_v2_production` for `domain: render_window` only.

### Report

`phase6-3B-render-window-cutover.md`

**STOP FOR REVIEW.**

---

## Phase 6.3C — viewport command owner cutover

### New owner

- **viewport commands:** runtime v2 (`viewportRuntime`)

Still old: market/load/cache, trace/events, aux overlays, pan/coverage expansion if it requires market loading.

Already transferred: model/adapter, render-window.

### Transfer

Runtime v2 may emit viewport commands for cold initial view, selected trade focus, next/prev trade focus, duplicate dedupe, ack/settle. Must not own market expansion yet.

### Forbidden

- No runtime v2 market fetch or pan-driven coverage expansion.
- No fallback to tail when selected trade has entry time.
- No duplicate seq bump for same command.

### Browser acceptance

- Reports → Chart focuses selected trade; next/prev trade buttons move viewport.
- Distant trade does not silently degrade to tail.
- Duplicate selected trade click does not re-emit identical command.
- Wheel/pointer clears programmatic focus intent.
- Debug: `runtime_v2_production` for `domain: viewport`.

### Report

`phase6-3C-viewport-command-cutover.md`

**STOP FOR REVIEW.**

---

## Phase 6.3D — trace/events display owner cutover

### New owner

- **trace/events display:** runtime v2 (`traceDisplayRuntime`, `chartEventsRuntime`, trace display output path)

Still old: market/load/cache, aux overlays, market pan/coverage expansion.

Already transferred: model/adapter, render-window, viewport.

### Transfer

Trace/events run only after market data and render window are ready. Repeated apply for same window/cache/status key must be no-op.

### Forbidden

- No repeated `apply_current_window` on unchanged input.
- No dense trace fetch before Chart activation gate.
- No chart-events fallback loop.
- No rollback of visible chart data if trace fails.
- No market owner transfer in this phase.

### Browser acceptance

- Component markers/events visible; chart-events enabled and disabled/dense fallback paths work.
- Trace failure does not clear candles; no repeated trace apply churn.
- Debug: `runtime_v2_production` for `domain: trace`.

### Report

`phase6-3D-trace-events-cutover.md`

**STOP FOR REVIEW.**

---

## Phase 6.3E — aux/HTF overlay owner cutover

### New owner

- **aux/HTF overlays:** runtime v2 (`auxOverlayRuntime`)

Still old: market/load/cache only.

Already transferred: model/adapter, render-window, viewport, trace/events.

### Transfer

Runtime v2 consumes context overlay selection and already available overlay data; emits display overlays and stale flags.

### Forbidden

- No context selector ownership transfer.
- No market fetch/cache ownership transfer.
- No clearing price chart when aux overlay is stale/missing.

### Browser acceptance

- Context overlay switch works; HTF overlay appears when selected.
- Stale/missing aux overlay does not blank candles.
- Debug: `runtime_v2_production` for `domain: aux_overlay`.

### Report

`phase6-3E-aux-overlay-cutover.md`

**STOP FOR REVIEW.**

---

## Phase 6.3F — market/load/cache owner cutover LAST

### New owner

- **market/load/cache:** runtime v2 (`marketViewRuntime`, `marketWindowRuntime`, `marketLoadRuntime`, `marketBundleRuntime`, `panRuntime` as needed)

Already transferred: all other domains.

### Transfer

Runtime v2 becomes the only production owner for market fetch/cache readiness. Last transfer because previous failure happened at cold-start market readiness.

### Forbidden

- No old market fallback if runtime v2 returns empty.
- No dual market owner.
- No repeated fetch decisions for unchanged ready/in-flight key.
- No `chart.setData.candles` with empty data after successful fetch.
- No cache-hit promotion loop.
- No clearing chart while fetch is in-flight if old/stale data exists.

### Browser acceptance

- Cold Chart open shows candles; EMA overlays visible.
- Initial market fetch once per required missing window.
- Repeated cache-hit cycles do not rebuild chart model.
- Pan left/right can request coverage expansion without fetch storm; clamped pan is no-op.
- No blank chart, freeze, or viewport teleport.
- Debug: `runtime_v2_production` for `domain: market`.

### Report

`phase6-3F-market-owner-cutover.md`

**STOP FOR REVIEW.**

---

## Phase 6.4 — browser smoke matrix (after 6.3A–6.3F)

Only after all owner slices are approved. Scenarios:

- cold Chart open
- Reports → Chart
- selected trade focus
- next/prev trade
- distant trade
- pan left/right
- chart-events enabled
- chart-events disabled/dense fallback
- context overlay switch
- variant switch
- reload

See `design.md` §8 and `phase6-live-contract-map.md` contract 15 browser smoke proof.

**STOP FOR REVIEW.**

---

## Phase 6.5 — ownership report before Phase 7 deletion

Only after 6.4 approved. Deliverables:

- final owner matrix
- list of old `WorkbenchContext` dead code
- deletion plan for Phase 7
- proof that each domain has one active owner

No deletion in 6.5.

**STOP FOR REVIEW** before Phase 7.
