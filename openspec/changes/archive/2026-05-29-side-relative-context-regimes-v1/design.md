## Контекст

`strategy-level-contexts-v1` зафиксировал разделение provider vs consumer: провайдеры отдают сырой HTF state; потребители владеют `context_consumption.policy`. `htf_regime_gate` не является blocker-specific feature: это generic side-aware context consumption policy для catalog-supported consumers/call sites, где есть explicit side-aware evaluation scope.

Сегодня call sites (compile path, signal trace, consumption_trace, attribution) могут сами вызывать `context_bundle.get(context_ref)` и `apply_*`. Для side-relative режимов такой паттерн недопустим: маппинг размажется по компонентам и diagnostic call sites и будет расходиться с exit profile logic.

Exit-политика уже маппит raw state → aligned/countertrend/neutral через `exit_profile_by_htf_state` и `_active_rule_group_for_side` в `policies.py`, но старый отдельный exit context path больше недопустим. Это изменение добавляет generic side-aware gate-политику для всех catalog-supported side-aware context consumers и **централизует** всю policy-level работу с `ContextBundle` в shared context evaluation pipeline через `evaluate_context_consumption`.

## Цели / Non-goals

**Цели:**

- Ввести generic `htf_regime_gate` с обязательным `allowed_regimes` и документированной таблицей маппинга.
- Ввести **shared context policy evaluator** с `SideAwareEvaluationContext`.
- Зафиксировать, что evaluated side приходит из direction layer / `DirectionOutput` / текущего strategy evaluation scope, а не из provider и не из hardcoded loop inside evaluator.
- Запретить per-component raw-state-to-regime mapping.
- Запретить прямой `ContextBundle.get(context_ref) + apply_*` / `_active_rule_group_for_side` во всех compile, diagnostics и exit policy paths.
- Мигрировать exit policy / exit profile selection на `evaluate_context_consumption` и `ContextConsumptionResult`.
- Обогатить диагностику: raw state, side, resolved regime, pass/fail.
- Сохранить `htf_state_gate` для авторов, явно фильтрующих по raw state.

**Non-goals:**

- Изменение provider-компонентов или формы `ContextOutput`.
- Автоматическая миграция существующих инстансов.
- Вычисление режимов во frontend или Composer как авторитетной логики.
- Удаление или deprecation `htf_state_gate` в этом изменении.
- Оставление старого отдельного exit context path.

## Решения

### D1 — Side-relative маппинг только в общем слое политик

**Выбор:** Единая функция `resolve_htf_regime(raw_state, side) -> aligned|countertrend|neutral` в `research/strategies/ema_pullback/context/policies.py` или выделенном policy module — **единственный** source of truth для таблицы маппинга. Существующий `_active_rule_group_for_side` не остаётся параллельным helper: его логика переносится в `resolve_htf_regime`, а `_active_rule_group_for_side` / `apply_exit_profile_by_htf_state` рефакторятся так, чтобы делегировать в `resolve_htf_regime` через shared evaluator. Mapping вызывается **только** из shared layer, не из components или diagnostic call sites напрямую.

**Обоснование:** Один источник истины; провайдер остаётся market-only; exit и `htf_regime_gate` не расходятся по таблице.

**Отвергнуто:** «Переиспользовать `_active_rule_group_for_side` как есть» — оставляет второй независимый mapping path; дублирование маппинга в отдельных components / diagnostics — риск drift.

### D2 — Единый shared context evaluation pipeline

**Выбор:** Ввести единый shared context evaluation pipeline с верхнеуровневой точкой `evaluate_context_consumption`:

```python
evaluate_context_consumption(
    consumption: ContextConsumptionSpec,
    *,
    eval_ctx: SideAwareEvaluationContext,  # side from direction/evaluation scope + ContextBundle + index
) -> ContextConsumptionResult  # gate series, diagnostics fields
```

Все context-consuming components и exit policy / exit profile selection (`signals` compile path, exit profile compiler) делегируют policy-level context work в этот pipeline вместо прямого `bundle.get` + `apply_*` / `_active_rule_group_for_side`.

Diagnostic call sites (`consumption_trace`, `signal_trace`, `consumption_attribution_for_trade`, chart/report diagnostics) читают `ContextConsumptionResult` / recorded result, созданный этим pipeline. Если recorded result недоступен в конкретном diagnostic entry point, diagnostic call site вызывает тот же `evaluate_context_consumption`; он всё равно не имеет собственного context access / mapping path.

**Обоснование:** Выполняет требование «components, diagnostics и exit policy не fetch-ят raw state и direction самостоятельно»; единая точка для `htf_state_gate`, `htf_regime_gate` и exit profile selection.

**Отвергнуто:** Расширять только сигнатуру `apply_htf_regime_gate` или оставлять отдельный exit evaluator — call sites всё равно останутся разрозненными.

### D3 — Side comes from direction / evaluation scope

**Выбор:** Явный тип (dataclass / TypedDict) `SideAwareEvaluationContext` строится из current strategy evaluation scope:

| Поле | Тип | Назначение |
|------|-----|------------|
| `evaluated_side` | `TradeSide` | Сторона текущего прохода (`long` \| `short`) из direction layer / `DirectionOutput` |
| `context_bundle` | `ContextBundle` | Уже построенный bundle провайдеров |
| `index` | `pd.Index` | Индекс баров текущей оценки |
| `direction_output` / `side_mask` | опционально | Side-indexed info, если текущая архитектура не делает физический per-side pass |
| `regime_cache` | опционально | Per-pass cache для resolved regime series |

