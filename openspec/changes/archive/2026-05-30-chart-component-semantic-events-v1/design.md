## Context

Workbench Phase 5 signal trace already ships **`component_event_markers[]`** (archived change `chart-component-rsi-event-markers-v1`): dense `entry_block` records on every blocked base bar plus `exit_signal` points. Frontend maps markers by `role` + `side` only—good—but the payload still encodes “one candle marker per bar”, which cannot express span boundaries, causal source bars, or future components (context gates, counter-candle blocker, EMA cross exit, setup/trigger) without exploding marker count or adding frontend `component_id` branches.

Chart **selected-trade diagnostics** (`chart-selected-trade-diagnostics-v1`) is orthogonal: price lines and trade panel from report JSON. This change evolves **component events on chart** only.

## Goals / Non-Goals

**Goals:**

- Replace `component_event_markers[]` with **`component_events[]`** — sparse semantic events with `event_type`: `point`, `span_start`, `span_end`, `source`.
- **Component-agnostic contract**: top-level payload has generic alignment/provenance fields; RSI/EMA/component-specific values live in research emitters + `metadata` only.
- **`role`** is an extensible render/layer axis (`entry_block`, `exit_signal` in v1; future: `setup`, `trigger`, `context_regime`, …); **`side`** and **`event_type`** complete the render key; **`component_id`** is provenance-only.
- Migrate the two **existing RSI emitters** as the first slice—proving span/source/point—not defining the platform scope.
- Frontend renders from **`event_type` + `role` + `side`** only; legend/hints MUST NOT name RSI or specific catalog components.
- Document emitter mapping for non-RSI components (counter-candle, EMA exit, context gate, setup/trigger) as follow-up work on the same contract.

**Non-Goals:**

- New emitters beyond RSI blocker + RSI exit migration.
- Trade diagnostics panel / price lines changes.
- Browser recomputation of RSI, blockers, or HTF expansion.
- Span background shading — **optional v1.1**; v1 minimum is boundary + source + point markers.
- Renaming main spec folder (`workbench-chart-component-event-markers` → `…-events`) at archive time is optional; delta updates behavior in place.

## Decisions

### 1. Payload rename and shape

**Choice:** `component_events[]` replaces `component_event_markers[]` (**breaking** API field rename).

```yaml
time: int                      # unix sec on chart/base bar == trace.times[i]
event_type: point | span_start | span_end | source
role: string                   # render/layer key; v1: entry_block | exit_signal; future: setup | trigger | context_regime | ...
side: long | short
component_id: string           # provenance; NOT a render key
instance_id: string
label: string                  # short chart text (emitter-authored; not RSI-specific)
tooltip: string | null
span_id: string | null         # links source + span_start + span_end (generic; shading/grouping later)
feature_family: string | null  # e.g. rsi, ema, context — generic label, not a render key
source_timeframe: string | null  # resolved feature TF (e.g. 5m, 1h); for HTF hints
base_timeframe: string | null    # strategy/chart base TF
metadata: object               # component-specific ONLY: rsi_value, condition, params, threshold, lookback, profile, ...
```

**Invariant:** Top-level MUST NOT include indicator values or rule thresholds (`rsi_value`, `threshold`, …). Frontend HTF hint (`source_timeframe != base_timeframe`) reads top-level timeframes, not `metadata`.

**Alternative considered:** Keep `component_event_markers` and add optional `event_type` — rejected; dense per-bar records contradict span model and confuse consumers.

### 2. Universal `event_type` semantics

| `event_type` | Meaning | Chart v1 render |
|--------------|---------|-----------------|
| `source` | Causal / triggering bar | Small diamond marker |
| `span_start` | First bar of contiguous regime (block, gate, …) | Boundary marker (circle) |
| `span_end` | **Last active** bar of same regime (`time == times[i1]` where `i1` is last blocked index) | Boundary marker (circle, distinct label) |
| `point` | Isolated one-shot (exit, setup, trigger, cross) | Square marker |

Frontend MUST NOT interpret `component_id` when choosing shape/color/position.

### 2b. Extensible `role` (layer + color family)

| `role` (v1) | Typical `event_type` | Future components |
|-------------|----------------------|-------------------|
| `entry_block` | `source`, `span_start`, `span_end` | RSI blocker, counter-candle blocker |
| `exit_signal` | `point` | RSI exit, EMA cross exit |
| `setup` (future) | `point` | pullback setup detected |
| `trigger` (future) | `point` | reclaim / strong reclaim fired |
| `context_regime` (future) | `span_start`, `span_end`, optional `source` | HTF aligned / countertrend / neutral gate |

Layer toggles filter by **`role`**. Adding a new catalog component MUST NOT require new frontend render branches if it maps to an existing `role` + `event_type` pair.

### 3. First migration slice: RSI lookback extreme blocker (emitter-specific)

Input: aligned `rsi_lookback_extreme_blocker_trace` on base index. RSI fields go in **`metadata`** only.

Per `(instance_id, side)`:

1. **`source`**: rising edge on **raw** threshold boolean **before** lookback rolling — one `source` per crossing episode, not one per bar while raw stays true. After block clears, a new crossing emits a new `source`.
2. **`span_start` / `span_end`**: contiguous runs where `allowed == False` (post-lookback `extreme_seen`). `span_start.time = times[i0]` (first blocked bar); **`span_end.time = times[i1]` (last blocked bar — NOT the first inactive bar after the run)**.
3. **`role`**: always `entry_block`. Same `span_id` on `source`, `span_start`, `span_end` for a run.

