## Context

`ema_bounce_counter_setup` landed in [`2026-05-30-ema-bounce-counter-setup`](../../archive/2026-05-30-ema-bounce-counter-setup/): research emits `source` / `span_start` / `span_end` / `point` with `role: setup` and partial `metadata` (`event_name`, EMA periods, bounce counts, `trend_episode_id`). `_event_label()` still maps all setup roles to `Src` / `Setup▶` / `Setup■` / `Trend`. Frontend `chartComponentEvents.ts` renders `event.label` verbatim and uses generic `componentEventTooltip()` unless `event.tooltip` is set.

Trace columns (`armed`, `raw_touch`, `pending_bounce`, `setup_allowed`, `touch_lookback_left`, …) already exist in `ema_bounce_counter_setup_trace`; they are not copied into event metadata today.

## Goals / Non-Goals

**Goals:**

- Chart markers for bounce counter setup are self-explanatory: bounce index, window start/end, raw touch, trend +/-.
- Tooltips explain gate state and lookback without opening trace JSON.
- Users can hide all `role: setup` markers via **Show setup** toggle.
- Preserve generic `component_events[]` contract and role/event_type-driven marker styling.

**Non-Goals:**

- Changing setup_allowed, max_bounces, lookback, or trend episode algorithms.
- Component-specific colors/shapes on the chart.
- Recomputing diagnostics in the browser.
- HTF EMA-stack setup (unchanged MVP scope).

## Decisions

### 1. Enrich metadata in research emitter (single source of truth)

**Decision:** Extend `_ema_bounce_metadata()` in `research/strategies/ema_pullback/execution/signal_trace.py` to include, at event bar index `idx`:

| Key | Source |
|-----|--------|
| `trend_active`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `setup_allowed` | trace booleans at `idx` |
| `touch_lookback_left` | trace int at `idx` |
| (existing) `event_name`, `effective_bounce_number`, `completed_bounce_count`, `max_bounces`, `touch_lookback_bars`, `trend_episode_id`, EMA periods, `price_side_of_anchor` | already partial |

Canonical `metadata` keys on every bounce/trend event (aligned with per-bar diagnostics): `event_name`, `trend_active`, `trend_episode_id`, `armed`, `raw_touch`, `pending_bounce`, `in_touch_lookback`, `setup_allowed`, `touch_lookback_bars`, `touch_lookback_left`, `completed_bounce_count`, `effective_bounce_number`, `max_bounces`, `price_side_of_anchor`, `fast_ema`, `anchor_ema`, `slow_ema`.

**Rationale:** Backend owns semantics; frontend only displays. No trading logic change — read-only copy from trace series already used for emission.

**Alternative rejected:** Frontend reads `trace.long.internals.setups[instance_id]` — violates layer boundary and duplicates bar alignment logic.

### 2. Frontend presentation helper (label + tooltip only)

**Decision:** Add `frontend/src/features/chart/emaBounceCounterComponentEventPresentation.ts` with:

- `formatEmaBounceCounterEventLabel(event: ComponentEvent): string | null` — returns override or `null` to fall back to `event.label`
- `formatEmaBounceCounterEventTooltip(event: ComponentEvent): string | null` — returns override or `null` to fall back

Mapping (`metadata.event_name` + `event_type`):

| event_name | event_type | Label |
|------------|------------|-------|
| `bounce_opportunity_start` | `source` | `B{n} touch` (`n` = `effective_bounce_number`) |
| `pending_bounce_start` | `span_start` | `B{n}▶` |
| `pending_bounce_end` | `span_end` | `B{n}■` |
| `trend_start` | `point` | `T+` |
| `trend_break` | `point` | `T-` |

Tooltip lines (example): `Bounce 2/3`, `completed: 1`, `trend active · episode #4`, `lookback: 10 bars (3 left) · in_touch_lookback`, `armed · raw_touch · pending_bounce · setup_allowed`, `EMA 50/200/500`, `instance bounce_counter`. Tooltip MUST show `raw_touch` and `in_touch_lookback` separately so lookback-window bars are distinguishable when `raw_touch` is false.

**Label v1 note:** `B{n} touch` may be dense on busy charts; acceptable for v1. If noisy later, shorten to `B{n}•` / `B{n}` and move “touch” detail to tooltip only.

**Rationale:** Satisfies acceptance without `switch (component_id)` in marker style code. `chartComponentEvents.ts` calls helper when `component_id === "ema_bounce_counter_setup"` only for **text** fields before `SeriesMarker` build.

**Clarifies archived spec tension:** MODIFIED requirement allows `component_id` in a **registered presentation formatter** for label/tooltip; still forbids `component_id` branches for color, shape, position.

### 3. Keep backend `label` generic or minimal

**Decision:** Leave `_event_label()` generic for setup (`Setup▶`, etc.) OR set bounce-specific labels in backend — **prefer frontend override** so RSI/blocker labels stay centralized and bounce formatting lives in one TS module.

**Rationale:** User asked for presentation layer on frontend; backend focuses on metadata completeness.

### 4. Setup layer toggle

**Decision:** Add `showSetupMarkers` state in `ChartPanel` (default `true`), wire to `buildComponentEventChartMarkers` / `buildComponentEventsForView` as `showSetup: boolean`, filter `role === "setup"`. Legend toggle **Show setup** next to entry_block / exit_signal.

### 5. Tests

- **research:** Assert new metadata keys on representative events in `test_ema_bounce_counter_setup_trace_and_events`.
- **frontend:** Vitest for label/tooltip formatter; update marker build test to expect `B1▶` when metadata present; toggle hides setup role.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Spec said "no branch on component_id" | Delta spec narrows prohibition to styling; documents formatter registry for text only |
| Long tooltip clutter | Fixed field order; omit nulls; keep ≤10 lines |
| `effective_bounce_number` 0 on trend events | Use `metadata.event_name` for trend labels; bounce lines only for bounce events |
| Untouched anchor setup shares `role: setup` | Toggle hides all setup events (acceptable v1); instance_id still in tooltip |

## Migration Plan

Deploy research + frontend together. Old cached traces without new metadata keys: formatter falls back to generic `event.label` / tooltip. No DB migration. **Manual QA must refresh signal trace / re-open report** — otherwise it can look like nothing changed. Re-run signal trace or refresh report to see enriched tooltips and bounce-specific labels.

## Open Questions

_None — scope is fixed by user acceptance criteria._
