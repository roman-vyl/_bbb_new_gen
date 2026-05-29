## ADDED Requirements

### Requirement: Централизованная оценка политик контекста

Research layer SHALL предоставлять **shared context policy evaluator** (единая точка входа, например `evaluate_context_consumption`). Context-consuming components and diagnostic call sites MUST делегировать оценку `context_consumption` этому слою и MUST NOT самостоятельно извлекать сырой state из `ContextBundle`, спрашивать direction component или сравнивать raw `up/down` с `long/short` для применения side-relative политик.

Components and diagnostic call sites MUST NOT реализовывать собственный маппинг raw-state → regime. Side-relative разрешение режима MUST выполняться только внутри shared evaluator.

Любая policy-level работа с `ContextBundle` SHALL проходить через shared context policy evaluator (`evaluate_context_consumption`) и его `ContextConsumptionResult`. Ни compile path, ни diagnostics, ни exit policy MUST NOT напрямую выполнять `ContextBundle.get(context_ref) + apply_*` или вызывать `_active_rule_group_for_side` вне shared layer.

#### Scenario: Context consumer делегирует оценку общему слою

- **GIVEN** catalog-supported context consumer с `context_consumption` и политикой `htf_regime_gate`
- **AND** построенный `ContextBundle` и side-aware evaluation context с `evaluated_side: long`
- **WHEN** consumer применяет context gate
- **THEN** он вызывает общий оценщик политик с `context_consumption` и evaluation context
- **AND** не вызывает напрямую функции маппинга raw state → regime

#### Scenario: Несколько потребителей используют один оценщик

- **GIVEN** два context consumers с одинаковым `context_ref` и `htf_regime_gate` на одном side-pass
- **WHEN** signal trace и consumption trace оценивают context consumption
- **THEN** оба используют общий слой оценки политик
- **AND** не дублируют логику маппинга в своих модулях

#### Scenario: Exit profile selection не остаётся на старом пути

- **GIVEN** exit policy использует `exit_profile_by_htf_state`
- **WHEN** exit profile buckets выбираются по HTF context
- **THEN** выбор профиля проходит через `evaluate_context_consumption` и `ContextConsumptionResult`
- **AND** exit policy не вызывает напрямую `ContextBundle.get(context_ref) + apply_exit_profile_by_htf_state`
- **AND** exit policy не вызывает `_active_rule_group_for_side` вне shared layer

### Requirement: Before implementation audit classifies all context-consuming paths

Before implementation, research layer SHALL audit all existing context-consuming call sites and classify them into exactly one implementation path:

1. side-aware context consumers -> MUST use shared evaluator;
2. diagnostic call sites -> MUST use `ContextConsumptionResult` / recorded result from evaluator, or invoke `evaluate_context_consumption` when no recorded result exists;
3. exit policy context usage -> MUST use `evaluate_context_consumption`;
4. truly side-agnostic raw-state consumers -> MUST keep existing `htf_state_gate` semantics through `evaluate_context_consumption`.

No existing context-consuming path SHALL remain on direct `ContextBundle.get(context_ref) + apply_*`.

#### Scenario: Audit finds legacy direct context access

- **WHEN** implementation audit finds a call site that reads `ContextBundle` and applies a context policy directly
- **THEN** the call site is migrated to `evaluate_context_consumption` or `ContextConsumptionResult` / recorded result from evaluator before the change is complete
- **AND** it is classified as side-aware consumer, diagnostic call site, exit policy context usage, or side-agnostic raw-state consumer

### Requirement: Side-aware evaluation context

Общий оценщик MUST принимать **SideAwareEvaluationContext**, построенный из direction layer / `DirectionOutput` / текущего strategy evaluation scope. Evaluator MUST NOT hardcode `for side in ["long", "short"]` и MUST NOT решать сам, какие стороны прогонять.

- `evaluated_side`: `long` или `short` — сторона текущего прохода оценки маски или trace, пришедшая из direction/evaluation scope;
- доступ к уже построенному `ContextBundle` (без повторной сборки провайдеров);
- индекс баров текущей оценки.

Потребляющий компонент MUST передавать свой `context_consumption` конфиг вместе с этим контекстом.

#### Scenario: Evaluation context содержит сторону и bundle

- **GIVEN** per-side signal trace pass для `short`
- **WHEN** компонент запрашивает оценку `context_consumption`
- **THEN** evaluation context включает `evaluated_side: short` и ссылку на тот же `ContextBundle`, что использовался при сборке сигналов

#### Scenario: Evaluator не перебирает стороны самостоятельно

- **GIVEN** direction layer уже построил evaluation scope для side `long`
- **WHEN** общий оценщик вызывается для `htf_regime_gate`
- **THEN** он использует side из переданного evaluation scope
- **AND** не запускает внутренний hardcoded loop по `long` и `short`

#### Scenario: Side-agnostic политика игнорирует evaluated_side

- **GIVEN** `htf_state_gate` с `allowed_states: ["up"]`
- **WHEN** общий оценщик вызывается с `evaluated_side: long` или `short`
- **THEN** результат зависит только от raw state, не от стороны

### Requirement: Опциональный кэш серий режимов

Общий слой оценки SHALL поддерживать опциональный кэш resolved regime series по ключу `(context_ref, evaluated_side)` в рамках одного backtest или trace pass, чтобы несколько потребителей с одним контекстом MUST NOT дублировать маппинг. Кэш MUST NOT быть global singleton и MUST NOT кэшировать финальный pass/fail для конкретных `allowed_regimes`, потому что разные consumers могут иметь разные params.