Side-agnostic политики (`htf_state_gate`) игнорируют `evaluated_side`, но получают тот же `SideAwareEvaluationContext` для единообразия API.

**Обоснование:** Side не приходит из provider и не hardcoded inside evaluator. Evaluator не делает `for side in ["long", "short"]`; он работает в переданном evaluation scope.

### D4 — Кэш серий режимов по `(context_ref, evaluated_side)`

**Выбор:** `SideAwareEvaluationContext` содержит опциональный memo dict, который использует shared evaluator:

```python
regime_cache: dict[tuple[str, TradeSide], pd.Series]  # context_ref -> resolved regime series
```

Заполняется при первом обращении к `(context_ref, side)`; последующие потребители с тем же ref/side переиспользуют серию.

**Обоснование:** Несколько consumers / diagnostics с одним `context_ref` на одном side-pass не пересчитывают map; consistency гарантирована одним кодом.

**Ограничение:** Кэш живёт в рамках одного backtest/trace pass; не глобальный singleton.

### D5 — Новый policy id `htf_regime_gate`, required params `allowed_regimes`

**Выбор:** Параллельно `htf_state_gate` / `allowed_states`, но `allowed_regimes` обязателен. Validation rejects missing param, empty list and unknown values. No permissive default for `htf_regime_gate`.

**Обоснование:** Явное намерение автора; конфиг на языке трейдинга.

### D6 — Per-side trace records для `htf_regime_gate`

**Выбор:** При построении `context_consumption_trace` / signal trace для `htf_regime_gate` включать `evaluated_side` в outcome; асимметричные исходы остаются под `signal_trace.long` / `short`.

**Обоснование:** Один raw bar может pass для long и fail для short; diagnostics не сворачиваются в один boolean без side.

### D7 — Catalog и validation parity

**Выбор:** Регистрация `htf_regime_gate` в research_api component catalog для всех catalog-supported context consumers/call sites, которые могут предоставить explicit evaluated side в shared evaluator; `validate_htf_regime_gate_params` в `consumption_validation.py`.

### D8 — Exit policy context usage тоже централизуется

**Выбор:** `exit_profile_by_htf_state` сохраняет внешний config/API shape для совместимости, но её runtime path MUST использовать тот же shared context evaluation pipeline через `evaluate_context_consumption`. `ContextConsumptionResult` для exit profile selection MUST содержать side-specific resolved regime/profile series, нужные exit compiler. Старый отдельный путь `ContextBundle.get(context_ref) + apply_exit_profile_by_htf_state` / `_active_rule_group_for_side` вне shared layer недопустим.

**Примечание:** `resolve_htf_regime` становится единым source of truth для `htf_regime_gate` и exit profile selection. Отдельный shared regime pipeline рядом с evaluator не вводится; exit path идёт через тот же evaluator и общий result contract.

### D9 — Pre-implementation audit всех context-consuming paths

**Выбор:** Перед implementation MUST быть выполнен audit всех мест, которые читают `ContextBundle` или применяют context policies. Каждое место классифицируется:

1. side-aware context consumers -> MUST use `evaluate_context_consumption`;
2. diagnostic call sites -> MUST read `ContextConsumptionResult` / recorded result from evaluator, or invoke `evaluate_context_consumption` when no recorded result exists;
3. exit policy context usage -> MUST use `evaluate_context_consumption`;
4. truly side-agnostic raw-state consumers -> keep `htf_state_gate` semantics, but MUST use `evaluate_context_consumption`.

**Обоснование:** Change централизует весь старый context access path, не только новые `htf_regime_gate` consumers.

## Риски / компромиссы

| Риск | Митигация |
|------|-----------|
| Авторы путают `htf_state_gate` и `htf_regime_gate` | Labels в каталоге + docs; оба сохраняются; примеры в Composer с regimes |
| Trace shape ломает chart diagnostics | Additive поля outcome; frontend показывает новые поля при наличии |
| Call site забыл передать `evaluated_side` | Тип evaluation context + тесты both-side на одном bar |
| Дублирование с `_active_rule_group_for_side` | Extract `resolve_htf_regime`; refactor `_active_rule_group_for_side` to delegate; exit и regime gate используют один helper |
| Рефакторинг call sites шире «только новая политика» | В scope v1: audit и централизовать все context-consuming paths, включая exit policy |

## План миграции

- **Deploy:** Additive registration; существующие инстансы без изменений.
- **Author migration:** Вручную — замена raw `allowed_states` на required `allowed_regimes` где нужен side-relative intent; без runtime auto-convert.
- **Rollback:** Убрать catalog entry и handler; инстансы с `htf_regime_gate` fail validation до отката.

## Закрытые решения для apply

- Catalog exposes `htf_regime_gate` only for role/component_id entries that can pass explicit side context into `evaluate_context_consumption`; implementation audit determines the concrete list and updates catalog in the same change.
- `context_consumption_trace` and other diagnostics use `ContextConsumptionResult` / recorded result from the evaluation path. If a diagnostic is built out of band, it calls `evaluate_context_consumption` and records the same result shape.
- Exit profile selection uses `evaluate_context_consumption`; no separate direct or parallel exit context path is allowed.
