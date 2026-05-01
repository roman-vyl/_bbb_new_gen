# Research Strategy Constructor / Backtesting Layer

Этот раздел описывает research-слой проекта: конструктор стратегий, бэктестинг и отчёты экспериментов.

Research-слой живёт отдельно от `data_engine/`.

```text
Data Engine → clean candles
Research    → strategy instances → vectorbt → metrics / JSON reports
```

---

## Назначение слоя

Research Strategy Constructor нужен для разработки и проверки торговых идей на чистых исторических данных.

Он отвечает за:

```text
features
feature profiles
strategy components
strategy configs / instances
manual variants
trade management
vectorbt backtests
JSON reports
```

Он не отвечает за:

```text
загрузку данных с биржи
хранение operational candles
DIM/gap repair
realtime
live trading
order execution
frontend
```

---

## Граница с Data Engine

`data_engine/` готовит чистые свечи:

```text
Bybit → SQLite → DIM → clean candles
```

Research использует эти свечи, но не меняет Data Engine.

Главное правило:

```text
Data Engine знает про данные.
Research знает про стратегии.
```

Research-слой не должен добавлять в `data_engine/`:

```text
strategies
signals
vectorbt
backtests
strategy configs
optimizer
frontend logic
```

---

## Текущий pipeline

Текущая целевая цепочка research-слоя:

```text
clean candles
↓
FeaturesDev
↓
FeatureProfile
↓
Component Registry
↓
StrategyConfig / StrategyInstance
↓
signals.py composer
↓
vectorbt Portfolio
↓
stdout table + JSON report
```

---

## Текущая strategy family

Сейчас реализована первая family:

```text
research/strategies/ema_pullback/
```

Её задача — быть первым полигоном для Strategy Constructor.

Основные файлы:

```text
config.py             # StrategyConfig / StrategyInstance / config_id
features.py           # подготовка feature columns
feature_profile.py    # FeatureProfile / FeatureRelations
components.py         # registry компонентов
direction.py          # direction components
blockers.py           # blocker components
setup.py              # setup components
triggers.py           # trigger components
exits.py              # exit components
risk.py               # risk gate components
trade_management.py   # SL/TP profiles
signals.py            # composer итоговых entry/exit signals
variants.py           # manual variants
run.py                # research runner
results.py            # JSON report artifact
```

---

## Реализованные этапы

### Stage 4 — Manual Variants

Добавлены ручные variants:

```text
ema_pullback_baseline
ema_pullback_conservative
ema_pullback_aggressive
```

Их задача — контрольная группа и проверка multi-variant runner.

---

### Stage 5 — FeaturesDev Layer

Добавлен слой подготовки признаков.

Главная идея:

```text
features.py считает признаки рынка.
feature_profile.py задаёт смысловые роли и relations.
components используют подготовленные features/bindings/relations.
```

Введены понятия:

```text
FeatureSeries
FeatureBinding
FeatureRelation
FeatureProfile
```

Важный принцип:

```text
fast / slow — это роли внутри relation, а не свойства самой EMA.
intraday / swing / daily — смысловые роли, а не жёсткие имена индикаторов.
```

---

### Stage 6 — Component Registry

Добавлен family-local registry компонентов:

```text
direction
blockers
setup
trigger
exits
risk
```

Каждая роль выбирается через `component_id` в `StrategyConfig`.

Component ids входят в `config_id`.

---

### Stage 7 — First Real Component Variant

Добавлена первая осмысленная component-based торговая логика:

```text
Long от EMA200
при EMA20 > EMA200
и EMA200 > EMA500
после отката к EMA200
и возврата цены выше EMA200
```

Основной variant:

```text
ema_pullback_20_200_500_reclaim
```

Смысловые relations:

```text
intraday_trend:
  fast = EMA20
  slow = EMA200

swing_trend:
  fast = EMA200
  slow = EMA500

entry_anchor:
  ema = EMA200
```

---

### Stage 8 — Trade Management / SL-TP

Добавлен отдельный слой управления открытой сделкой:

```text
trade_management.py
```

Первый профиль:

```text
fixed_pct_sl_tp
```

Trade Management отделён от entry logic.

Граница:

```text
entry components дают вход
exit components дают signal-based выход
trade management задаёт SL/TP rules
```

---

### Stage 9 — JSON Run Report

Runner теперь сохраняет структурированный JSON-отчёт запуска.

Файлы результата:

```text
research/results/latest.json
research/results/runs/<run_id>.json
```

JSON содержит:

```text
run_id
created_at
family
symbol
timeframe
candles
data_range
variants
metrics
trade_records
```

Сгенерированные JSON-файлы не должны коммититься.

---

## Как запустить

Основная проверка research runner:

```bash
python research/strategies/ema_pullback/run.py
```

Smoke entrypoint старого Phase 4:

```bash
python research/ema_smoke.py
```

Все тесты:

```bash
python -m pytest -q
```

Проверка, что Data Engine не затронут:

```bash
git diff --stat data_engine/
```

---

## Что печатает runner

Runner печатает comparison table по variants:

```text
variant
config_id
ema_fast
ema_slow
trades
sharpe
profit_factor
max_drawdown
```

В конце ожидается:

```text
results_artifact=research/results/latest.json
run_artifact=research/results/runs/<run_id>.json
status=ok
```

---

## JSON reports

`latest.json` — последний запуск.

`runs/<run_id>.json` — исторический артефакт конкретного запуска.

JSON нужен для будущих слоёв:

```text
read-only API
research dashboard
component grid
run comparison
debug reports
validation
```

Свечи в JSON не сохраняются.

Правильная будущая схема:

```text
Data Engine / candle API → свечи
Research JSON report     → сделки и метрики
Frontend                 → накладывает сделки на график
```

---

## Trade records

В отчёт добавляются записи сделок.

Минимальная идея:

```text
entry_time_ms
exit_time_ms
entry_price
exit_price
pnl
return_pct
status
exit_reason
```

Если причину выхода пока нельзя определить надёжно:

```text
exit_reason = unknown
```

---

## Основные guardrails

Не делать в research-слое:

```text
live trading
exchange execution
order routing
backend indicators inside data_engine
realtime engine
frontend logic
global framework без необходимости
```

Не делать в компонентах:

```text
самостоятельный расчёт EMA/RSI/ATR
доступ к БД
загрузку свечей
создание portfolio
запись JSON-отчётов
```

Ответственность компонентов:

```text
взять prepared features/bindings/relations
вернуть свою component-логику
```

---

## Текущий статус

Research-слой дошёл до структурированного JSON-отчёта запуска.

Текущий практически полезный контур:

```text
clean candles
→ feature profile
→ components
→ manual variants
→ trade management
→ vectorbt
→ stdout + JSON report
```

Следующие крупные направления:

```text
Research:
  component grid
  debug diagnostics
  validation

Data Engine:
  multi-timeframe data availability

Frontend:
  read-only API
  research dashboard
```

---

## Где лежат планы

Основной roadmap Strategy Constructor:

```text
docs/research/strategy_constructor_master_plan.md
```

Локальные stage-планы:

```text
docs/research/05_featuresdev_layer.md
docs/research/06_component_registry.md
docs/research/07_first_real_component_variant.md
docs/research/08_trade_management_sl_tp.md
docs/research/09_json_run_report.md
```
