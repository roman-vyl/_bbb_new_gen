## Why

Side-relative HTF gating is fully covered by `htf_regime_gate` via the shared context policy evaluator. Keeping legacy `htf_state_gate` as a parallel consumer policy adds catalog, validation, runtime, and UI complexity without a supported authoring path. Strategy authors accept breaking cleanup: old configs and reports using `htf_state_gate` are unsupported.

## What Changes

- **BREAKING**: Remove `htf_state_gate` from component catalog, validation, runtime handlers, and Strategy Composer.
- Keep raw provider output `htf_state = up/down/neutral` unchanged; do not move aligned/countertrend into the provider.
- Single HTF blocker consumption policy: `htf_regime_gate` with required `allowed_regimes`.
- Old configs/reports with `htf_state_gate` fail validation; no auto-migration.
- Remove legacy tests and fixtures tied to `htf_state_gate` / `allowed_states` for HTF consumption.
- Update OpenSpec to drop legacy-compatibility language.

## Capabilities

### Modified Capabilities

- `context-consumption-policy`: Remove `htf_state_gate`; document unsupported legacy configs; clarify raw provider state remains.
- `workbench-strategy-contexts`: Composer catalog-driven policy list exposes only `htf_regime_gate` for HTF blocker gating.

## Impact

- **research/**: policies, evaluation, validation, instance loader, consumption trace.
- **research_api/**: component catalog.
- **frontend/**: composer authoring, diagnostics display, tests.
- **data_engine/**: Out of scope — not touched.
- **tests/**: rewrite/remove legacy `htf_state_gate` coverage; add rejection/catalog tests.
