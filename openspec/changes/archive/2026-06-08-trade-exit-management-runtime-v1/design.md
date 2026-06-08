## Context

`research.strategies.ema_pullback.execution.exit_management` already exists as a stateful combiner for `break_even_stop` v1. It consumes compiled entries, profile-aware exit-policy outputs, OHLCV, and exit attribution, and it is covered by `openspec/specs/exit-management-combiner/spec.md`.

The requested runtime model should evolve that existing research execution layer rather than create a second simulation. The target shape is:

```json
{
  "trade_management": {
    "exit_policy": {},
    "exit_management": {}
  }
}
```

`exit_policy` remains the declarative catalog of exits. `exit_management` becomes the stateful controller for open-trade phases, side-aware MFE/MAE, active-stop diagnostics, event trace, and later behavior-changing stop/runtime exits.

The first implementation slice is intentionally diagnostic-only: it proves the runtime state model and report contracts while preserving old strategy results.

The existing `break_even_stop` `exit_management.always_on/profiles/rules` shape is legacy. It may remain temporarily as deprecated backward-compatible parsing/runtime support for existing artifacts, but it is not a supported product path and must not be used as a building block for the new runtime architecture.

## Goals / Non-Goals

**Goals:**

- Add an optional `trade_management.exit_management` config contract with `mode`, `phase_rules`, `stop_management`, and `runtime_exits`.
- Support v1 `mode: "diagnostic_only"` that computes phases and diagnostics without altering the existing trade path.
- Track one `TradeRuntimeState` per real open trade with side-aware favorable/adverse extremes.
- Evaluate phase transitions from config-driven rules, not hardcoded thresholds.
- Emit runtime events for phase changes and final exit attribution.
- Add closed-trade `trade_management` diagnostics and variant-level `trade_management_summary` for closed trades.
- Preserve behavior and report loading for configs without `exit_management`.

**Non-Goals:**

- No BE/protective stop activation in the first slice, even though the config contract reserves `stop_management`.
- No EMA trailing, RSI transition cap, context-loss runner exit, or other behavior-changing `runtime_exits` in the first slice.
- No legacy BE integration into diagnostic runtime v1.
- No frontend/chart markers or Workbench Composer authoring.
- No changes to `data_engine`, candle storage, or BFF routes.

## End-state Integration

Backend runtime is not considered fully productized until:

1. Reports expose stable optional fields.
2. `research_api` can serve them without shape loss.
3. The frontend report model can load them.
4. Chart/report UI can visualize phase transitions and runner diagnostics.

Status (2026-06-07):

- Items 1–3: done (backend §2–§3, API §5, frontend types/reports §7.1–7.2, §7.4).
- Item 4 (chart): **partial** — phase/exit event markers done (§7.3a); MFE peak (§7.3b), active stop line (§7.3c), full exit-layer overlay (§7.3d) remain future.

Chart overlay rollout detail: `frontend-chart-overlays.md`.

## Decisions

### Decision: Extend the existing research execution runtime

Implement runtime state in or under `research/strategies/ema_pullback/execution/exit_management.py`, with small helper modules only if the file becomes difficult to reason about.

Rationale: this keeps the runtime inside the current `ema_pullback` execution flow and reuses existing compiled entries, exit-policy outputs, profile locks, OHLCV alignment, and exit attribution.

Alternative considered: add a new standalone simulator beside vectorbt/current managed execution. Rejected because it would create the exact second trade path the change is meant to avoid.

Likely touched files:

- `research/strategies/ema_pullback/spec.py`
- `research/strategies/ema_pullback/execution/exit_management.py`
- `research/strategies/ema_pullback/execution/exits.py`
- `research/strategies/ema_pullback/execution/exit_attribution.py`
- `research/strategies/ema_pullback/execution/results.py`
- `research/experiments/summary.py`
- focused tests/fixtures under the existing research test layout

### Decision: Diagnostic-only is a first-class mode

`exit_management.mode` SHALL support `diagnostic_only` for v1. In this mode, runtime state and phase events are computed from the real trade lifecycle, but no stop, signal, or exit mask is changed.

Rationale: this gives immediate research value: we can measure how many trades reach `proven`, `protected`, or `runner` and what they give back without introducing a new trading hypothesis.

Alternative considered: implement BE/trailing together with phases. Rejected because it would make parity failures and PF changes hard to attribute.

### Decision: Legacy BE is parser compatibility only

The archived `break_even_stop` management shape (`exit_management.always_on/profiles/rules`) SHALL NOT participate in the new phase-based runtime architecture. During this change it may remain only as deprecated backward-compatible parser/runtime behavior for existing configs and fixtures.

Rationale: the new runtime architecture is `phase_rules`, `stop_management`, and `runtime_exits`; mixing the old BE shape into it would preserve two models and make future stop-management semantics ambiguous.

Cleanup requirement: after diagnostic runtime v1 lands, create a separate cleanup slice to remove or archive the legacy BE shape and any remaining product-facing references.