#### Scenario: Второй потребитель переиспользует кэшированную серию

- **GIVEN** два context consumers с `context_ref: htf` и `htf_regime_gate` на side-pass `long`
- **WHEN** первый потребитель запрашивает оценку у общего слоя
- **AND** второй потребитель запрашивает оценку для того же `(htf, long)`
- **THEN** маппинг raw state → regime выполняется один раз
- **AND** оба получают согласованный результат

### Requirement: htf_regime_gate маппит сырой HTF state в side-relative режимы

Research layer SHALL регистрировать generic side-aware context consumption policy `htf_regime_gate` для catalog-supported consumers/call sites, которые могут предоставить explicit side context. Обработчик MUST разрешать трейдерские метки `aligned`, `countertrend`, `neutral` из raw state провайдера (`up`, `down`, `neutral`) и **evaluated trade side** (`long` или `short`) по таблице:

- long + `up` → `aligned`; long + `down` → `countertrend`; long + `neutral` → `neutral`
- short + `down` → `aligned`; short + `up` → `countertrend`; short + `neutral` → `neutral`

Обработчик MUST NOT читать trade side из конфигурации провайдера или из `ContextOutput`. Выход провайдера MUST оставаться только raw states.

#### Scenario: Long evaluation трактует raw up как aligned

- **GIVEN** `context_consumption.policy.policy_id` is `htf_regime_gate` with `allowed_regimes: ["aligned"]`
- **AND** raw HTF state на баре `up`
- **WHEN** политика оценивается через общий слой для side `long`
- **THEN** gate разрешает context на этом баре

#### Scenario: Short evaluation трактует raw up как countertrend

- **GIVEN** та же политика и raw state `up` на баре
- **WHEN** политика оценивается через общий слой для side `short`
- **THEN** gate блокирует context на этом баре

#### Scenario: Neutral raw state neutral для обеих сторон

- **GIVEN** `htf_regime_gate` with `allowed_regimes: ["neutral"]`
- **AND** raw HTF state `neutral`
- **WHEN** evaluated for `long` or `short`
- **THEN** gate разрешает context на этом баре

### Requirement: htf_regime_gate params используют allowed_regimes

Params политики `htf_regime_gate` MUST включать `allowed_regimes` как непустой список строк из `aligned`, `countertrend`, `neutral`. Validation MUST отклонять отсутствие `allowed_regimes`, пустой список и неизвестные метки режима. Для `htf_regime_gate` MUST NOT существовать permissive default.

#### Scenario: Unknown regime fails validation

- **WHEN** validate получает `allowed_regimes: ["aligned", "bullish"]`
- **THEN** validation fails с указанием недопустимых значений regime

#### Scenario: Missing allowed_regimes fails validation

- **WHEN** validate получает `htf_regime_gate` без `allowed_regimes`
- **THEN** validation fails с указанием, что `allowed_regimes` обязателен

#### Scenario: Empty allowed_regimes fails validation

- **WHEN** validate получает `allowed_regimes: []`
- **THEN** validation fails

### Requirement: Both-side strategy MUST применять разный gate per side

Both-side стратегии MUST получать разные gate-результаты per side при `htf_regime_gate`: общий слой MUST применять маппинг согласно `evaluated_side` каждого side-pass.

#### Scenario: Both-side strategy applies different gate per side

- **GIVEN** стратегия с включёнными `long` и `short` и context consumer с `htf_regime_gate` и `allowed_regimes: ["aligned"]`
- **AND** raw HTF state `up` на баре
- **WHEN** long и short masks компилируются через общий слой с соответствующим `evaluated_side`
- **THEN** long mask трактует бар как allowed, short mask — как blocked

### Requirement: htf_regime_gate diagnostics expose resolution forensics

Diagnostic call sites (signal trace, consumption trace, attribution, chart/report diagnostics) MUST использовать `ContextConsumptionResult` / recorded result from evaluator. Если recorded result недоступен в diagnostic entry point, diagnostic MUST вызвать `evaluate_context_consumption`. Они MUST NOT пересчитывать mapping independently и MUST NOT напрямую читать `ContextBundle` для применения policy logic. Записи для `htf_regime_gate` MUST включать поля для объяснения pass/fail: `context_ref`, `policy_id`, per-bar или indexed `raw_state`, `evaluated_side`, `resolved_regime`, configured `allowed_regimes`, pass/fail (или эквивалентную boolean series `context_applied` per evaluated side).

#### Scenario: Trace outcome включает regime resolution

- **WHEN** signal trace строит diagnostic record для `htf_regime_gate`
- **THEN** record `outcome` включает `evaluated_side`, `allowed_regimes`, per-bar `raw_state` и `resolved_regime`, согласованные с `context_applied`

### Requirement: htf_state_gate остаётся доступным без изменений

Существующая политика `htf_state_gate` с `allowed_states` (`up`, `down`, `neutral`) MUST оставаться зарегистрированной и поведенчески эквивалентной для существующих конфигов. Это изменение MUST NOT удалять или auto-migrate инстансы `htf_state_gate`.

`htf_state_gate` remains a side-agnostic raw-state policy and MUST be evaluated through shared evaluator.

#### Scenario: Legacy raw-state gate unchanged

- **GIVEN** context consumer с `policy_id: htf_state_gate` и `allowed_states: ["up"]`
- **WHEN** оценивается через общий слой без side-relative mapping
- **THEN** allow/deny зависит только от raw state `up`, независимо от evaluated side
