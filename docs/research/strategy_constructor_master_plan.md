# Strategy Constructor — Master Plan

> Стратегический план post-MVP research-слоя.  
> Документ фиксирует направление, но не является ТЗ текущей фазы.

---

## 1. Цель

После Phase 4 MVP smoke backtest построить отдельный research-слой для разработки, сравнения и проверки торговых стратегий через `vectorbt`.

`data_engine/` остаётся только слоем данных:

```text
Bybit → SQLite → DIM → clean candles
```

Strategy Constructor живёт отдельно в `research/`:

```text
clean candles → strategy components → vectorbt → metrics/report
```

---

## 2. Что НЕ входит в Data Engine

Торговая логика не должна попадать в core:

- стратегии;
- сигналы входа/выхода;
- risk/sizing;
- optimizer;
- strategy registry;
- backtest reports;
- strategy configs.

Всё это находится в `research/`, не в `data_engine/`.

---

## 3. Базовые понятия

### Strategy Family

Общее семейство стратегии.

Пример:

```text
ema_pullback
```

Family описывает общий подход, но не фиксирует конкретные компоненты и параметры.

---

### Strategy Variant

Конкретная логическая сборка внутри family.

Пример:

```text
direction: EMA trend
blockers: ATR range + distance from EMA
setup: pullback
trigger: breakout
exit: ATR stop/take
risk: fixed fraction
```

Variant может отличаться не только параметрами, но и самими компонентами.

---

### Strategy Instance

Конкретный запуск variant с параметрами:

```text
family + variant + config + symbol + timeframe + date range
```

---

### Experiment

Запуск одного или нескольких strategy instances на выбранных данных.

---

### Result

Результат backtest:

```text
config_id
family
variant
symbol
timeframe
trades
return
drawdown
sharpe
profit_factor
debug counters
```

---

## 4. Strategy Pipeline

Стратегия должна строиться как pipeline:

```text
Data
↓
Features
↓
Direction
↓
Blockers
↓
Setup
↓
Trigger / ТВХ
↓
Exit
↓
Risk / Sizing
↓
Vectorbt Portfolio
↓
Report
```

Компоненты должны быть заменяемыми через config.

---

## 5. Rollout

### Step 0 — Phase 4 MVP Smoke

До конструктора делаем только:

```text
research/ema_smoke.py
```

Цель:

```text
clean candles → simple EMA crossover → vectorbt stats
```

Без framework, registry и optimizer.

---

### Step 1 — Strategy Family Skeleton

Создать первую family:

```text
research/strategies/ema_pullback/
```

Минимально:

```text
features.py
signals.py
configs.py
run.py
```

Цель: одна стратегия, один config, один backtest.

---

### Step 2 — Pipeline Decomposition

Разделить стратегию на блоки:

```text
features
direction
blockers
setup
trigger
exit
risk
```

Цель: перестать писать стратегию одной большой формулой.

---

### Step 3 — Strategy Config / Instance

Ввести config и `config_id`.

Config должен описывать:

```text
family
variant
symbol
timeframe
features
direction
blockers
setup
trigger
exit
risk
fees/slippage
date range
```

Цель: один код стратегии, много экземпляров.

---

### Step 4 — Manual Variants

Создать несколько ручных вариантов:

```text
base
conservative
aggressive
```

Сравнить результаты в единой таблице.

---

### Step 5 — FeaturesDev Layer

Перед внедрением component registry вводим отдельный слой подготовки признаков.

FeaturesDev — это research-only слой внутри strategy family. Для ema_pullback он живёт в:

```text
research/strategies/ema_pullback/features.py
```

Задача слоя — заранее подготовить вычислимые признаки и смысловые привязки для компонентов. Компоненты не должны сами считать EMA, RSI, ATR, trend/context и другие индикаторы внутри себя.

Важный принцип:

- `features.py` считает признаки рынка.
- `components` используют подготовленные признаки и смысловые relations/bindings.
- `signals.py` соединяет outputs компонентов.
- `run.py` запускает experiment.

fast / slow — это роли внутри relation, а не свойства самой EMA. Одна и та же EMA может быть slow в одной relation и fast в другой.

intraday / swing / daily — это смысловые роли для RSI или других признаков, а не жёстко зашитые имена индикаторов.

Подробные правила FeatureSeries, FeatureBinding и FeatureRelation фиксируются в отдельном плане Stage 5.

---

### Step 6 — Component Registry

Добавить registry компонентов:

```text
DIRECTION_REGISTRY
BLOCKER_REGISTRY
SETUP_REGISTRY
TRIGGER_REGISTRY
EXIT_REGISTRY
RISK_REGISTRY
```

Цель: менять не только параметры, но и саму логику блоков через config.

---

### Step 7 — First Real Component Variant

Stage 7 создаёт первую полную component-based сборку стратегии внутри `ema_pullback`.

Цель не в том, чтобы сделать много компонентов. Цель — доказать, что цепочка registry/config/instance/composer может запустить новую торговую логику, собранную из component ids.

