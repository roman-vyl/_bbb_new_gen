# Frontend chart overlays — trade-management diagnostics (tasks 7.3a–7.3d)

Parent change: `trade-exit-management-runtime-v1`.

This document splits the original task **7.3** so delivered Slice 8B work is closed honestly without claiming MFE peak or active-stop overlays are done.

Related backend contract: variant-level `trade_management_events` (full report only); v1 emits `phase_changed` and `exit_executed` only. Reserved but not emitted in v1: `active_stop_updated`, `exit_rule_triggered`.

---

## 7.3a — Phase and exit event markers ✅ (Slice 8B, done)

### Goal

Read-only chart markers from existing report events. No frontend recomputation of phase, MFE, MAE, or stops.

### Delivered

| Item | Status | Notes |
|------|--------|-------|
| `phase_changed` markers | ✅ | Labels: Proven / Protected / Runner / Exhaust (from `to_phase`) |
| `exit_executed` marker | ✅ | Label: Exit |
| Legend toggles | ✅ | **Phases** and **Exits** (default OFF) |
| Selected-trade filter | ✅ | When `selectedTradeId` set, only matching `trade_id` events |
| View-window filter | ✅ | Events clipped to loaded chart candles |
| Spam guard | ✅ | Max 200 markers when no trade selected |
| Auto-enable toggles | ✅ | On `selectTrade` when variant has events for that trade |
| Old reports | ✅ | No events → toggles hidden, no crash |

### Architecture

- **Mapping:** `frontend/src/features/chart/tradeManagementChartEvents.ts`
  - `buildTradeManagementEventsForView()` — entry from ChartPanel marker rebuild
  - `filterTradeManagementEventsForView()` — trade / time / cap filtering
  - `buildTradeManagementEventChartMarkers()` — `SeriesMarker` output
  - `tradeManagementEventTooltip()` — defensive tooltip from available payload fields
- **Integration:** `ChartPanel.tsx` merges with existing trade + component markers (same pipeline, no second chart state owner)
- **Controls:** `ChartMarkerLegend.tsx` — Trade management group
- **State:** `WorkbenchContext.tsx` — `chartShowTradeManagementPhaseMarkers`, `chartShowTradeManagementExitMarkers`

### Data source (read-only)

```
variant.trade_management_events[]
  ├── phase_changed  → phase marker
  └── exit_executed  → Exit marker
```

Time: `event.time_ms` via `msToChartTime`. Missing `time_ms` → event skipped.

### Explicit non-goals (8B)

- No active stop line
- No MFE peak price line/marker
- No Composer authoring
- No API / report / runtime changes
- No mass event table in Reports tab

### Tests

- `frontend/src/features/chart/tradeManagementChartEvents.test.ts`
- `frontend/src/features/chart/ChartMarkerLegend.test.tsx`
- Full suite: 341+ frontend tests green at time of delivery

---

## 7.3b — MFE peak marker ❌ (future slice)

### Goal

Show the trade’s favorable extreme (MFE peak) on the chart for the selected trade (or filtered visible trades), using **report data only** — not recomputing MFE in the browser.

### Required payload (price is not enough)

A correct MFE peak marker needs **both**:

1. **Peak price** — e.g. `mfe_price`, `best_price_before_exit`
2. **Peak bar/time** — explicit timestamp or bar offset from entry

`best_price_before_exit` alone places a horizontal line at the right level but not at the right bar. The frontend **must not** infer peak time by scanning OHLCV or recomputing MFE from candles.

### Candidate data sources (may suffice without new backend — verify first)

Per closed trade, prefer existing report fields before new event types or schema additions:

| Source | Fields | Peak time? | Notes |
|--------|--------|------------|-------|
| `trade_records[]` quality block | `mfe_price`, `mfe_pct`, `bars_to_mfe` | **Indirect** | `bars_to_mfe` is bars from entry (inclusive semantics match runtime). Frontend can map to chart time only via `entry_time_ms` + report `timeframe` — acceptable **only if** this offset is stable and tested on real reports; no OHLCV scan. |
| `trade_records[].path_diagnostics.mfe` | `price_move`, `pct`, `time_ms`, `bars_from_entry` | **Yes** | Preferred when path diagnostics are enabled on the run (`time_ms` is authoritative). |
| `trade_records[].trade_management` | `best_price_before_exit`, phase MFE % fields | **No** | Price/phase snapshots only; not sufficient alone for bar-accurate peak marker. |
| `trade_management_events[]` | `mfe_pct` per event | **Partial** | Point-in-time at phase transition, not necessarily global MFE peak. |

