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

### Step 8 — Feature-based Trade Management / SL-TP (historical, superseded)

Историческая формулировка этапа: после первой реальной component-based стратегии вводится отдельный слой управления открытой сделкой.
Актуальная архитектура для `ema_pullback` зафиксирована позже (Step 12): выходы и SL/TP описываются через `components.exits`, а корневой `TradeManagementSpec` зарезервирован.

Trade Management не является FeaturesDev и не является entry-логикой.

FeaturesDev готовит признаки, anchors и relations:

```text
ATR
EMA anchors
higher-timeframe EMA levels
volatility context
trend relations
```

Исторически Trade Management описывался как слой, использующий prepared feature bindings/relations для правил фиксации прибыли и убытка:

```text
stop_loss
take_profit
time_stop
later: trailing_stop / partial exits
```

Историческая заметка: `trade_management_profile` рассматривался как часть `StrategyConfig` и `config_id`.
Для текущей модели `ema_pullback` это заменено спецификацией выходов в `components.exits` (см. Step 12).

Component Grid начинается только после базового Trade Management, потому что массово тестировать входы без стабильной архитектуры stop/take даёт искажённые выводы.

---

### Step 9 — Research Results Artifact / Experiment Report (updated by later spec steps)

После первой реальной component-based стратегии нужно перестать опираться только на stdout-таблицу runner.

Research runner формирует структурированный результат запуска:

```text
research/results/*.json
```

Минимальный смысл: `run.py` → structured experiment result artifact.

Артефакт (минимум): `run_id`, `timestamp`, `family`, `symbol`, `timeframe`, `candles`, `variants`, `config_id`, `feature_profile`, component ids, `trades`, `sharpe`, `profit_factor`, `max_drawdown`, `total_return` (позже).

Примечание: поле `trade_management_profile` относится к исторической формулировке ранних шагов; в актуальной модели источником семантики выходов является `components.exits` (см. Step 12).

Цель: результаты backtest воспроизводимы, сравнимы и пригодны для будущего dashboard/grid.

Сюда не входят: база данных, frontend, optimizer, component grid. Это простой structured artifact для research runs. Stdout-таблица может остаться, но JSON/report artifact — стабильный источник для следующих этапов.

---

### Step 10 — EMA Pullback StrategySpec / Anchor Stack Refactor

После появления JSON-отчётов перед frontend/grid стабилизируем внутреннюю модель `ema_pullback`.

Цель этапа — уйти от ручной модели `FeatureRelation` как основного способа задания стратегии и перейти к явному `StrategySpec` для конкретного экземпляра `ema_pullback`.

`ema_pullback` остаётся названием strategy family.

Новая модель должна описывать стратегию через параметризуемую anchor-конструкцию:

```text
fast EMA
anchor EMA
slow EMA
```

Базовая идея стратегии:

торговать pullback к anchor EMA,
если fast EMA > anchor EMA > slow EMA

`FeatureRelation` может остаться временным legacy/compiled helper, но не должен быть главным местом, где задаётся стратегия.

После этого этапа frontend и будущий grid должны опираться на `StrategySpec`, а не на ручные `intraday_trend` / `swing_trend` relations.

---

### Step 11 — Bidirectional Side Semantics

На шаге 11 вводится семантика учёта направления сделки (long/short) и подготовка исполнения компонентов к этому контексту; подробные контракты вызова компонентов зафиксированы в отдельном плане реализации шага 11.

---

### Step 12 — Side-aware компоненты и единая архитектура выходов

**Компонентный слой:** blocker / risk / exit / trigger остаются **side-aware** — одна и та же идея зеркально для long и short.

**Spec:** вместо раздельных «signal exits» на стеке и rich **trade management** с distance-rules на корне стратегии — **один список `components.exits`** (`ExitRuleSpec`: signal / stop_loss / take_profit и при необходимости ATR-distance). **`TradeManagementSpec`** на `EmaPullbackStrategySpec` — зарезервированный профиль без списка правил; SL/TP и сигнальные выходы задаются только через **`exits`**.

**Execution:** применение выходов сосредоточено в отдельном слое исполнения (orchestration + exits), а не размазано по runner и только входным компонентам.

**Construction (тот же шаг по охвату roadmap):** typed **`component_builders.py`** и миграция **`spec_instances`** на единый pure-builder путь сборки spec-объектов — мост к Step 14 (внешний instance dict без второго способа ручной сборки dataclass-ов).

---

### Step 13 — Multi-instance компонентов в одном strategy instance

После стабилизации side-aware компонентов и unified `exits` нужно разрешить повторное использование одного и того же component id в рамках одной роли с разными параметрами.

