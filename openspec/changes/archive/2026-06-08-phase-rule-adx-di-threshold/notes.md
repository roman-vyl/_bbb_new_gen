# Notes — phase rule condition component migration

Research source: `docs/research/22_phase_rule_condition.md`

## Problem statement

`phase_rules[].condition` was implemented as a temporary typed union:

```json
{ "type": "mfe_atr", "threshold": 1.0, "atr": { ... } }
```

This diverges from project component contracts and blocks clean addition of `adx_di_threshold` without growing another ad-hoc union branch in spec, loader, runtime, feature plan, and Composer.

## Target wire shape

```json
{
  "rule_id": "to_proven_at_1atr",
  "to_phase": "proven",
  "condition": {
    "component_id": "mfe_atr",
    "params": {
      "threshold": 1.0,
      "atr": { "timeframe": "base", "period": 14 }
    }
  }
}
```

## Manual rewrite guide (authors)

| Legacy `type` | New `component_id` | `params` |
|---------------|-------------------|----------|
| `mfe_atr` | `mfe_atr` | `{ threshold, atr: { timeframe, period } }` |
| `mfe_pct` | `mfe_pct` | `{ threshold }` |
| `bars_in_trade` | `bars_in_trade` | `{ threshold }` — **integer `>= 1`** (non-integer rejected) |

Example new component:

```json
{
  "component_id": "adx_di_threshold",
  "params": {
    "timeframe": "base",
    "period": 14,
    "adx_threshold": 40,
    "require_di_alignment": true
  }
}
```

## Backward compatibility

- **No dual-read.** Presence of `condition.type` → validation error.
- **No migration script.** Update saved JSON manually using the table above.
- **In-repo configs** updated in implementation tasks (§4).

Validation error message (recommended):

```text
unsupported legacy phase_rules condition.type; use condition.component_id and params
```

## Trading semantics (unchanged layering)

- Phase conditions only allow phase transitions.
- `break_even_stop` still activates via `activate_when.phase_at_least: protected`.
- `take_profile_switch` / `disable_initial_tp` still activates at `runner`.
- ADX/DI is **not** a blocker, stop, take, or runtime exit component.

## Event metadata migration

Prefer `metadata.condition_component_id` over legacy `metadata.condition_type` string. Built-in components use their `component_id` value (`mfe_atr`, not `type` echo).

## Out of scope reminders

See `proposal.md` non-goals. Do not touch entry ADX blocker except shared ADX/DMI feature helper if needed for planning dedup.
