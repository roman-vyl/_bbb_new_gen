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
ema_atr_directional
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
research/strategies/ema_atr_directional/
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

### Step 5 — Component Registry

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

### Step 6 — Component Grid

Добавить перебор компонентов и параметров.

Пример:

```text
direction: ema_trend | market_structure
blockers: atr_range | atr_range + distance_from_ema
exit: atr_stop_take | atr_trailing_stop
```

---

### Step 7 — Results & Debug Reports

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

### Step 8 — Validation

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
6. component registry
7. component grid
8. results table
9. debug report
10. validation
```

Итоговая цель:

```text
Data Engine даёт чистые данные.
Research layer собирает и проверяет стратегии.
Core data engine не загрязняется торговой логикой.
```
