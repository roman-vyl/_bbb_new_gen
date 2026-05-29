## REMOVED Requirements

### Requirement: htf_state_gate остаётся доступным без изменений

**Reason**: Side-relative gating is fully expressed by `htf_regime_gate`; raw-state allowlist policy is removed.

**Migration**: Recreate `context_consumption` on affected catalog-supported HTF context consumers with `policy_id: htf_regime_gate` and explicit `allowed_regimes`. Map prior raw-state intent via `resolve_htf_regime` semantics (e.g. long + `up` → `aligned`).

## MODIFIED Requirements

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

### Requirement: Entry consumer policies gate without new component_id

Phase 3 SHALL introduce at least one reference entry consumer (setup or blocker) that uses `context_consumption` with a catalog-listed entry policy. The reference MUST use an existing `component_id` (not `htf_gated_*`).

#### Scenario: Reference blocker gates entries by HTF regime

- **GIVEN** a blocker with `context_consumption` and `htf_regime_gate` allowing only `aligned`, raw HTF state `down`, evaluated side `long`
- **WHEN** the blocker runs after bundle build
- **THEN** the entry pipeline mask blocks entries on that bar

## ADDED Requirements

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
