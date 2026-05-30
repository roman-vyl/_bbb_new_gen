## Context

Workbench Chart Phase 5 loads **signal trace** per visible window. Blocker internals exist for `rsi_lookback_extreme_blocker`; exit RSI is evaluated in backtest but not serialized as chart events today.

HTF RSI uses `_align_completed_feature_to_base` → one value/boolean per base bar. One blocking 1h state → a run of blocked 5m bars (10:00 … 10:55). Markers follow that run in **trace data**; frontend does not expand HTF spans.

## Goals / Non-Goals

**Goals:**

- Generic **`component_event_markers[]`** contract (research_api + frontend).
- **v1 research emitters** only: `rsi_lookback_extreme_blocker`, `rsi_signal_exit`.
- Full base-indexed event data; **dense** chart rendering in v1.
- Frontend rendering driven by **`role` + `side` + `time` + `label`/metadata** — not `component_id`.

**Non-Goals:**

- v1 emitters for other/future components (contract ready; emitters deferred).
- Browser RSI recompute; HTF expansion/collapse in trace.
- **`compressed`** rendering in v1.
- Frontend `switch (component_id)` for marker styling.

## Decisions

### 1. Split: generic contract vs v1 emitter scope

**Contract (research_api + frontend):** component-agnostic `ComponentEventMarker[]`.

**v1 emitters (research only):**

| `component_id` | `role` | Emitter owner |
|----------------|--------|---------------|
| `rsi_lookback_extreme_blocker` | `entry_block` | research/backend |
| `rsi_signal_exit` | `exit_signal` | research/backend |

Future components reuse the same payload; new emitters are follow-up work—not v1 scope creep.

### 2. Generic marker record (API contract)

```yaml
time: int                    # chart/base bar unix sec == trace.times[i]
role: entry_block | exit_signal
side: long | short
component_id: string         # provenance; not a frontend render key
instance_id: string
feature_family: rsi          # v1 always "rsi"; field reserved for future families
source_timeframe: string     # RSI feature TF (resolved; not "base")
base_timeframe: string       # strategy/chart base TF
rsi_value: float | null      # aligned RSI at bar
condition: string | null     # e.g. "extreme_seen", "exit_above", "exit_below"
params: object               # threshold/lookback/profile metadata
label: string                # short marker text for dense mode
tooltip: string | null       # optional longer text
```

`research_api` exposes `component_event_markers[]` as-is. Mapping layer MUST NOT strip generic fields.

### 3. v1 emitter: `rsi_lookback_extreme_blocker`

- Input: `rsi_lookback_extreme_blocker_trace` on aligned `plan.rsi_columns[...]`.
- Emit `role: entry_block` when `extreme_seen[i]` (not `allowed` alone — avoids HTF gate mixing).
- Populate `source_timeframe`, `base_timeframe`, `rsi_value`, `condition`, `params` (thresholds, lookback), `label`.

### 4. v1 emitter: `rsi_signal_exit`

- Input: new `rsi_signal_exit_trace(...)` on aligned RSI column.
- Emit `role: exit_signal` when side-aware exit boolean true at `i`.
- `params` MAY include exit profile bucket, thresholds.

### 5. HTF alignment (backend only)

1. Feature pipeline → aligned base index.
2. Component trace booleans on base index.
3. One marker record per active base bar (`time == times[i]`).
4. Frontend renders list 1:1 (dense v1); **does not expand** HTF.

### 6. Data semantics vs rendering mode

| Layer | Rule |
|-------|------|
| **Trace/API** | One record per blocked/active base bar; no HTF run collapse |
| **Chart v1** | **dense** — one marker per record |
| **Chart future** | **compressed** — display-only; trace unchanged |

### 7. Frontend: component-agnostic rendering

**Choice:** `chartComponentEventMarkers.ts` maps generic fields:

- Color/shape/position from **`role`** and **`side`** only.
- Marker text from **`label`** (fallback: minimal role abbreviation).
- **`component_id`**, **`params`**, **`rsi_value`** → tooltip/metadata only.
- **Forbidden:** `if (component_id === 'rsi_lookback_extreme_blocker')` for styling.

Example v1 styling (role-based):

| `role` | long | short |
|--------|------|-------|
| `entry_block` | orange circle above | orange circle below |
| `exit_signal` | violet square above | violet square below |

Toggles filter by **`role`** (`entry_block` / `exit_signal`), not by `component_id`.

### 8. Window / stale behavior

Reuse HTF aux overlay window/stale semantics (`traceMatchesWindow`, freeze last sliced markers).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Marker density (HTF runs) | Dense v1 + role toggles; compressed deferred |
| Contract drift vs emitters | Generic fields locked in research_api; v1 tests assert shape |
| Frontend re-introduces component branching | Vitest: no `component_id` in render switch; lint/review |
| Future emitter work | Same contract; add research emitter only |

## Migration Plan

1. Ship generic contract + v1 two emitters in research.
2. Ship component-agnostic frontend marker builder.
3. Manual QA: both components; HTF `1h` on `5m` dense run; tooltip shows `component_id`.

## Open Questions

- **Resolved:** `role` not `event_kind` in public contract.
- **Deferred:** compressed rendering; new emitters; click → Bar Inspector.

## Files likely touched

| Area | Files |
|------|--------|
| research | `execution/signal_trace.py`, `components/exits.py`, `components/blockers.py`, emitter helpers, tests |
| research_api | `contracts/signal_trace.py`, `services/signal_trace_service.py` |
| frontend | `api/types.ts`, `chartComponentEventMarkers.ts`, `ChartPanel.tsx`, `WorkbenchContext.tsx`, tests |
