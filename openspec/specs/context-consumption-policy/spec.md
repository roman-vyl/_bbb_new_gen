# context-consumption-policy Specification

## Purpose
TBD - created by archiving change strategy-level-contexts-v1. Update Purpose after archive.
## Requirements
### Requirement: Optional context_consumption block on supported consumers

A strategy component instance (setup, trigger, blocker, filter, exit_policy, or future entry/exit slots) MAY include `context_consumption`. When omitted, the component MUST execute without reading `ContextBundle`, except where another requirement mandates consumption (exit policy with profile-scoped exits). When present, it MUST include `context_ref` and `policy` with `policy_id`.

#### Scenario: Entry component without consumption ignores bundle

- **WHEN** `setup` has no `context_consumption` block
- **THEN** setup signal generation MUST NOT call `ContextBundle.get`

#### Scenario: Consumption requires context_ref and policy_id

- **WHEN** `context_consumption` is present but `policy_id` is missing
- **THEN** validation fails before backtest execution

### Requirement: context_ref resolves only to declared strategy contexts

`context_consumption.context_ref` MUST match a key in `strategy.contexts`. The runtime and validators MUST NOT fall back to the first or only context when `context_ref` is missing, empty, or unknown.

#### Scenario: Unknown context_ref fails validation

- **WHEN** `context_consumption.context_ref` is `htf2` but `strategy.contexts` has only `htf`
- **THEN** validation fails naming the unknown ref

#### Scenario: No implicit first-context fallback at runtime

- **WHEN** `strategy.contexts` defines `htf` and `macro_htf` and a consumer omits `context_ref` while `context_consumption` is present
- **THEN** validation fails; the runtime MUST NOT select `htf` automatically

#### Scenario: Different consumers may use different context_ref values

- **WHEN** exit policy consumes `context_ref: htf` and a blocker consumes `context_ref: macro_htf`
- **THEN** each consumer reads the matching provider output from `ContextBundle` without implying a default ref for other consumers

### Requirement: Policy belongs to consumer not provider

`context_consumption.policy` MUST be interpreted by the **consumer** component role using a registered policy handler. Provider configuration MUST NOT include `policy_id` or consumer params. The frontend MUST NOT invent policies not exposed by the component catalog for that `(role, component_id)`.

#### Scenario: Provider entry has no policy_id field

- **WHEN** validating `strategy.contexts.htf`
- **THEN** `policy_id` under contexts is rejected if present

#### Scenario: Consumer policy changes mask without changing component_id

- **WHEN** an entry component keeps the same `component_id` but changes `context_consumption.policy.params`
- **THEN** entry mask results change accordingly without requiring a different catalog component_id

#### Scenario: Blocker policy changes mask without changing component_id

- **WHEN** a blocker keeps its original blocker `component_id` but changes `context_consumption.policy.params`
- **THEN** entry pipeline mask results change accordingly without requiring a different catalog component_id

### Requirement: Catalog declares supported consumption and allowed policies

For each `component_id` and consumer **role**, the research_api component catalog SHALL expose `supports_context_consumption: true` and a list of allowed `policy_id` values with parameter schemas. Components without support MUST NOT expose `context_consumption` fields in catalog-driven forms.

#### Scenario: Unsupported component rejects consumption in API validate

- **WHEN** validate receives `context_consumption` on a component_id with `supports_context_consumption: false`
- **THEN** the API returns the same error the research loader would emit

#### Scenario: Unknown policy_id for role rejected

- **WHEN** `policy_id` is not listed for `(role, component_id)` in the policy registry
- **THEN** validation fails naming the policy and role

### Requirement: Exit policy requires context_consumption when profile-scoped exits exist

If `trade_management.exit_policy.profiles` contains any non-empty `aligned`, `countertrend`, or `neutral` exit groups, `trade_management.exit_policy.context_consumption` MUST be present and valid. If `context_consumption` is absent, `exit_policy` MUST contain only `always_on` exits (profile groups empty or omitted). Loader and research_api validate MUST error when profile-scoped exits exist without `context_consumption`.

#### Scenario: Profile exits without context_consumption fail validation

- **WHEN** `exit_policy.profiles.aligned.exits` is non-empty and `exit_policy.context_consumption` is omitted
- **THEN** validation fails with an error requiring `context_consumption` for profile-scoped exits

#### Scenario: Always_on-only exit policy without context_consumption is valid

- **WHEN** `exit_policy` defines only non-empty `always_on.exits` and all profile exit groups are empty
- **THEN** validation succeeds without `context_consumption`

#### Scenario: Exit policy consumes context for profile bucket selection

- **GIVEN** non-empty profile exits and `context_consumption` with policy `exit_profile_by_htf_state`
- **WHEN** HTF state is `up` on a bar
- **THEN** the active profile bucket matches legacy aligned/countertrend/neutral mapping from pre-change baseline equivalence tests

### Requirement: Entry consumer policies gate without new component_id

Phase 3 SHALL introduce at least one reference entry consumer (setup or blocker) that uses `context_consumption` with a catalog-listed entry policy. The reference MUST use an existing `component_id` (not `htf_gated_*`).

#### Scenario: Reference blocker gates entries by HTF regime

- **GIVEN** a blocker with `context_consumption` and `htf_regime_gate` allowing only `aligned`, raw HTF state `down`, evaluated side `long`
- **WHEN** the blocker runs after bundle build
- **THEN** the entry pipeline mask blocks entries on that bar

### Requirement: Execution layer does not apply consumer policies

Vectorbt execution and portfolio simulation MUST consume final masks, profile locks, and signals produced by compilers. They MUST NOT read `ContextBundle` or apply `policy_id` logic directly.

#### Scenario: Portfolio receives compiled masks only

