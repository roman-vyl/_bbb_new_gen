# Research Stage 6 — Component Registry

## Purpose of this stage

Stage 6 вводит компонентную адресацию для strategy family `ema_pullback`.

Это **архитектурный этап**, а не этап написания новой торговой логики.

На этом этапе мы не пытаемся придумать прибыльную стратегию и не добавляем новый реальный setup/trigger.  
Задача Stage 6 — подготовить механизм, через который будущая торговая логика сможет подключаться безопасно, явно и воспроизводимо.

Новая торговая логика, похожая на реальную торговую идею, начинается на следующем этапе:

```text
Stage 7 — First Real Component Variant
```

Там уже будут добавляться первые настоящие компоненты, например:

```text
setup_component = pullback_to_entry_fast_ema
trigger_component = reclaim_entry_fast_ema
```

Stage 6 отвечает только за то, чтобы такая сборка потом могла быть описана через `StrategyConfig` и запущена через `StrategyInstance`.

---

## Context

К этому моменту уже есть:

```text
research/strategies/ema_pullback/
  features.py
  feature_profile.py
  direction.py
  blockers.py
  setup.py
  triggers.py
  exits.py
  risk.py
  signals.py
  variants.py
  run.py
```

После Stage 5 появился слой FeaturesDev:

```text
features.py
  считает физические признаки

feature_profile.py
  описывает feature profile, semantic bindings и relations
```

Главное правило после Stage 5:

```text
components consume prepared features/bindings/relations.
components do not calculate indicators internally.
```

Stage 6 идёт после FeaturesDev, поэтому registry должен подключать компоненты, которые работают поверх подготовленных признаков, а не сами считают EMA/RSI/ATR/trend/context.

---

## Goal

Цель Stage 6 — дать каждому блоку strategy pipeline стабильный `component_id`.

Обязательные роли:

```text
direction
blockers
setup
trigger
exits
risk
```

Каждая роль должна иметь хотя бы один default/baseline component.

Stage 6 должен сделать возможной такую схему:

```text
StrategyConfig
  direction_component = "ema_trend"
  blockers_component = "no_blockers"
  setup_component = "always_ready"
  trigger_component = "ema_cross_up"
  exits_component = "ema_cross_down"
  risk_component = "no_risk_filter"

        ↓

StrategyInstance

        ↓

signals.py composer

        ↓

vectorbt backtest
```

---

## What Stage 6 is

Stage 6 — это слой адресации компонентов.

Он отвечает на вопрос:

```text
Какой компонент выбран для каждой роли strategy pipeline?
```

Например:

```text
direction_component = ema_trend
setup_component = always_ready
trigger_component = ema_cross_up
```

Эти component ids становятся частью смысловой конфигурации стратегии и должны входить в deterministic `config_id`.

---

## What Stage 6 is not

Stage 6 **не** является этапом реальной торговой логики.

В Stage 6 не делаем:

```text
new pullback setup
new reclaim trigger
advanced blocker
advanced exit
ATR stop
RSI blocker
multi-timeframe logic
component grid
optimizer
parameter sweep
YAML/JSON strategy config
frontend/visual constructor
live trading
execution/order routing
global strategy framework
backend indicators
data_engine changes
```

Stage 6 может использовать простые existing/default components, включая заглушки:

```text
blockers_component = no_blockers
setup_component = always_ready
risk_component = no_risk_filter
```

Это нормально. Цель — не качество торговой идеи, а правильная архитектура подключения компонентов.

---

## Desired outcome

После Stage 6 должно быть:

```text
research/strategies/ema_pullback/components.py
```

Внутри него:

```text
ComponentDefinition
COMPONENT_REGISTRY
resolve_component(role, component_id)
```

Registry должен быть:

```text
family-local
explicit
manual
boring
```

То есть без:

```text
auto-discovery
decorators
plugin system
dynamic imports
global research framework
```

---

## Required default components

Минимальный baseline registry:

```text
direction:
  ema_trend

blockers:
  no_blockers

setup:
  always_ready

trigger:
  ema_cross_up

exits:
  ema_cross_down

risk:
  no_risk_filter
```

Эти компоненты нужны не потому, что они уже являются идеальной торговой логикой, а потому что они дают полную сборку всех обязательных ролей.

---

## Relation to FeaturesDev

Component Registry не должен обходить FeaturesDev.

Правильная цепочка:

```text
features.py
  prepares physical feature series

feature_profile.py
  prepares semantic bindings/relations

components
  consume prepared bindings/relations

signals.py
  composes component outputs
```