**Synthetic acceptance (required test):**

```
raw threshold:  F T T T F F T T
blocked run:    F T T T T F T T   # lookback=1 → block extends one bar past last raw T in run
source times:       ^           ^   # exactly two source events (rising edges on raw)
span_end times:         ^     ^     # last blocked bar each run, not first F after run
```

HTF example (`1h` RSI on `5m` base): one blocked hour → one `source` (at crossing bar), one `span_start` at 10:00, one `span_end` at 10:55 — **not** twelve duplicate markers.

**Alternative considered:** Keep dense per-bar trace + frontend compression — rejected per user direction; semantic spans are authoritative in API.

### 4. First migration slice: RSI signal exit (emitter-specific)

- Emit **`point`** when `exit_fired[i]` on aligned base index.
- **`role`**: `exit_signal`.
- All RSI/threshold fields in `metadata`.

### 5. Non-RSI component mapping (contract; follow-up emitters)

| Component | `role` | Events | Notes |
|-----------|--------|--------|-------|
| `counter_candle_blocker` | `entry_block` | `source` + `span_start` + `span_end` | `source` = violating candle; metadata: OHLC direction |
| `ema_cross_exit` | `exit_signal` | `point` | metadata: fast/slow periods, cross direction |
| HTF context gate | `context_regime` | `span_start` + `span_end` (+ optional `source`) | top-level timeframes; `metadata.regime` |
| setup component | `setup` | `point` | metadata: setup kind |
| trigger component | `trigger` | `point` | metadata: trigger kind |

New emitters = research-only follow-ups; **frontend unchanged** when `role` + `event_type` already supported.

### 6. Span grouping key (top-level)

Optional top-level **`span_id`** (`string | null`, stable within trace) links `source`, `span_start`, `span_end` for tooltip grouping and future span shading. Emitter generates deterministic id, e.g. `{instance_id}:{side}:{span_start_time}`.

### 7. Frontend module

Rename/refactor `chartComponentEventMarkers.ts` → **`chartComponentEvents.ts`**:

```ts
function styleForEvent(event_type: ComponentEventType, role: ComponentEventRole, side: Side): MarkerStyle
```

- Filter toggles by **`role`** (v1: `entry_block`, `exit_signal`; add toggles when new roles ship).
- Legend labels MUST describe **`role`** and **`event_type`**, not RSI or catalog ids (replace current “X-RSI” copy).
- Tooltip includes `component_id`, `metadata`, `event_type`, top-level `span_id` / timeframes.
- HTF chart hint compares top-level `source_timeframe` vs `base_timeframe` (not `metadata`).
- **Forbidden:** `switch (component_id)`; **Forbidden:** feature-family checks (`rsi`, `ema`) in render path.

Optional: `buildSpanBands()` for shaded regions between paired start/end — defer if LC integration cost high; spec requires boundary markers minimum.

### 8. Slice / window behavior

`slice_signal_trace` filters events by `time` in window (same as markers today). Span pairs MAY be clipped: if the visible window starts **inside** a blocked run, the user may see only `span_end` (no `span_start`) — **expected v1 behavior, not a bug**. If only `span_end` is visible, still render it. No synthetic “continues from left/right” markers in v1.

### 9. Migration from implemented v1

Single coordinated PR across research, research_api, frontend, tests:

- Delete `ComponentEventMarker*` types and dense loop in `build_component_event_markers`.
- Add `build_component_events` with run detection helper `_contiguous_false_runs(allowed)`.
- Update pytest: HTF hour → 3–4 events not 12 markers; slice tests updated.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking BFF field rename | Coordinated deploy; no external consumers beyond Workbench |
| Users lose per-bar visual density | Span boundaries + source show structure; role toggles remain |
| Span detection bugs at run edges | Unit tests on synthetic boolean series + HTF alignment fixture |
| Partial spans at window edge | Document in spec; accept clipped markers |
| Frontend re-introduces component branching | Vitest asserts render path uses only event_type/role/side |

## Migration Plan

1. Land contract + research emitters + API mapping.
2. Frontend switch to `component_events`; remove marker module references.
3. Update main spec on archive (MODIFIED + REMOVED dense requirements).
4. Rollback: revert PR (no persisted schema migration).

## Open Questions

1. **Span shading in v1?** Recommend markers-only in v1; shading as fast follow if LC band API is straightforward.
2. **Additional `role` values** — add `setup`, `trigger`, `context_regime` when first non-RSI emitter lands; frontend adds legend toggle per new role, still no `component_id` branching.
3. **Spec folder rename** to `workbench-chart-component-events` on archive — cosmetic; defer unless user wants rename.

## Files likely touched

| Area | Files |
|------|--------|
| research | `execution/signal_trace.py`, `components/blockers.py`, span helpers, tests |
| research_api | `contracts/signal_trace.py`, `services/signal_trace_service.py` |
| frontend | `api/types.ts`, `chartComponentEvents.ts`, `ChartPanel.tsx`, `WorkbenchContext.tsx`, `ChartMarkerLegend.tsx`, tests |
| tests | `test_ema_pullback_signal_trace.py`, `test_research_api_signal_trace.py` |
