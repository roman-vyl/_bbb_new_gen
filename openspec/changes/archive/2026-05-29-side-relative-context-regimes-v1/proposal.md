## Зачем

`htf_regime_gate` — это не blocker-specific feature и не frontend trick. Это generic side-aware context consumption policy.

Провайдер контекста остаётся raw-only: он считает только техническое состояние рынка / HTF EMA-stack и отдаёт `htf_state = up/down/neutral`. Провайдер не знает и не должен знать `long` / `short`, не вычисляет `aligned` / `countertrend` и не получает trade intent.

Side-relative regime появляется только когда есть два факта:

1. raw provider state из уже построенного `ContextBundle`;
2. evaluated side из direction / strategy side evaluation layer.

Только shared context policy evaluator может объединить эти факты:

```text
raw_state + evaluated_side -> resolved_regime
```

Компоненты и diagnostic call sites не должны сами доставать raw state, спрашивать direction component, сравнивать raw `up/down` с `long/short` или реализовывать mapping raw-state-to-regime.

## Что меняется

- **Новая generic политика потребителя** `htf_regime_gate` с обязательным `params.allowed_regimes`: `aligned`, `countertrend`, `neutral`.
- **Policy availability через catalog boundary.** `htf_regime_gate` доступен всем catalog-supported context consumers / call sites, которые:
  - используют `context_consumption.policy`;
  - оцениваются в explicit side-aware evaluation scope;
  - могут вызвать shared context policy evaluator с `SideAwareEvaluationContext`.
- **Side приходит из direction / evaluation scope.** Evaluator не делает hardcoded `for side in ["long", "short"]` и не решает сам, какие стороны прогонять. Он получает `evaluated_side` или side-indexed evaluation info из `DirectionOutput` / side intent / текущего strategy evaluation scope.
- **Shared context policy evaluator** (`evaluate_context_consumption`) — единственная точка, где:
  - достаётся `ContextOutput` из `ContextBundle`;
  - берётся `evaluated_side` из `SideAwareEvaluationContext` / `DirectionOutput`;
  - для `htf_regime_gate` выполняется `raw_state + evaluated_side -> resolved_regime`;
  - применяется `allowed_regimes`;
  - формируется pass/fail mask и diagnostics fields.
- **SideAwareEvaluationContext** MUST предоставлять:
  - `evaluated_side` (`long` | `short`) или side-specific evaluation info from `DirectionOutput`;
  - доступ к уже построенному `ContextBundle`;
  - индекс текущей оценки;
  - optional cache и optional diagnostics sink.
- **Любая policy-level работа с `ContextBundle` MUST** проходить через shared context policy evaluator. Это касается entry/blocker/setup/trigger context consumption, signal trace, consumption trace, attribution, exit policy / exit profile selection и chart/report diagnostics.
- **Кэш (опционально)**: resolved regime series кэшируется по `(context_ref, evaluated_side)` внутри eval context/evaluator, когда `regime_cache` предоставлен. Кэш не global singleton и не кэширует финальный pass/fail для конкретных `allowed_regimes`, потому что разные consumers могут иметь разные params.
- **Валидация и каталог**: `allowed_regimes` обязателен для `htf_regime_gate` и MUST быть непустым списком, содержащим только `aligned`, `countertrend`, `neutral`.
- **Диагностика** (signal trace, consumption trace, attribution, chart/report diagnostics): объясняет то же решение, которое реально применилось в compile/evaluation path, и включает `context_ref`, `policy_id`, `raw_state`, `evaluated_side`, `resolved_regime`, `allowed_regimes`, pass/fail / `context_applied`.
- **Существующий `htf_state_gate` сохраняется** как raw-state policy по `allowed_states = up/down/neutral`; без side-relative mapping, удаления или автоматической миграции, но тоже проходит через shared evaluator.

**Не меняется**

- Выход провайдера: `htf_state` остаётся `up` / `down` / `neutral` только из рынка/фич.
- Конфиг провайдера: без trade side, без aligned/countertrend в `strategy.contexts`.
- Composer не вычисляет aligned/countertrend как source of truth; UI остаётся catalog-driven и validate-driven.
- Backtest/vectorbt получает final masks и не знает про `htf_regime_gate`, `allowed_regimes` или `resolved_regime`.

**Явные non-goals**

- Нет runtime-реализации на шаге propose.
- Нет изменений в `data_engine/`, production `research_api/` или `frontend/` на шаге propose.
- Нет side-логики на стороне провайдера.
- Нет автоматической миграции с `htf_state_gate` на `htf_regime_gate`.
- Нет удаления `htf_state_gate`.
- Нет вычисления aligned/countertrend в Composer UI как авторитетной логики.
- Нет per-component raw-state-to-regime mapping.
- Нет отдельного старого exit context path: `exit_profile_by_htf_state` / exit profile selection MUST использовать `evaluate_context_consumption` и `ContextConsumptionResult`.