В Stage 7 вводятся только два новых реальных компонента:

- реальный `setup` component, например `pullback_to_fast_ema`;
- реальный `trigger` component, например `reclaim_fast_ema`.

Все обязательные роли по-прежнему должны присутствовать в сборке StrategyConfig/StrategyInstance:

```text
direction_component = существующий/дефолтный ema_trend
blockers_component = существующий/дефолтный no_blockers
setup_component = NEW pullback_to_fast_ema
trigger_component = NEW reclaim_fast_ema
exits_component = существующий/дефолтный ema_cross_down
risk_component = существующий/дефолтный no_risk_filter
```

Практический scope Stage 7:

- зарегистрировать новые `setup`/`trigger` в family-local registry `ema_pullback`;
- собрать один manual variant на новых component ids;
- сравнить этот variant с существующими baseline/manual variants;
- при необходимости сохранить старые variants как контрольную группу.

Критерий успеха:

```text
новая component-based сборка работает в runner и сравнивается с baseline.
```

Важно:

- прибыльность стратегии не является критерием успеха Stage 7;
- Stage 7 не должен делать grid/optimizer/framework.

Ограничения Stage 7:

- не делать component grid;
- не делать optimizer;
- не делать parameter sweep;
- не делать YAML/JSON strategy config;
- не делать frontend/visual constructor;
- не менять `data_engine/`;
- не добавлять live trading/execution/order routing;
- не строить global framework.

---

### Step 8 — Component Grid

После появления нескольких реальных компонентов добавить ограниченный перебор комбинаций.

Grid должен:

- работать только по уже существующим component ids;
- не появляться раньше, чем есть хотя бы несколько осмысленных `setup/trigger/blocker/exit` components.

Ограничения:

- всё ещё без optimizer;
- всё ещё без global framework;
- без auto-discovery/plugin system;
- без изменений в `data_engine/`.

---

### Step 9 — Results & Debug Reports

Сохранять результаты в `research/results/`.

Минимальные поля:

```text
config_id
family
variant
component names
parameters
return
drawdown
sharpe
profit_factor
trades
win_rate
```

Debug counters:

```text
direction_ok_count
setup_count
blocked_count
entry_count
trade_count
```

---

### Step 10 — Validation

Добавить защиту от самообмана:

- train/test split;
- parameter stability;
- fees/slippage sensitivity;
- minimum trades filter;
- out-of-sample report.

---

## 6. Guardrails

До Phase 4 не делать:

- strategy framework;
- component registry;
- optimizer;
- walk-forward framework;
- result database;
- live trading;
- перенос стратегий в `data_engine/`.

После Phase 4 внедрять только пошагово.

Roadmap note:

Component Grid намеренно отложен на один шаг. Одного registry недостаточно для полезного grid; в Stage 7 сначала добавляются реальные setup/trigger components и один manual component-based variant.

---

## 7. Основной принцип

Не строить полноценный Strategy Constructor до первого живого backtest.

Порядок:

```text
1. dumb EMA smoke
2. one strategy family
3. config
4. instance
5. manual variants
6. featuresdev layer
7. component registry
8. first real component variant
9. component grid
10. results table
11. debug report
12. validation
```

Итоговая цель:

```text
Data Engine даёт чистые данные.
Research layer собирает и проверяет стратегии.
Core data engine не загрязняется торговой логикой.
```

---

## Future direction: Visual Strategy Constructor

В будущем Strategy Constructor может получить визуальный слой конфигурации стратегий.
Это отложенное направление (not current scope), не часть текущего Stage 4 и не изменение текущей дорожной карты.

Идея high-level:

- пользователь собирает стратегию из blocks/components на визуальном canvas;
- блоки могут соответствовать слоям `direction`, `blockers`, `setup`, `triggers`, `exits`, `risk`;
- связи между блоками могут выражать pipeline и логические зависимости;
- условия могут поддерживать простые композиции `AND` / `OR` / `NOT`;
- параметры компонентов редактируются через UI;
- результат визуальной сборки сохраняется не как frontend-specific state, а как строгий `StrategySpec` / Strategy AST / JSON-like representation.

Архитектурный принцип:

- UI graph is not the strategy itself.
- UI graph should compile into a validated `StrategySpec`.
- `StrategySpec` should be validated and then converted into `StrategyInstance`.
- Research/backtest execution remains on the research side.
- Frontend must not dictate the internal architecture of `data_engine/` or research execution.
- `data_engine/` must remain unaware of strategies and visual configuration.

Потенциальные направления (без финального выбора):

- node-based editor libraries such as React Flow / xyflow may be considered later;
- Blockly / JsonLogic-like approaches may be considered later for condition builders;
- heavier workflow engines should not be adopted without a separate architecture decision.

Phased note:

- first build strict Python/JSON strategy model;
- then validate component registry and component composition;
- only after that consider visual UI;
- avoid building a large visual programming framework prematurely.