Компонент не должен сам считать индикатор:

```text
bad:
  trigger.py calculates EMA internally

good:
  trigger.py uses prepared entry_trend.fast from FeaturesDev
```

На Stage 6 это правило фиксируется архитектурно.  
На Stage 7 оно будет проверено первой реальной component-based логикой.

---

## StrategyConfig impact

`StrategyConfig` должен хранить выбранные component ids:

```text
direction_component
blockers_component
setup_component
trigger_component
exits_component
risk_component
```

Эти поля должны входить в deterministic `config_id`.

Причина:

```text
одинаковые EMA-параметры + разные trigger_component = разные strategy instances
```

`db_path` по-прежнему не входит в `config_id`.

---

## signals.py responsibility

`signals.py` остаётся composer.

Он не должен становиться registry, optimizer или framework.

Его задача:

```text
1. взять component ids из StrategyConfig;
2. resolve components через components.py;
3. вызвать выбранные components;
4. соединить outputs компонентов в итоговые entry/exit signals.
```

Пример логики composer:

```text
final_entry = direction & blockers & setup & trigger & risk
final_exit = exit_signal
```

---

## variants.py responsibility

`variants.py` остаётся списком ручных experiment-сборок.

После Stage 6 существующие manual variants могут продолжать отличаться только EMA-параметрами:

```text
ema_pullback_baseline
ema_pullback_conservative
ema_pullback_aggressive
```

Это нормально.

Их задача на Stage 6 — проверить, что component ids могут быть частью `StrategyConfig`, не ломая существующий runner.

Реальная component-based variant появится позже, на Stage 7.

---

## Rollout steps

### Step 6.1 — Add family-local registry

Создать:

```text
research/strategies/ema_pullback/components.py
```

Добавить:

```text
ComponentDefinition
COMPONENT_REGISTRY
resolve_component(role, component_id)
```

---

### Step 6.2 — Register default components

Зарегистрировать default/baseline components для всех ролей:

```text
direction
blockers
setup
trigger
exits
risk
```

---

### Step 6.3 — Extend StrategyConfig

Добавить поля:

```text
direction_component
blockers_component
setup_component
trigger_component
exits_component
risk_component
```

Добавить эти поля в `config_id`.

---

### Step 6.4 — Wire signals.py through registry

Обновить `signals.py`:

```text
component id → resolve_component(...) → callable → component output
```

`signals.py` остаётся composer.

---

### Step 6.5 — Keep manual variants working

Существующие manual variants должны продолжить работать.

На Stage 6 они могут использовать default components.

---

### Step 6.6 — Add tests

Проверить:

```text
registry contains all required roles
each role has default component
valid component ids resolve
invalid role/component id fails clearly
manual variants reference valid component ids
component ids affect config_id
db_path still does not affect config_id
run.py still works
ema_smoke.py still works
```

---

### Step 6.7 — Run acceptance commands

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

---

### Step 6.8 — Add implementation summary

После реализации добавить summary:

```text
what changed
which files changed
what behavior was preserved
which tests were run
confirmation that data_engine/ was not changed
```

---

## Acceptance result

Stage 6 считается успешным, если:

```text
1. Есть family-local components.py.
2. Все 6 ролей имеют component ids.
3. StrategyConfig хранит выбранные component ids.
4. Component ids входят в config_id.
5. signals.py собирает pipeline через registry.
6. Старые manual variants продолжают работать.
7. run.py печатает comparison table и status=ok.
8. research/ema_smoke.py остаётся рабочим.
9. Все тесты проходят.
10. data_engine/ не изменён.
```

---

## Architecture notes

Stage 6 — это архитектурный этап.

Он создаёт механизм подключения компонентов, но не проверяет новую торговую идею.

Первая попытка написать торговую логику, похожую на реальную, начинается на Stage 7:

```text
Stage 7 — First Real Component Variant
```

Там уже можно будет добавить:

```text
setup_component = pullback_to_entry_fast_ema
trigger_component = reclaim_entry_fast_ema
```

и проверить первую осмысленную сборку:

```text
direction = ema_trend
blockers = no_blockers
setup = pullback_to_entry_fast_ema
trigger = reclaim_entry_fast_ema
exits = ema_cross_down
risk = no_risk_filter
```

Главная граница:

```text
Stage 5 FeaturesDev:
  что известно о рынке и как это называется по смыслу

Stage 6 Component Registry:
  какие компоненты доступны и как они выбираются

Stage 7 First Real Component Variant:
  первая настоящая component-based торговая логика
```