## Целевой runtime pipeline

1. **JSON config** содержит `strategy.contexts`, components с `context_consumption`, direction / side intent config. `htf_regime_gate` задаётся как обычная consumer policy:

```yaml
strategy:
  contexts:
    htf_4h_50_100_200:
      provider_id: htf_ema_stack
      params:
        timeframe: 4h
        ema_periods: [50, 100, 200]

  components:
    side_aware_consumers:
      - component_id: example_consumer
        context_consumption:
          context_ref: htf_4h_50_100_200
          policy:
            policy_id: htf_regime_gate
            params:
              allowed_regimes: ["aligned", "neutral"]
```

2. **Loader/parser** превращает JSON в typed StrategySpec / StrategyConfig: contexts, component specs, context_consumption specs, direction spec / side intent spec. На этом этапе ничего торгового не вычисляется.

3. **Validation** проверяет `context_ref`, provider config, catalog-driven availability policy и обязательный `allowed_regimes`.

4. **Feature planning / enrichment** собирает candles, EMA, HTF EMA, indicators и context provider features без lookahead.

5. **Context providers** строят `ContextBundle`. Каждый provider считает только raw context state:
   - EMA50 > EMA100 > EMA200 => raw `htf_state = up`;
   - EMA50 < EMA100 < EMA200 => raw `htf_state = down`;
   - иначе => `neutral`.

6. **Direction / side intent evaluation** строит `DirectionOutput` / side intent: active side, enabled sides, side-specific masks или текущий evaluated side в рамках strategy evaluation scope. Side приходит отсюда, а не из provider и не hardcoded inside evaluator.

7. **SideAwareEvaluationContext** создаётся из evaluation scope: `evaluated_side` или side-specific info from `DirectionOutput`, `ContextBundle`, `index`, optional cache, optional diagnostics sink. Если текущая архитектура не делает физический per-side pass, evaluation scope передаёт side-indexed `DirectionOutput`, а evaluator возвращает side-indexed `ContextConsumptionResult`.

8. **Shared context policy evaluator** получает `context_consumption + eval_ctx` и возвращает `ContextConsumptionResult`: allowed mask, raw/resolved regime diagnostics, policy metadata.

9. **Context-consuming components** считают базовую component mask, вызывают evaluator и комбинируют свою mask с `result.allowed_mask`. Это касается всех catalog-supported side-aware context consumers: blockers, setup, trigger, future entry consumers и любых других consumers, где доступен explicit evaluated side.

10. **Exit policy / exit profile selection** использует тот же `evaluate_context_consumption` и `ContextConsumptionResult`. Старый отдельный путь `ContextBundle.get(context_ref) + apply_exit_profile_by_htf_state` / `_active_rule_group_for_side` недопустим.

11. **Diagnostic call sites** (signal trace, consumption trace, attribution, chart/report diagnostics) не являются отдельными trading components. Они используют `ContextConsumptionResult` / recorded result from evaluator; если recorded result недоступен, они вызывают `evaluate_context_consumption` и не пересчитывают mapping independently.

12. **Signal building / backtest** получает final masks; vectorbt / simulation не читает `ContextBundle` и не применяет consumer policy logic.

## Архитектурное разделение

| Слой | Ответственность | Знает trade side? | Вход / выход |
|------|-----------------|-------------------|--------------|
| **Context provider** | Сырой HTF state из EMA-стека | Нет | `htf_state`: `up` / `down` / `neutral` |
| **Direction / side intent layer** | Определяет active side, enabled sides или side masks | Да | `DirectionOutput` / evaluation scope |
| **SideAwareEvaluationContext** | Склеивает current evaluation scope и context data | Да (`evaluated_side` из direction scope) | `evaluated_side` + `ContextBundle` + `index` |
| **Shared context policy evaluator** | `raw_state` + `evaluated_side` → `resolved_regime`; применение `allowed_regimes` | Получает side из eval context | `ContextConsumptionResult` |
| **Context-consuming component / diagnostic call site** | Передаёт `context_consumption` + eval context в shared evaluator | Нет (не решает режим сам) | Использует evaluator result |

### Централизация (обязательные ограничения)

