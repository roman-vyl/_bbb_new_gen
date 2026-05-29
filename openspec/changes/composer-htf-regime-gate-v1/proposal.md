## Why

Backend change `side-relative-context-regimes-v1` introduced catalog-backed `htf_regime_gate` with mandatory `allowed_regimes` (`aligned`, `countertrend`, `neutral`). Strategy Composer must author, load, display, and save `context_consumption` in the exact backend shape without computing side-relative mapping in the browser. Gaps remain in draft validation, diagnostics display, tests, and verified roundtrip UX for the new policy alongside legacy `htf_state_gate`.

## What Changes

- Align Strategy Composer context consumption UI with `research_api` component catalog: policy list per `(role, component_id)` from catalog response (including `htf_regime_gate` when exposed).
- Enforce explicit `context_ref` selection (no silent first-context default).
- Render `allowed_regimes` multiselect from catalog `params_schema` for `htf_regime_gate`; block save/validate when empty.
- Serialize `context_consumption` as backend-compatible YAML/JSON (`allowed_regimes`, not `allowed_states` or raw up/down).
- Preserve `htf_state_gate` + `allowed_states` without auto-migration.
- Extend client-side draft validation for entry consumers (blockers/setup/trigger) mirroring backend rules for required `context_ref`, `policy_id`, and non-empty `allowed_regimes`.
- Display `htf_regime_gate` policy params and diagnostic fields (`allowed_regimes`, `resolved_regime`, etc.) as read-only backend data where already shown.
- Unit tests and Playwright/MCP acceptance for create → save → reload roundtrip.

## Capabilities

### New Capabilities

_None — frontend correction under existing workbench/context contracts._

### Modified Capabilities

- `workbench-strategy-contexts`: Composer MUST support `htf_regime_gate` authoring, validation, roundtrip, and diagnostics display per backend catalog; explicit requirements for `allowed_regimes` and no frontend regime mapping.

## Impact

- **frontend/**: `ComposerPanel`, `ParamFields`, `composerStrategyContexts`, draft validation, chart/report diagnostics display, Vitest tests.
- **research_api/**: No semantic changes expected; catalog already exposes `htf_regime_gate` on blockers. Document only if metadata gap found.
- **research/**, **data_engine/**: Out of scope.