### Decision: Phase rules are monotonic and config-driven

Phase transitions use ordered `phase_rules[]` with `rule_id`, `to_phase`, and a condition. V1 supports:

- `mfe_atr`
- `mfe_pct`
- `bars_in_trade`

The runtime never moves a trade backward to an earlier phase. `max_phase_reached` is the highest phase reached in the configured phase order.

Rationale: phase thresholds need to be experiment-configurable and reportable. Monotonic progression keeps downstream summaries stable and avoids ambiguous phase churn.

Alternative considered: hardcode `1 ATR`, `1.5 ATR`, and `2.5 ATR`. Rejected because those values are research hypotheses, not runtime architecture.

### Decision: Side-aware favorable/adverse price semantics

`best_price` means favorable extreme:

- long: max high since entry
- short: min low since entry

`worst_price` means adverse extreme:

- long: min low since entry
- short: max high since entry

MFE/MAE percentages derive from those semantics relative to entry price.

Rationale: long-only naming such as "max price" would make short diagnostics misleading.

### Decision: Report diagnostics are additive and optional within schema 6

Closed trades with runtime diagnostics get a nested `trade_management` block. Variants get `trade_management_summary` and `trade_management_events` when at least one closed trade has runtime diagnostics. Open trades omit the block in v1. These fields stay additive under `report_schema_version: 6` so existing frontend/report consumers that gate on v4-v6 continue to work.

Rationale: additive optional fields preserve historical report loading and keep open-trade semantics out of the first slice.

Alternative considered: flatten all phase fields into trade records. Rejected because the existing trade record already has many diagnostic fields and this feature has a cohesive namespace.

### Decision: Runtime trace is the source of attribution

The runtime records `TradeManagementEvent` entries for phase changes and final exit execution in v1, and serializes them as variant-level `trade_management_events` when diagnostic-only mode is enabled. `active_stop_updated` and `exit_rule_triggered` event types are part of the contract, but only emitted when later behavior-changing stop/runtime exits are implemented.

Rationale: traces make PF shifts explainable once behavior-changing rules are enabled, while keeping diagnostic-only trace minimal.

### Decision: Bars in trade uses inclusive bar count

`bars_in_trade` counts the entry bar as 1, matching existing `hold_bars = exit_idx - entry_idx + 1` report semantics.

Rationale: using one counting convention across runtime and reports avoids off-by-one interpretation when phase rules and closed-trade diagnostics are compared.

### Decision: Priority model is explicit before behavior-changing exits

The contract reserves explicit priority ordering:

1. active/protective stop
2. hard SL
3. runtime structure-loss exit
4. RSI overheat cap
5. static signal exits
6. far safety TP

The first diagnostic-only slice does not apply this priority to alter exits, but validation/design MUST require any later runtime exit implementation to use explicit priority rather than incidental ordering.

## Risks / Trade-offs

- Parity drift in diagnostic-only mode -> Add tests comparing trade count, net PnL, PF, and exit reasons against the same config without `exit_management`.
- Runtime state alignment off by one bar -> Use entry/exit indices from actual trade records and assert `bars_in_trade`, phase transition bars, and closed-trade diagnostics on small fixtures.
- ATR condition ambiguity -> V1 `mfe_atr` uses a configured ATR series aligned to the base timeframe; missing/invalid ATR at a bar does not trigger the condition.
- Report schema churn -> Keep the additive runtime diagnostics under report schema 6 and update loaders/summary extraction only enough to tolerate them.
- Existing `break_even_stop` shape differs from the target `phase_rules/stop_management/runtime_exits` shape -> Keep only deprecated compatibility behavior for existing artifacts during this change; do not integrate it into diagnostic runtime v1; schedule a cleanup slice after diagnostic runtime v1.

## Migration Plan

1. Add spec dataclasses/parsing for optional `trade_management.exit_management.mode`, `phase_rules`, `stop_management`, and `runtime_exits`.
2. Implement diagnostic-only runtime state and phase evaluation using actual trade lifecycle data.
3. Attach closed-trade runtime diagnostics and variant-level summary.
4. Add parity and fixture tests.
5. Leave old configs and existing archived BE behavior intact only as deprecated compatibility unless a config opts into the new diagnostic-only contract.
6. After diagnostic runtime v1, run a separate cleanup slice to remove or archive the legacy BE shape.

Rollback is straightforward: configs without `exit_management` retain the old path, and diagnostic-only configs can remove the block to disable runtime diagnostics.

## Resolved Rollout Decisions

- First implementation slice: diagnostic-only runtime state, phase rules, event trace, closed-trade diagnostics, and variant summary.
- Report schema: stay on `report_schema_version: 6` with additive optional fields.
- Bar counting: `bars_in_trade` is inclusive and matches `hold_bars`.
- Runtime trace: serialize v1 events as variant-level `trade_management_events` only when diagnostic-only mode is enabled.
- Legacy BE: deprecated compatibility parser/runtime only; not part of new runtime architecture; cleanup slice follows diagnostic runtime v1.
