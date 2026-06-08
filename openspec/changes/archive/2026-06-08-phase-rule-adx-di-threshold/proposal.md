## Why

`phase_rules[].condition` is a temporary hardcoded union on `condition.type` (`mfe_atr`, `mfe_pct`, `bars_in_trade`). That shape diverges from the project's component-style contracts (`component_id` + `params` used by blockers, setups, `stop_management`, `runtime_exits`) and does not scale as new phase conditions appear.

We have not accumulated valuable backward compatibility on this wire shape. Now is the right moment to normalize phase rule conditions before adding `adx_di_threshold` — a side-aware ADX/DI impulse criterion for phase transitions (5m → `protected` / BE; 1h → `runner` / hold), per `docs/research/22_phase_rule_condition.md`.

## What Changes

**BREAKING:** Replace `phase_rules[].condition.type` + flat fields with:

```json
"condition": {
  "component_id": "<allowlisted_id>",
  "params": { ... }
}
```

- Introduce an **internal allowlisted** phase-rule condition registry/dispatcher (not entry components, not external plugins).
- Each condition component owns: parse/validate params → plan features → evaluate at end-of-bar → optional `phase_changed` metadata.
- Migrate built-in conditions into the new model:
  - `mfe_atr`
  - `mfe_pct`
  - `bars_in_trade` (`params.threshold`: integer `>= 1`; non-integer rejected)
- Add new condition component: `adx_di_threshold` (phase rule only — not blocker, stop, take, or runtime exit).
- Reject configs using legacy `condition.type` (no dual-read, no automatic migration).
- Update smoke fixtures, experiment specs, Composer phase-rules editor, and tests to the new wire shape.
- Update all in-repo configs that use legacy `condition.type`.

## Capabilities

### New standalone capabilities

None. `adx_di_threshold` and the component-style condition registry extend existing runtime/composer surfaces via delta specs — no new top-level OpenSpec capability folder.

### Modified capabilities

- `trade-exit-management-runtime`: component-style `phase_rules[].condition` contract; allowlisted condition registry; ported built-ins; new `adx_di_threshold` condition component; feature planning dispatch; runtime evaluation dispatch; event metadata; **breaking** rejection of `condition.type`.
- `composer-exit-management`: phase-rules editor authors `component_id` + `params`; catalog/picker for allowlisted condition components; rejects legacy `condition.type` in drafts.

## Impact

| Layer | Impact |
|-------|--------|
| **research** | `spec.py`, `instance_loader.py`, new `phase_rule_conditions/` (or equivalent) registry module, `features/plan.py`, `execution/trade_runtime.py`, `execution/backtest.py`, smoke JSON/YAML, tests |
| **research_api** | Passthrough of richer `phase_changed` metadata (`condition_component_id`, diagnostics) in existing event fields |
| **frontend** | `composerPhaseRulesEditor.ts`, `PhaseRulesEditor.tsx`, condition component catalog metadata, validation |
| **data_engine** | None |

## Backward compatibility policy

| Policy | Decision |
|--------|----------|
| Legacy `condition.type` | **Unsupported** — validation fails with explicit error |
| Dual-read / adapter shim | **No** |
| JSON migration tool | **No** — manual update of saved configs |
| In-repo fixtures | **Must** be updated in this change |
| External user configs | Authors must rewrite `condition` to `component_id` + `params` |

Rationale: low adoption of the temporary union; early normalization avoids carrying two parsers, two Composer UIs, and ambiguous event metadata forever.

## Non-goals

- Adapt or extend entry ADX blocker (`trend_strength_episode_blocker`) semantics
- New entry blocker, ADX stop manager, ADX take manager, ADX runtime exit
- Arbitrary external/plugin condition loading (`component_id` is internal allowlist only)
- Rolling max, crossed-above, ADX slope, peak detection, DI spread, volume confirmation, N-bar hold for `adx_di_threshold` v1
- Frontend ADX chart overlay
- Changes to `data_engine/`
- Dual-read or silent migration from `condition.type`

## Acceptance criteria

1. All four allowlisted condition components (`mfe_atr`, `mfe_pct`, `bars_in_trade`, `adx_di_threshold`) parse, plan features, and evaluate through the registry dispatcher.
2. Legacy `condition.type` configs fail validation with a clear, path-qualified error.
3. Existing managed smoke behavior is preserved after fixture rewrite (same phase semantics for equivalent params).
4. `adx_di_threshold` alone can schedule ADX/DMI features without a blocker present.
5. `phase_changed` events include `condition_component_id` (and ADX/DI diagnostics when applicable).
6. Composer round-trips component-style phase rules; legacy `condition.type` drafts fail validate.
7. Delayed activation unchanged: phase on end-of-bar N, managed effects from N+1.
