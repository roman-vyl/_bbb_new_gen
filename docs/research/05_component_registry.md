# Research Stage 5 — Component Registry

## Goal

Цель Stage 5 — добавить минимальную и стабильную компонентную адресацию внутри family `ema_pullback`, без превращения Research-трека в framework.

- дать каждому блоку strategy pipeline стабильный `component_id`;
- научить `StrategyConfig` хранить выбранные component ids;
- научить `signals.py` собирать pipeline через выбранные component ids;
- сохранить текущее поведение manual variants;
- не строить большой framework.

## Desired outcome

Ожидаемый результат Stage 5:

- внутри `research/strategies/ema_pullback/` появляется family-local component registry;
- роли компонентов:
  - `direction`
  - `blockers`
  - `setup`
  - `trigger`
  - `exits`
  - `risk`
- текущий baseline pipeline становится адресуемым через component ids;
- manual variants Stage 4 продолжают работать;
- все 3 variants пока могут использовать одинаковые components и отличаться только EMA parameters;
- `python research/strategies/ema_pullback/run.py` по-прежнему печатает 3 manual variants и `status=ok`;
- `research/ema_smoke.py` остаётся рабочим.

## Scope

Разрешено в рамках Stage 5:

- создать `research/strategies/ema_pullback/components.py`;
- точечно изменить `config.py`, чтобы добавить component id fields;
- точечно изменить `signals.py`, чтобы resolving компонентов шёл через registry;
- при необходимости точечно изменить `variants.py`, чтобы manual variants явно получали/default component ids;
- при необходимости точечно изменить `run.py`, если это нужно из-за `config`/`signals` contract;
- добавить тесты для component registry and config_id;
- обновить Stage 5 implementation summary после реализации.

## Out of scope

Ограничения Stage 5 (явно запрещено):

- не менять `data_engine/`;
- не добавлять `data_engine/strategies`, `data_engine/signals`, `data_engine/backtest`, `data_engine/adapters/vectorbt.py`;
- не добавлять backend indicators;
- не делать global research framework;
- не создавать `research/common` без отдельного решения;
- не делать component grid;
- не делать optimizer/parameter sweep;
- не делать YAML/JSON strategy config;
- не делать frontend/visual constructor;
- не делать auto-discovery, plugin system, decorators registry, dynamic imports;
- не сохранять results в БД или файлы;
- не менять смысл baseline trading logic.

## Component roles

Обязательные roles для Stage 5:

- `direction`
- `blockers`
- `setup`
- `trigger`
- `exits`
- `risk`

Для каждой роли должен существовать baseline/default component.

Пример стабильных component ids:

- `direction`: `ema_trend`
- `blockers`: `no_blockers`
- `setup`: `always_ready`
- `trigger`: `ema_cross_up`
- `exits`: `ema_cross_down`
- `risk`: `no_risk_filter`

Если текущие имена функций отличаются, implementation может адаптировать id names, но ids должны быть стабильными, человекочитаемыми и покрытыми тестами.

## Component registry design

Минимальный целевой дизайн:

- registry находится внутри `research/strategies/ema_pullback/`;
- registry является простым ручным словарём, а не plugin framework;
- каждый component definition должен иметь:
  - `role`;
  - `component_id`;
  - `callable`/function;
  - optional `description`;
- должна быть функция `resolve_component(role, component_id)`;
- неизвестный `role`/`component_id` должен давать понятную ошибку;
- `signals.py` остаётся composer, а не превращается в registry или optimizer.

Код в Stage 5 должен остаться минимальным и прямолинейным: без магии регистрации и без динамических загрузок.

## StrategyConfig impact

`StrategyConfig` должен получить fields для выбранных components, например:

- `direction_component`
- `blockers_component`
- `setup_component`
- `trigger_component`
- `exits_component`
- `risk_component`

Правила для `config_id`:

- component ids входят в deterministic `config_id`;
- `db_path` по-прежнему не входит в `config_id`;
- изменение `config_id` относительно Stage 4 допустимо, потому что смысловая конфигурация стратегии расширяется.

## Manual variants after Stage 5

После Stage 5 сохраняются Stage 4 variants:

- `ema_pullback_baseline`
- `ema_pullback_conservative`
- `ema_pullback_aggressive`

Текущие ожидания:

- пока variants отличаются только `ema_fast` / `ema_slow`;
- все три variants могут использовать одинаковые baseline/default components;
- Stage 5 не обязан добавлять новые торговые идеи или альтернативные `trigger`/`setup`/`exits`.

## Proposed file changes

Планируемые изменения по файлам:

- `research/strategies/ema_pullback/components.py` — family-local registry and resolver.
- `research/strategies/ema_pullback/config.py` — component fields and `config_id` update.
- `research/strategies/ema_pullback/signals.py` — resolve selected components and compose signals.
- `research/strategies/ema_pullback/variants.py` — ensure manual variants use valid component ids/defaults.
- `tests/...` — registry/config/variant coverage.
- Docs — add implementation summary after code is complete.

## Rollout steps

### Step 5.1 — Document the plan

- Create and approve `docs/research/05_component_registry.md`.
- No code changes yet.

### Step 5.2 — Add family-local component registry

- Create `research/strategies/ema_pullback/components.py`.
- Define required component roles:
  - `direction`
  - `blockers`
  - `setup`
  - `trigger`
  - `exits`
  - `risk`
