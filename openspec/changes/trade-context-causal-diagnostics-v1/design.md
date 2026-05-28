## Context

### Two diagnostic layers (post Phase 4)

| Layer | Payload | Question answered |
|-------|---------|-------------------|
| **Wiring / metadata** | `trade_records.entry_context_consumption`, `exit_context_consumption` | Which consumer and policy were configured for this trade? |
| **Causal / per-bar** | `signal_trace.context_consumption_trace`, `htf_context.state[]`, exit `outcome.profile_*` | On bar *i*, did policy allow context and which state/profile resulted? |

Phase 4 Chart trade panel implemented wiring only. Bar Inspector shows causal fields for **selected bar**. Trade focus does not map `entry_time_ms` → trace index.

### Current gaps (code)

- `consumption_attribution_for_trade` ignores `entry_idx` and sets `applied: True` always (`context/consumption_trace.py`).
- Exit-policy trace record uses `context_applied` all `true`; causality is in `outcome.profile_long` / `profile_short`.
- `ChartTradeDiagnostics` does not read `signalTrace` for entry/exit bars.

## Goals / Non-Goals

**Goals**

- Selected trade on Chart shows **both** wiring attribution and **entry/exit bar causal** rows when signal trace window covers those bars.
- Labels distinguish: `entry_context_state` (raw HTF state), v5 consumption (wiring), causal block (gate allow/block + inputs).
- Trade v5 `applied` matches gate at entry bar for `htf_state_gate` blockers.
- Shared frontend helper: `resolveBarIndexAtTime`, `lookupConsumptionAtBar`, `formatGateDecision` — used by Chart trade panel; Bar Inspector may adopt formatters without behavior change.

**Non-Goals**

- Recompute masks or contexts in frontend.
- Persist full per-bar causal history on each trade row (trace remains source of truth).
- Reports tab parity in v1 (Chart-first slice; Reports optional follow-up).

## Decisions

### 1. Causal source of truth remains signal trace

Trade panel causal sections MUST be derived from the **already loaded** `SignalTraceBundle` in `WorkbenchContext`, keyed by:

- `entry_time_ms` → bar index (same logic as `signalTraceLookup.barIndexAtTime`)
- `exit_time_ms` for closed trades

If trace is not loaded, window misses entry/exit bar, or `context_overlay_ref` prevents HTF meta — show explicit empty state (“Load signal trace” / “Bar outside trace window”), not silent fallback to wiring-only labels as causal.

### 2. Entry bar causal row (blockers + `htf_state_gate`)

For each `context_consumption_trace` record with `role: blockers` and matching `policy_id: htf_state_gate`:

| Field | Source |
|-------|--------|
| `state` | `htf_context.state[index]` when overlay ref matches record `context_ref` |
| `allowed_states` | strategy spec policy params (display only) |
| `gate` | `context_applied[index]` → `allow` / `block` |
| `context_ref`, `policy_id`, `component_id`, `instance_id` | trace record |

**Wiring section** (existing v5) stays separate with subtitle “Configured consumer (not bar decision)”.

### 3. Exit bar causal row

For `role: exit_policy`:

| Field | Source |
|-------|--------|
| `profile` (long/short) | `outcome.profile_long[index]` or `profile_short[index]` by trade direction |
| `htf_state` | `htf_context.state[index]` at exit bar |
| `context_ref`, `policy_id` | trace record |

Do not present exit `context_applied` as gate semantics (today always true); label as “profile selection active” only if needed.

### 4. Backend: honest `applied` on trade records

`consumption_attribution_for_trade(spec, entry_idx=…)`:

- For `htf_state_gate` blocker: `applied = gate.iloc[entry_idx]` from same `apply_htf_state_gate` path as trace (requires `ContextBundle` or recomputed gate from spec+df — prefer passing prebuilt gate from backtest pipeline to avoid drift).
- For exit consumption: `applied` MAY remain `true` when exit policy consumed context on that trade, or derive from profile != default at entry — document chosen rule in spec.

Minimal v1: fix **entry blocker gate** only; exit `applied` documented as “consumption enabled” not gate.

### 5. Optional trace enrichment (Phase 1b)

Add to blocker trace `outcome`:

```json
{
  "state_at_bar": ["up", "down", ...],
  "allowed_states": ["up"]
}
```

Only for `htf_state_gate`. Enables UI without re-reading spec; slightly larger trace payload. **Optional** task — UI can read spec in v1.

### 6. UI structure in `ChartTradeDiagnostics`

```
Trade #N
[result summary]
[core fields]
Diagnostics (v4 quality, profiles…)
── Wiring ──
  Entry context consumption (configured)
  Exit context consumption (configured)
── Causal ──
  Entry bar decision (@ ISO time)
  Exit bar decision (@ ISO time)   [closed only]
Active exit components
```

Reuse `tradeDiagnosticsFields` label hints for the three-way distinction:

- `entry_context_state` → “HTF state at entry”
- wiring consumption → “Configured consumer”
- causal → “Gate decision at entry bar”

## Risks / Mitigations

| Risk | Mitigation |
|------|------------|
| Trace window shorter than trade entry | Show warning + link hint to zoom/load trace (existing trace load policy) |
| `context_overlay_ref` ≠ blocker `context_ref` | Causal HTF state from trace meta `context_ref` on record, not overlay picker alone |
| Backend/trade vs trace drift | Single gate function; unit test entry_idx alignment |

## Files (likely)

| Area | Files |
|------|--------|
| research | `context/consumption_trace.py`, `execution/results.py`, `execution/backtest.py` (pass gate/bundle) |
| frontend | `ChartTradeDiagnostics.tsx`, new `tradeContextCausalDiagnostics.ts`, `ChartBarInspector.tsx` (formatters only), `WorkbenchContext.tsx` (pass `signalTrace`) |
| tests | `tests/test_context_consumption_trace.py`, `ChartTradeDiagnostics.test.tsx` |

## Open questions

- Reports tab: same causal blocks in v1 or Chart-only? **Default: Chart-only.**
- Persist `allowed_states` on trade row? **No** — trace/spec display sufficient.
