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
entries & exits (в спеке: components + trade_management.exit_policy; композиция в execution/)
vectorbt backtests
JSON reports (report_schema_version 3)
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

Актуальный контур для первой family `ema_pullback`:

```text
clean candles (SQLite → OHLCV DataFrame)
↓
EmaPullbackStrategySpec (semantic model; в т.ч. trade_management.exit_policy в спеке)
↓
FeaturePlan (что посчитать: EMA/ATR/distance/RSI, при необходимости MTF)
↓
features/calculations.py (как посчитать + alignment MTF на base index)
↓
Component Registry (role + component_id → callable)
↓
execution/signals.py
  entries / short_entries
  blockers: AND по tuple правил
↓
execution/exits.py
  читает trade_management.exit_policy из спека
  active exits = always_on + selected profile(side + htf_context.state)
  exits / short_exits / sl_stop / tp_stop
↓
vectorbt Portfolio
↓
stdout table + JSON report (report_schema_version 3)
```

Исторические stage-документы (`05_featuresdev_layer.md`, …) остаются полезными
как roadmap-контекст, но **фактическая реализация** сейчас опирается на
`StrategySpec + FeaturePlan`, а не на отдельный `feature_profile.py` внутри
family.

---

## Текущая strategy family

Сейчас реализована первая family:

```text
research/strategies/ema_pullback/
```

Её задача — быть первым полигоном для Strategy Constructor.

Основные файлы (фактическая структура каталога):

```text
README.md
config.py
spec.py
spec_instances.py
run.py
features/plan.py
features/calculations.py
components/*.py
components/registry.py
execution/backtest.py
execution/data_loader.py
execution/report_table.py
execution/runner.py
execution/signals.py
execution/exits.py
execution/results.py
execution/result_models.py
```

Ключевые идеи Stage 10–12 (как это живёт в коде сейчас):

```text
StrategySpec — единственный semantic источник для family instance.
FeaturePlan — декларация нужных колонок (включая RSI и MTF EMA/RSI).
Components — решают по подготовленным колонкам; RSI не считают внутри себя.
signals.py — side-aware composer только для entries/short_entries.
trade_management.exit_policy.*.exits в StrategySpec — декларативные exit-компоненты; exits.py сводит активную группу к слоям vectorbt.
JSON report — полный strategy_spec внутри variant payload; top-level report_schema_version: 3.
```

---

## Реализованные этапы (сводка по коду)

Ниже — не дословное воспроизведение старых stage-доков, а **что реально есть**
в репозитории на момент Step 12:

```text
Stage 9: JSON run report (report_schema_version 3) — research/results/latest.json + runs/<run_id>.json
Stage 10: EmaPullbackStrategySpec как единственная semantic модель
Stage 11: TradeSideSpec + long/short wiring в vectorbt
Stage 12: typed blockers/signal exit tuples, live components, RSI features,
          MTF resample+alignment для EMA/RSI на base OHLCV
Stage 13: unified trade_management.exit_policy для signal exits и distance stop/take,
          отдельный execution exit-layer перед vectorbt
```

Сгенерированные JSON-файлы не должны коммититься.

---

## Как запустить

Основная проверка research runner (experiment-конфиг обязателен):

```bash
python research/strategies/ema_pullback/run.py --config research/experiments/configs/ema_pullback/ema_pullback_batch_001_step14.yaml
```

Опционально: `--db-path path/to.sqlite`. Скрипт `research/ema_smoke.py` удалён; единственный поддерживаемый пользовательский вход для этого пайплайна — `run.py` с `--config`.

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
fast
anchor
slow
trades
sharpe
profit_factor
max_drawdown
```

Колонки `fast | anchor | slow` берутся из `strategy_spec["anchor_stack"]` только
для компактной stdout-таблицы. Полный spec (components tuples, RSI rules, MTF)
смотри в JSON (`strategy_spec`).

Перед таблицей печатается строка summary: `family`, `symbol`, `timeframe`,
`candles`, `variants`.

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

Top-level payload содержит `report_schema_version: 3` и поля:

```text
run_id
created_at
report_schema_version
family
symbol
timeframe
candles
data_range
variants_count
variants
batch_metadata
```

При запуске через external experiment config (Step 14) в payload попадает `batch_metadata`
(`experiment_id`, `source_file`, `entries`, …).

Каждый элемент `variants[]` содержит:

```text
variant
config_id
symbol
timeframe
strategy_spec
metrics
component_counters
trade_records
```

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

Research-слой для `ema_pullback` включает bidirectional side semantics (Step 11)
первые side-aware live компоненты + RSI + MTF alignment на base OHLCV (Step 12),
multi-instance component semantics (Step 13) и внешний config loader MVP (Step 14).

Текущий практически полезный контур:

```text
clean candles
→ StrategySpec + trade_sides
→ FeaturePlan + feature calculations
→ components + registry (exit rules живут в trade_management.exit_policy)
→ execution signals + exits (композиция для vectorbt)
→ vectorbt
→ stdout + JSON report
```

Для Step 14 доступен callable loader path:

```text
external config file
→ research/experiments/config_loader.py
→ research/strategies/ema_pullback/instance_loader.py
→ typed StrategySpec bundle
→ existing runner/backtest path
```

Следующие крупные направления:

```text
Research:
  component grid
  debug diagnostics
  validation

Data Engine:
  при необходимости: native multi-timeframe candle storage/API
  (сейчас MTF в research строится через resample загруженного base OHLCV)

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
docs/research/18_exit_management_combiner_start.md
docs/research/19_trend_strength_episode_blocker.md
docs/research/20_trade_exit_management_runtime_v1.md
```