- Add baseline/default component id for each role.
- Add minimal `resolve_component(role, component_id)`.
- Keep registry explicit and boring: manual dict only, no auto-discovery, no decorators, no dynamic imports.

### Step 5.3 — Extend StrategyConfig with component ids

- Add component id fields to `StrategyConfig`.
- Provide defaults matching the baseline/default components.
- Keep `db_path` excluded from `config_id`.
- Include component ids in deterministic `config_id`.
- Accept that Stage 5 may change config ids compared to Stage 4.

### Step 5.4 — Wire signals composer through registry

- Update `signals.py` so it resolves selected components through `components.py`.
- Keep `signals.py` as composer only.
- Do not move registry logic into `signals.py`.
- Preserve current baseline trading behavior.

### Step 5.5 — Keep manual variants working

- Ensure Stage 4 manual variants still exist:
  - `ema_pullback_baseline`
  - `ema_pullback_conservative`
  - `ema_pullback_aggressive`
- Variants may all use the same default components.
- Variants still differ only by `ema_fast` / `ema_slow` in Stage 5.
- Do not introduce component combinations yet.

### Step 5.6 — Add tests

- Add tests for required roles.
- Add tests for valid/invalid component resolution.
- Add tests that manual variants reference existing component ids.
- Add tests that component ids affect `config_id`.
- Add tests that `db_path` still does not affect `config_id`.

### Step 5.7 — Run acceptance commands

Use:

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

### Step 5.8 — Add implementation summary

- After implementation, append a short implementation summary to `docs/research/05_component_registry.md`.
- Summary should list files changed, behavior preserved, tests run, and explicit confirmation that `data_engine/` was not changed.

## Runner behavior

Ожидаемое поведение runner:

1. load candles once;
2. build manual variants;
3. for each `StrategyInstance`:
   - calculate features;
   - resolve selected components;
   - compose entry/exit signals;
   - run vectorbt portfolio;
   - collect metrics;
4. print comparison table;
5. print `status=ok`.

## Tests

Ожидаемое покрытие тестами:

- registry contains all required roles;
- each required role has a baseline/default component;
- `resolve_component(role, component_id)` returns callable/definition for valid ids;
- `resolve_component` fails clearly for unknown role/component_id;
- all manual variants reference existing component ids;
- component ids are included in `config_id`;
- changing one component id changes `config_id`;
- changing `db_path` still does not change `config_id`;
- manual variants still have unique config ids;
- runner remains smoke-testable through existing commands if applicable.

## Acceptance commands

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

## Expected acceptance result

- `python -m pytest -q` passes.
- `python research/strategies/ema_pullback/run.py` prints 3 manual variants and `status=ok`.
- `python research/ema_smoke.py` remains working.
- `git diff --stat data_engine/` is empty.
- `git status -sb` shows only intended Stage 5 changes.

## Architecture notes

- Stage 5 introduces a family-local registry only.
- No global strategy framework yet.
- No component grid yet.
- No optimizer yet.
- No visual constructor yet.
- No strategy config files yet.
- The registry must stay boring and explicit.
- `signals.py` remains a composer.
- `run.py` remains a research runner.
- `data_engine/` remains unaware of strategies.

## Stage 5 implementation summary

Что появилось по функционалу:

- Внутри family `ema_pullback` появился явный локальный реестр компонентов (`components.py`) с фиксированными ролями:
  - `direction`, `blockers`, `setup`, `trigger`, `exits`, `risk`.
- Для каждой роли есть baseline-компонент с стабильным `component_id` (например `ema_cross_up`, `ema_cross_down`), и есть единая точка резолва `resolve_component(role, component_id)` с понятными ошибками для неизвестных значений.
- `signals.py` теперь собирает pipeline не через жёсткие импорты baseline-функций, а через выбранные в конфиге `component_id`.
  - Это делает pipeline адресуемым и готовым к расширению, но без framework-магии и без динамических загрузок.
- В `StrategyConfig` добавлены поля выбора компонентов (`*_component`), и эти значения теперь входят в `config_id`.
  - То есть `config_id` теперь отражает не только EMA-параметры, но и “из каких компонентов собрана стратегия”.
  - `db_path` по-прежнему не влияет на `config_id`.

Что осталось прежним (важно):

- Торговая логика baseline не изменилась: дефолтные компоненты повторяют старое поведение.
- Manual variants Stage 4 живы в том же виде:
  - `ema_pullback_baseline`
  - `ema_pullback_conservative`
  - `ema_pullback_aggressive`
- В Stage 5 варианты всё ещё отличаются только `ema_fast` / `ema_slow`; component ids у них одинаковые дефолтные.
- Runner по-прежнему печатает сравнение 3 вариантов и завершает `status=ok`.
- `research/ema_smoke.py` остаётся рабочим.

Как это проверено:

- Добавлены тесты на реестр компонентов, `resolve_component`, связь manual variants с валидными ids и влияние component ids на `config_id`.
- Обновлены тесты composer после добавления explicit `risk` gate.
- Прогон acceptance-команд:
  - `python -m pytest -q` -> `127 passed`
  - `python research/strategies/ema_pullback/run.py` -> `status=ok` и таблица из 3 variants
  - `python research/ema_smoke.py` -> `status=ok`
- Подтверждено, что `data_engine/` не трогали (`git diff --stat data_engine/` пустой).