1. Provider emits only raw `htf_state`: `up` / `down` / `neutral`.
2. Provider MUST NOT знать `long` / `short` и MUST NOT вычислять `aligned` / `countertrend`.
3. Side MUST приходить из direction layer / `DirectionOutput` / текущего strategy evaluation scope.
4. Evaluator MUST NOT hardcode `for side in ["long", "short"]`; он работает в переданном evaluation scope.
5. `SideAwareEvaluationContext` MUST предоставлять evaluated side / side-specific evaluation info, `ContextBundle` и `index`.
6. Shared context policy evaluator MUST разрешать `raw_state + evaluated_side -> resolved_regime` и применять `allowed_regimes`.
7. Context-consuming components, diagnostic call sites and exit policy / exit profile selection MUST use the shared context policy evaluator instead of duplicating raw-state-to-regime mapping.
8. Ни compile path, ни diagnostics, ни exit policy не имеют права напрямую делать `ContextBundle.get(context_ref) + apply_*` / `_active_rule_group_for_side`.
9. Call sites MUST NOT самостоятельно доставать raw state из `ContextBundle`, спрашивать direction component, сравнивать raw `up/down` с `long/short` или реализовывать mapping.

### Таблица маппинга (единственный source of truth)

| Оцениваемая сторона | Raw `htf_state` | Resolved regime |
|---------------------|-----------------|-----------------|
| long | up | aligned |
| long | down | countertrend |
| long | neutral | neutral |
| short | down | aligned |
| short | up | countertrend |
| short | neutral | neutral |

Mapping table должна иметь один source of truth, например `resolve_htf_regime(raw_state, side)`. `htf_regime_gate` и `exit_profile_by_htf_state` используют его через `evaluate_context_consumption`. Нельзя оставлять второй независимый mapping path для exit policy.

## Критерии приёмки (для `/opsx:apply`)

- Провайдер по-прежнему отдаёт только `up` / `down` / `neutral`; side и regimes не появляются в provider output.
- Side берётся из direction / strategy evaluation scope, а не из provider и не из hardcoded loop inside evaluator.
- Before implementation выполнен audit всех существующих context-consuming call sites и они классифицированы как: side-aware context consumers, diagnostic call sites, exit policy context usage, truly side-agnostic raw-state consumers.
- Существует единый shared context policy evaluator; context-consuming components и exit policy / exit profile selection вызывают `evaluate_context_consumption`, а diagnostic call sites используют его `ContextConsumptionResult` / recorded result.
- Ни один существующий context-consuming path не остаётся на прямом `ContextBundle.get(context_ref) + apply_*`.
- `htf_regime_gate` зарегистрирован в policy registry и component catalog для всех catalog-supported consumers/call sites, которые могут предоставить explicit side context.
- `allowed_regimes` обязателен для `htf_regime_gate` и MUST быть непустым списком, содержащим только `aligned`, `countertrend`, `neutral`; validation отклоняет отсутствие param, пустой список и неизвестные значения.
- Per-side evaluation: long использует long-маппинг; short — short; both-side с `allowed_regimes: ["aligned"]` блокирует long на raw `down` и short на raw `up`.
- `htf_state_gate` проходит через shared evaluator как raw-state policy, но его поведение для существующих конфигов не изменено.
- `exit_profile_by_htf_state` / exit profile selection больше не остаётся на отдельном старом path и использует `evaluate_context_consumption` / `ContextConsumptionResult`.
- Trace / diagnostic outcome включает `context_ref`, `policy_id`, `raw_state`, `evaluated_side`, `resolved_regime`, `allowed_regimes`, pass/fail или `context_applied`.
- Unit-тесты покрывают все строки mapping table, both-side asymmetry, обязательность `allowed_regimes`, отсутствие независимой таблицы mapping и согласованность diagnostics с compile/evaluation path.

## Capabilities

### Новые capabilities

- _(нет — поведение расширяет существующий домен context consumption)_

### Изменённые capabilities

- `context-consumption-policy`: ADD generic side-aware policy `htf_regime_gate`, `SideAwareEvaluationContext`, shared context policy evaluator, mandatory `allowed_regimes`, optional `(context_ref, evaluated_side)` cache, diagnostics fields.

## Impact

| Слой | Объём |
|------|-------|
| **research** | Shared context policy evaluator (`context/policies.py` или выделенный модуль), integration with direction/evaluation scope, refactor context-consuming components and diagnostic call sites, validation, tests |
| **research_api** | Component catalog policy registry для `htf_regime_gate` на всех catalog-supported context consumers with explicit side context |
| **frontend** | Composer: catalog-driven params для mandatory `allowed_regimes` (validate через API; без client-side mapping) |
| **data_engine** | _none_ |

**Ссылки**: [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md), [`openspec/specs/context-consumption-policy/spec.md`](../../specs/context-consumption-policy/spec.md), [`openspec/specs/strategy-instance-contexts/spec.md`](../../specs/strategy-instance-contexts/spec.md).

**Связанный код сегодня**: `_active_rule_group_for_side` в `research/strategies/ema_pullback/context/policies.py` — legacy duplicate таблицы для `exit_profile_by_htf_state`. При apply: extract `resolve_htf_regime` как единственный source of truth; refactor exit path и добавить `htf_regime_gate` так, чтобы оба шли через `evaluate_context_consumption`, без параллельного mapping helper.