**Цель:**

- поддержать несколько экземпляров одного типа компонента (например, несколько `blockers`/`exits`) в одном `StrategySpec`;
- ввести стабильные `instance_id`/алиасы для различения экземпляров и детерминированной диагностики;
- сохранить обратную совместимость для существующих single-instance конфигов.

**High-level scope:**

- расширить contracts builder/execution так, чтобы компонент мог присутствовать в конфиге как список instances;
- определить порядок выполнения и агрегацию результатов для одинаковых component ids с разными params;
- включить `instance_id` в debug/reporting слой (`research/results`) для воспроизводимого анализа.

Подробный контракт и подшаги — в отдельном плане `docs/research/13_multi_instance_components_plan.md`.

---

### Step 14 — External Instance Config MVP

После side-aware компонентов вводится тонкий внешний слой конфигурации одного экземпляра стратегии: маленький typed instance dict → один pure builder → существующий `EmaPullbackStrategySpec` → старый pipeline без изменений.

**Цель:**

- сделать параметры одного экземпляра `ema_pullback` задаваемыми снаружи строго типизированным dict-ом;
- ручная сборка dataclass-ов уходит из `spec_instances`: единственный путь сборки spec — через builder.

**Non-goals:**

- нет JSON-файлов;
- нет CLI / `--config` / `--config-dir`;
- нет перечисления каталога;
- нет внешнего конфига для шести component roles (component ids, EMA source/timeframe, ATR timeframe, trade management profile остаются захардкоженными внутри builder-а);
- нет Grid / optimizer / parameter sweep;
- нет frontend.

Подробный контракт и подшаги — в отдельном плане Step 14.

---

### Step 15 — Component Grid

Component Grid запускается только после того, как появятся структурированные результаты research-прогонов: без стабильного хранения результатов массовый прогон вариантов превращается в шумный и плохо сопоставимый `stdout`.

После появления нескольких реальных компонентов (включая side-aware blocker / risk / exit / trigger из Step 12) добавить ограниченный перебор комбинаций.

Grid должен:

- работать только по уже существующим component ids;
- не появляться раньше, чем есть хотя бы несколько осмысленных `setup/trigger/blocker/exit` components.

Ограничения:

- всё ещё без optimizer;
- всё ещё без global framework;
- без auto-discovery/plugin system;
- без изменений в `data_engine/`.

---

### Step 16 — Debug Reports / Diagnostics

Расширение отчётности поверх базового structured artifact: debug counters, сделочная диагностика, причины входов/выходов.

Примеры счётчиков:

```text
direction_ok_count
setup_count
blocked_count
entry_count
trade_count
```

---

### Step 17 — Validation

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

FeaturesDev keeps indicator calculation out of components. Exit rules (signal and ATR-based SL/TP) live in `StrategySpec` under `components.exits` and are evaluated via a dedicated execution exits path, so runner and entry-side code stay orchestration-focused. Research Results Artifact is inserted before Component Grid so experiments have stable structured output. EMA Pullback StrategySpec / anchor stack refactor stabilises the internal instance model after artifacts. Bidirectional Side Semantics (`TradeSideSpec`, long/short vectorbt wiring) follows StrategySpec so `ema_pullback` is not long-only. Step 12 completes side-aware blocker / risk / exit / trigger wiring and this **unified exits + reserved root trade_management** architecture, plus typed `component_builders` as the single construction layer ahead of external config. Step 13 introduces multi-instance component support (same component id reused with different params and explicit instance ids). Step 14 adds an external instance config MVP so one `EmaPullbackStrategySpec` can be built from a small typed dict without file IO or CLI. Component Grid remains postponed until FeaturesDev, components, result artifacts, StrategySpec, side-aware specs, live components, builders, multi-instance support, and external instance config are stable.

---

## 7. Основной принцип

Не строить полноценный Strategy Constructor до первого живого backtest.

Порядок:

```text
0. dumb EMA smoke
1. strategy family skeleton
2. pipeline decomposition
3. strategy config / instance
4. manual variants
5. featuresdev layer
6. component registry
7. first real component variant
8. trade management / SL-TP
9. research results artifact
10. ema_pullback StrategySpec / anchor stack refactor
11. bidirectional side semantics (TradeSideSpec, long / short)
12. side-aware blocker / risk / exit / trigger + unified `exits` spec, execution exits layer, `component_builders`
13. multi-instance same component support (different params, explicit `instance_id`)
14. external instance config MVP
15. component grid
16. debug report / diagnostics
17. validation
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