**Likely outcome:** if neither `path_diagnostics.mfe.time_ms` nor a verified `bars_to_mfe` → time mapping is available on target runs, 7.3b becomes a **small backend/report slice** (e.g. expose `mfe_time_ms` / `mfe_bar_index` on the trade quality block) rather than frontend-only work. That is an open design decision, not a blocker for 7.3a.

### Open design questions

1. **Peak bar/time source:** Confirm which field is canonical — `path_diagnostics.mfe.time_ms`, derived time from `bars_to_mfe` + `entry_time_ms`, or a new stable field on the trade record. If none are present on a run, hide the overlay (do not guess).
2. **Marker shape:** Horizontal price line vs bar marker vs both (price line alone is misleading without correct bar anchor).
3. **Toggle:** Separate “MFE peak” under Trade management, or coupled to selected trade only.
4. **Multi-trade view:** Show peaks only for selected trade vs all visible closed trades.
5. **Backend slice needed?** Audit smoke/diagnostic reports: if peak time is missing on typical configs, add explicit serialization before frontend 7.3b.

### Guardrails

- Do not recompute MFE/MAE series in the browser from OHLCV.
- Do not change viewport / `fitContent` behavior when enabling overlay.
- Reuse chart marker / price-line patterns (`chartTradePriceLines`, marker pipeline).

### Suggested acceptance (when implemented)

- Selected trade shows one peak indicator at **correct bar/time and price** when authoritative time fields exist.
- Price-only or time-only payload → no marker (or defer until backend adds stable peak time).
- Missing fields → no crash.
- Toggle OFF hides peak; existing 7.3a markers unchanged.

---

## 7.3c — Active stop line ❌ (future / blocked)

### Goal

Visualize the diagnostic **active protective stop** level over the trade life (read-only line or stepped line).

### Blocker

v1 runtime **does not emit** `active_stop_updated` events. `diagnostic_only` mode explicitly does not apply `stop_management`; `stop_price` on some events reflects state at transition/exit but not a full stop history.

Backend contract (from design):

> `active_stop_updated` and `exit_rule_triggered` are reserved; only emitted when behavior-changing stop/runtime exits are implemented.

### Prerequisites before frontend slice

1. Backend emits ordered `active_stop_updated` (or equivalent time series) in full report, **or**
2. Agreed alternative payload (e.g. per-bar stop samples) with stable schema — requires separate OpenSpec / API slice.

### Guardrails

- **Blocked** on frontend-only work until stop history exists in report/API.
- No inferring stop path from phase rules or ATR on the client.
- No behavior-changing stop logic in Workbench.

### Suggested acceptance (when unblocked)

- Selected trade: stop line segments or stepped line from emitted events only.
- Toggle independent from phase/exit markers.
- Old reports / diagnostic-only runs without stop events → overlay hidden.

---

## 7.3d — Exit-layer label overlay (partial → future)

### Current state (partial, via 7.3a)

`exit_executed` renders an **Exit** marker. Tooltip may include, when present:

- `exit_layer` (derived from trade record or `metadata.exit_reason` prefix)
- `exit_rule_id`, `exit_component_id`, `exit_reason`, phase fields

There is **no** separate on-chart label such as `SL` / `SIG` / `BE` distinct from the generic Exit marker.

### Future option

Dedicated exit-layer chip at exit bar (e.g. stop_loss / signal / break_even) aligned with Reports `exit_layer_breakdown` semantics, still read-only from report attribution.

Can ship as small follow-up after 7.3b/7.3c or independently if payload is sufficient.

---

## Task matrix (summary)

| Task | Scope | Status |
|------|-------|--------|
| **7.3a** | Phase + exit event markers, toggles, filtering | ✅ Slice 8B |
| **7.3b** | MFE peak marker | ❌ Future |
| **7.3c** | Active stop line | ❌ Blocked on backend events |
| **7.3d** | Exit-layer label overlay | ⚠️ Partial (Exit marker + tooltip only) |

---

## References

- Slice 8A: Reports — `TradeManagementDiagnosticsPanel`, types in `frontend/src/api/types.ts`
- Slice 8B: Chart — `tradeManagementChartEvents.ts`, `ChartPanel.tsx` marker merge
- Backend events: `research/strategies/ema_pullback/execution/trade_runtime.py`
- OpenSpec tasks: `tasks.md` §7
