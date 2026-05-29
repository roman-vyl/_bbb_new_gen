## 1. Draft validation

- [x] 1.1 Add `collectEntryContextConsumptionErrors` for enabled entry consumers (context_ref, policy_id, htf_regime_gate allowed_regimes non-empty)
- [x] 1.2 Wire into `collectComposerStrategyErrors` / draft save path

## 2. Serialization helpers

- [x] 2.1 Ensure `prepareStrategyForApi` preserves `htf_regime_gate` params and strips empty optional blocks correctly
- [x] 2.2 Avoid ParamFields default bleed for `allowed_regimes` (no implicit fill on policy switch)

## 3. Tests

- [x] 3.1 Unit tests: validation for empty/missing `allowed_regimes`
- [x] 3.2 Unit tests: `htf_regime_gate` roundtrip serialization
- [x] 3.3 Component test: policy selector lists `htf_regime_gate` from catalog; multiselect regimes
- [x] 3.4 Regression: `htf_state_gate` unchanged

## 4. Diagnostics display

- [x] 4.1 Show trace fields (`allowed_regimes`, `resolved_regime`, etc.) when present in bar inspector / trade diagnostics

## 5. Verification

- [x] 5.1 `npm test` in frontend for touched files
- [x] 5.2 Playwright/MCP: Composer create → select htf_regime_gate → save → reload roundtrip
- [x] 5.3 Confirm saved payload shape and no frontend mapping code
