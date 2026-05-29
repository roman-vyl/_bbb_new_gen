## 1. Согласование proposal

- [ ] 1.1 Согласовать таблицу маппинга и non-goals с автором стратегии
- [ ] 1.2 Зафиксировать concrete catalog-supported consumers/call sites с explicit side-aware evaluation scope по результатам audit
- [ ] 1.3 Зафиксировать, что exit profile selection использует `evaluate_context_consumption` и `ContextConsumptionResult`, без отдельного exit context path

## 2. Audit существующих context-consuming paths

- [ ] 2.1 Найти все прямые `ContextBundle.get(context_ref)` / `apply_*` / `_active_rule_group_for_side` call sites
- [ ] 2.2 Классифицировать каждый call site: side-aware context consumer; diagnostic call site; exit policy context usage; truly side-agnostic raw-state consumer
- [ ] 2.3 Зафиксировать migration target для каждого: `evaluate_context_consumption` или `ContextConsumptionResult` / recorded result from evaluator
- [ ] 2.4 Убедиться, что ни один существующий context-consuming path не остаётся на direct `ContextBundle.get + apply_*`

## 3. Контракты и общий слой (research)

- [ ] 3.1 Ввести тип `SideAwareEvaluationContext` (`evaluated_side` из direction/evaluation scope, `ContextBundle`, `index`, optional `regime_cache`, optional diagnostics sink)
- [ ] 3.2 Ввести `evaluate_context_consumption(consumption, eval_ctx) -> ContextConsumptionResult` для raw-state gates, side-relative regime gates и exit profile selection
- [ ] 3.3 Extract `resolve_htf_regime(raw_state, side)` — единственное место таблицы маппинга; refactor `_active_rule_group_for_side` to delegate (не оставлять параллельный helper)
- [ ] 3.4 Реализовать handler `htf_regime_gate` внутри общего слоя (не экспортировать маппинг наружу)
- [ ] 3.5 Запретить hardcoded `for side in ["long", "short"]` inside evaluator; side приходит только из direction/evaluation scope
- [ ] 3.6 Опциональный кэш `(context_ref, evaluated_side) -> resolved regime series` в eval context или оценщике (не global singleton, не pass/fail cache)
- [ ] 3.7 `validate_htf_regime_gate_params`: `allowed_regimes` required, non-empty, only `aligned/countertrend/neutral`

## 4. Миграция call sites (research)

- [ ] 4.1 Context-consuming compile/evaluation paths → делегирование общему оценщику
- [ ] 4.2 `signal_trace` diagnostic records → `ContextConsumptionResult` / recorded result from evaluator + `evaluated_side`
- [ ] 4.3 `consumption_trace.py` → `ContextConsumptionResult` / recorded result from evaluator (убрать прямой `bundle.get` + `apply_htf_state_gate`)
- [ ] 4.4 `consumption_attribution_for_trade` → `ContextConsumptionResult` / recorded result from evaluator с side из trade direction
- [ ] 4.5 Exit policy / `exit_profile_by_htf_state` → `evaluate_context_consumption` + `ContextConsumptionResult` (убрать старый отдельный path)
- [ ] 4.6 Убедиться, что ни один модуль вне shared layer не вызывает `resolve_htf_regime` / `_active_rule_group_for_side` для policy-level context usage

## 5. API и каталог

- [ ] 5.1 Зарегистрировать `htf_regime_gate` в research_api component catalog для всех catalog-supported consumers с explicit side context
- [ ] 5.2 Params schema для required `allowed_regimes` в каталоге

## 6. Frontend (Composer)

- [ ] 6.1 Catalog-driven UI для `allowed_regimes` (без client-side mapping)

## 7. Тесты и верификация

- [ ] 7.1 Unit-тесты таблицы маппинга (все строки long/short × up/down/neutral)
- [ ] 7.2 Both-side asymmetry: один raw bar, разный pass/fail per side
- [ ] 7.3 Validation: missing/empty/unknown `allowed_regimes` fails
- [ ] 7.4 Тест: два потребителя с одним `context_ref` получают согласованный результат (кэш)
- [ ] 7.5 Тест: `htf_state_gate` поведение не изменилось через shared evaluator
- [ ] 7.6 Regression: diagnostic call sites согласованы с compile/evaluation path
- [ ] 7.7 Regression: exit profile selection использует `evaluate_context_consumption` / `ContextConsumptionResult` и не имеет direct `ContextBundle.get + apply_*`
- [ ] 7.8 `openspec validate side-relative-context-regimes-v1 --strict`