- **WHEN** backtest runs with context-consuming exit policy
- **THEN** execution inputs match masks produced by exit compiler after policy application

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
3. exit policy context usage -> MUST use `evaluate_context_consumption`.

No existing context-consuming path SHALL remain on direct `ContextBundle.get(context_ref) + apply_*`.

#### Scenario: Audit finds legacy direct context access

- **WHEN** implementation audit finds a call site that reads `ContextBundle` and applies a context policy directly
- **THEN** the call site is migrated to `evaluate_context_consumption` or `ContextConsumptionResult` / recorded result from evaluator before the change is complete
- **AND** it is classified as side-aware consumer, diagnostic call site, or exit policy context usage

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

### Requirement: htf_state_gate removed as consumer policy

Research layer MUST NOT register, validate, or execute `htf_state_gate` as a `context_consumption` policy. Raw provider output `htf_state` (`up`, `down`, `neutral`) MUST remain available from `ContextBundle` for policies that resolve regimes via shared evaluator.

#### Scenario: Legacy htf_state_gate config fails validation

- **WHEN** validate or loader receives `policy_id: htf_state_gate` on any catalog-supported HTF context consumer
- **THEN** validation fails naming unsupported policy_id

#### Scenario: Catalog omits htf_state_gate

- **WHEN** component catalog is fetched for `ema_pullback`
- **THEN** HTF context consumption policies in catalog include `htf_regime_gate` and MUST NOT include `htf_state_gate`

#### Scenario: Raw provider state unchanged

- **WHEN** `htf_context` provider runs
- **THEN** `ContextOutput` state series remains raw `up`, `down`, or `neutral` with no aligned/countertrend labels

### Requirement: Setup rule context consumption gates local setup masks externally
`strategy.setups[]` rules SHALL be valid context consumers. When a setup rule defines `context_consumption`, runtime MUST evaluate the setup component first to produce its local setup mask, then apply context gate outside the setup component by intersecting the local mask with policy result for the same evaluated side and bars.

Setup components (`untouched_anchor_setup`, `ema_bounce_counter_setup`, and future setup components) MUST NOT read `ContextBundle` directly and MUST NOT resolve HTF regimes internally for context gating.

#### Scenario: Setup rule with htf_regime_gate applies external gate
- **WHEN** a setup rule local mask is `true` on a bar and `context_consumption.policy.component_id` is `htf_regime_gate` with `allowed_regimes` that do not include the resolved regime for that bar/side
- **THEN** the resulting setup rule mask is `false` on that bar
- **AND** setup component code path remains unchanged and context-unaware

#### Scenario: Setup rule without context_consumption remains local-only
- **WHEN** a setup rule omits `context_consumption`
- **THEN** runtime uses the setup component local mask as-is for that rule
- **AND** no `ContextBundle.get` call is triggered by setup runtime for that rule

### Requirement: Setup context consumption uses role catalog policy contract
Setup role catalog metadata SHALL declare whether each setup component supports context consumption and which policy components are allowed. Validation MUST reject `context_consumption` for setup component IDs with `supports_context_consumption: false` and MUST reject unknown policy component IDs for setup role.

#### Scenario: Unsupported setup component rejects context consumption
- **WHEN** validate receives `context_consumption` on a setup component whose setup-role catalog metadata has `supports_context_consumption: false`
- **THEN** validation fails before backtest execution

#### Scenario: Legacy htf_state_gate remains invalid in setup role
- **WHEN** setup rule `context_consumption.policy.component_id` is `htf_state_gate`
- **THEN** validation fails naming unsupported policy component for setup role

### Requirement: V1 setup components support htf_regime_gate consumption
In v1 scope, both currently supported setup components SHALL support setup-level `context_consumption`: `untouched_anchor_setup` and `ema_bounce_counter_setup` MUST expose `supports_context_consumption: true` for setup role and MUST allow `htf_regime_gate`.

#### Scenario: Both v1 setup components expose setup consumption support
- **WHEN** setup role catalog metadata is requested
- **THEN** `untouched_anchor_setup` and `ema_bounce_counter_setup` both expose `supports_context_consumption: true`
- **AND** both list `htf_regime_gate` in allowed setup policies

### Requirement: Setup diagnostics separate local gate and final outcomes
Where setup context gating is surfaced in trace/report diagnostics, the system SHALL expose local setup result, context gate result, and final gated setup result as separate fields so operators can distinguish "setup condition matched" from "setup condition blocked by context policy".

Diagnostic payload for setup context consumption SHALL include at least: `setup_instance_id`, `component_id`, `context_ref`, `policy_id`, `allowed_regimes`, `raw_state`, `resolved_regime`, `evaluated_side`, `local_setup_allowed`, `context_gate_allowed`, `final_setup_allowed`.

#### Scenario: Diagnostics show local true and context-blocked final false
- **GIVEN** setup local mask is `true`
- **AND** resolved regime is `countertrend`
- **AND** `allowed_regimes` is `["aligned"]`
- **WHEN** setup context diagnostics are emitted for the evaluated side
- **THEN** `local_setup_allowed` is `true`
- **AND** `context_gate_allowed` is `false`
- **AND** `final_setup_allowed` is `false`

### Requirement: Setup component events remain local when context blocks
Setup `component_events[]` SHALL remain local setup diagnostics and MUST NOT be removed or rewritten when setup-level context gate blocks final setup mask. Context blocking MUST be represented through context diagnostics/consumption trace rather than by deleting local setup events.

#### Scenario: Local setup event persists under context block
- **GIVEN** a setup component emits a local setup event on a bar
- **AND** setup context gate evaluates to blocked for that bar
- **WHEN** trace/report diagnostics are produced
- **THEN** the setup `component_events[]` entry remains present for that local event
- **AND** context block is visible in context diagnostics fields

