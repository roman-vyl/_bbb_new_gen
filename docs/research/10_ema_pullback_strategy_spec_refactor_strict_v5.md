# Research Stage 10 v5 — EMA Pullback Single StrategySpec Migration

## 0. Что делает этот этап

Stage 10 НЕ добавляет второй путь рядом со старым.

Stage 10 мигрирует `research/strategies/ema_pullback` на один активный путь:

```text
EmaPullbackStrategySpec -> FeaturePlan -> calculated features -> signals -> trade management -> report
```

После успешного запуска новый путь остаётся единственным активным путём внутри `ema_pullback`.

Legacy-код старой архитектуры внутри `ema_pullback` удаляется в конце этого же этапа.

---

## 1. Жёсткая граница scope

Можно менять только:

```text
research/strategies/ema_pullback/
research/ema_smoke.py
tests/
docs/research/
```

Нельзя менять:

```text
data_engine/
frontend/
backend indicators
live execution
order routing
optimizer
visual constructor
research/common
```

---

## 2. Целевая архитектура

После Stage 10 внутри `ema_pullback` должно быть так:

```text
spec.py
  dataclass-контракты StrategySpec.
  Только типы, validation, serialization helpers.
  Никаких concrete instances.
  Никаких расчётов EMA/ATR.
  Никакого vectorbt.
  Никакого runner-кода.

spec_instances.py
  concrete strategy specs.
  Здесь создаётся ema_pullback_fast20_anchor200_slow1000.
  Здесь же может быть список active specs.

features/plan.py
  compile StrategySpec -> FeaturePlan.
  Ничего не считает.
  Даёт имена нужных feature columns.
  Даёт mapping ролей:
    fast -> ema_close_base_20
    anchor -> ema_close_base_200
    slow -> ema_close_base_1000
  Даёт mapping exit rules:
    stop_loss_by_distance -> atr_close_base_14_x1_5
    take_profit_by_distance -> atr_close_base_14_x4_0

features/calculations.py
  считает только то, что запросил FeaturePlan:
    EMA
    ATR
    ATR distance = ATR * multiplier

components/
  чистые signal-функции.
  Получают column names из FeaturePlan.
  Не знают periods 20/200/1000.
  Не считают EMA/ATR.

execution/trade_management.py
  применяет готовые distance columns.
  Не знает ATR period.
  Не знает ATR multiplier.
  Не строит имена ATR columns из period/multiplier.
  Использует mapping из FeaturePlan.

execution/backtest.py
  orchestrator одного active path.
  Берёт StrategySpec.
  Строит FeaturePlan.
  Считает features.
  Строит signals.
  Применяет trade management.
  Запускает vectorbt.
  Возвращает result.

execution/runner.py
  запускает список StrategySpec из spec_instances.py.
  Не хранит старые manual variants.
```

---

## 3. Правило одного источника истины

Единственный источник semantic-параметров стратегии:

```text
EmaPullbackStrategySpec
```

Запрещено дублировать в других config-объектах:

```text
ema_fast
ema_slow
anchor period
setup component id
trigger component id
trade management profile
ATR period
ATR multiplier
stop/take params
```

Если нужен execution config, он может содержать только технические параметры:

```text
db_path
symbol override, если это CLI/runtime override
timeframe override, если это CLI/runtime override
report path
```

Но он не должен содержать смысл стратегии.

`config_id` считается только из canonical serialization `EmaPullbackStrategySpec`.

---

## 4. StrategySpec contracts

Файл:

```text
research/strategies/ema_pullback/spec.py
```

Создать frozen dataclass:

```text
EmaSpec
AnchorStackSpec
PullbackSetupSpec
ReclaimTriggerSpec
AtrDistanceSpec
DistanceExitRuleSpec
TradeManagementSpec
EmaPullbackStrategySpec
```

### EmaSpec

Поля:

```text
source: str
timeframe: str
period: int
```

Validation Stage 10:

```text
source == "close"
timeframe == "base"
period > 0
```

### AnchorStackSpec

Поля:

```text
fast: EmaSpec
anchor: EmaSpec
slow: EmaSpec
```

Validation:

```text
fast.period < anchor.period < slow.period
```

### PullbackSetupSpec

Поля:

```text
component_id: str = "pullback_to_anchor"
lookback: int = 3
```

Validation:

```text
component_id == "pullback_to_anchor"
lookback > 0
```

### ReclaimTriggerSpec

Поля:

```text
component_id: str = "reclaim_anchor"
```

Validation:

```text
component_id == "reclaim_anchor"
```

### AtrDistanceSpec

Поля:

```text
timeframe: str
period: int
multiplier: float
```

Validation Stage 10:

```text
timeframe == "base"
period > 0
multiplier > 0
```

### DistanceExitRuleSpec

Поля:

```text
rule_type: str
distance: AtrDistanceSpec
```

Allowed Stage 10:

```text
stop_loss_by_distance
take_profit_by_distance
```

Validation должна быть в самом `DistanceExitRuleSpec`, не только в parent object.

### TradeManagementSpec

Поля:

```text
profile: str = "rule_based"
exit_rules: tuple[DistanceExitRuleSpec, ...]
```

Validation Stage 10:

```text
profile == "rule_based"
есть ровно один stop_loss_by_distance
есть ровно один take_profit_by_distance
```

### EmaPullbackStrategySpec

Поля:

```text
variant: str
symbol: str
base_timeframe: str
anchor_stack: AnchorStackSpec
setup: PullbackSetupSpec
trigger: ReclaimTriggerSpec
trade_management: TradeManagementSpec
```

Validation:

```text
variant непустой
symbol непустой
base_timeframe непустой
```

Добавить canonical serializer:

```text
strategy_spec_to_dict(spec) -> dict
strategy_spec_config_id(spec) -> str
```

---

## 5. Concrete instance

Файл:

```text
research/strategies/ema_pullback/spec_instances.py
```

Создать:

```text
ema_pullback_fast20_anchor200_slow1000_spec(symbol="BTCUSDT", base_timeframe="1h")
```

Он возвращает:

```text
variant = "ema_pullback_fast20_anchor200_slow1000"

anchor_stack:
  fast   = EMA close/base/20
  anchor = EMA close/base/200
  slow   = EMA close/base/1000

setup:
  pullback_to_anchor, lookback=3

trigger:
  reclaim_anchor

trade_management:
  profile = rule_based
  exit_rules:
    stop_loss_by_distance with ATR base/14 * 1.5
    take_profit_by_distance with ATR base/14 * 4.0
```

Создать:

```text
active_strategy_specs(symbol: str, base_timeframe: str) -> list[EmaPullbackStrategySpec]
```

На конец Stage 10 список содержит только новый spec.

---

## 6. FeaturePlan

Файл:

```text
research/strategies/ema_pullback/features/plan.py
```

Создать:

```text
PlannedFeature
FeaturePlan
build_feature_plan_from_strategy_spec(spec)
```

`FeaturePlan` должен содержать:

```text
features: tuple[PlannedFeature, ...]
anchor_columns:
  fast
  anchor
  slow
exit_distance_columns:
  stop_loss_by_distance
  take_profit_by_distance
```

Для нового spec expected ids:

```text
ema_close_base_20
ema_close_base_200
ema_close_base_1000
atr_close_base_14
atr_close_base_14_x1_5
atr_close_base_14_x4_0
```

Правила:

```text
FeaturePlan ничего не считает.
FeaturePlan удаляет дубли.
FeaturePlan строится только из StrategySpec.
FeaturePlan не читает old FeatureProfile/FeatureRelation.
FeaturePlan не содержит хардкода 1.5/4.0 кроме того, что пришло из spec.
```

---

## 7. Feature calculations

Файл:

```text
research/strategies/ema_pullback/features/calculations.py
```

Добавить/оставить одну функцию для нового пути:

```text
add_feature_columns_from_plan(df, plan) -> DataFrame
```

Она считает только features из `plan.features`.

Поддержать kinds:

```text
ema
atr
atr_distance
```

Правила:

```text
EMA считается по close.
ATR считается из high/low/close.
atr_distance = base_atr_column * multiplier.
Не писать в SQLite.
Не использовать data_engine indicators.
Не считать всегда 1.5 и 4.0.
```

---

## 8. Signals

Нужна одна функция нового пути:

```text
build_signals_from_spec(df, spec, plan) -> entries/exits или signal object
```

Логика:

```text
direction:
  fast > anchor > slow

setup:
  low <= anchor хотя бы один раз за последние setup.lookback свечей

trigger:
  previous close <= previous anchor
  current close > current anchor

entry:
  direction AND setup AND trigger
```

Правила:

```text
Signals берут column names из FeaturePlan.
Signals не знают periods 20/200/1000.
Signals не считают EMA/ATR.
```

---

## 9. Trade management

Файл:

```text
research/strategies/ema_pullback/execution/trade_management.py
```

Сделать функцию нового пути:

```text
build_stops_from_trade_management(df, spec, plan) -> stop columns / stop arrays
```

Логика Stage 10:

```text
stop_col = plan.exit_distance_columns["stop_loss_by_distance"]
take_col = plan.exit_distance_columns["take_profit_by_distance"]

sl_stop = df[stop_col] / df["close"]
tp_stop = df[take_col] / df["close"]
```

Правила:

```text
TradeManagement не знает ATR.
TradeManagement не знает ATR period.
TradeManagement не знает multiplier.
TradeManagement не строит имена ATR columns.
TradeManagement не реализует RSI/EMA target/time/trailing.
```

---

## 10. Runner/backtest

Цель:

```text
run.py -> execution/runner.py -> active_strategy_specs() -> run_strategy_spec()
```

Backtest нового пути:

```text
spec
  -> build_feature_plan_from_strategy_spec(spec)
  -> add_feature_columns_from_plan(df, plan)
  -> build_signals_from_spec(df, spec, plan)
  -> build_stops_from_trade_management(df, spec, plan)
  -> vectorbt
  -> result
```

JSON report должен содержать для каждого variant:

```text
variant
config_id
strategy_spec
metrics
trade_records
```

---

## 11. Удаление legacy в конце Stage 10

После того как новый path работает, удалить active legacy внутри `ema_pullback`.

Удалить или вычистить references к:

```text
FeatureProfile
FeatureRelation
intraday_trend
swing_trend
ema_pullback_baseline
ema_pullback_conservative
ema_pullback_aggressive
ema_pullback_20_200_500_reclaim
ema_pullback_20_200_500_reclaim_fixed_sl_tp
ema_pullback_20_200_500_reclaim_feature_distance_sl_tp
old manual variants
old component registry, если он обслуживал только старый путь
old tests, которые проверяют удалённый legacy
compatibility wrappers
```

Важно:

```text
Не удалять полезные чистые функции, если они реально используются новым path.
Но после Stage 10 в active ema_pullback execution не должно быть старого FeatureProfile/FeatureRelation path.
```

Проверка:

```bash
rg "FeatureProfile|FeatureRelation|intraday_trend|swing_trend" research/strategies/ema_pullback tests
rg "ema_pullback_baseline|ema_pullback_conservative|ema_pullback_aggressive|ema_pullback_20_200_500_reclaim" research/strategies/ema_pullback tests
```

Ожидаемо:

```text
нет active references.
Допускается только упоминание в docs/research, если нужно описать миграцию.
```

---

## 12. Tests

Минимальные тесты:

```text
spec validation:
  valid spec creates
  non-base timeframe fails
  non-close source fails
  invalid rule_type fails in DistanceExitRuleSpec
  missing stop or take fails in TradeManagementSpec

feature plan:
  expected feature ids
  no duplicate atr_close_base_14
  role mapping fast/anchor/slow
  exit mapping stop/take

feature calculations:
  add_feature_columns_from_plan creates EMA columns from plan
  creates ATR column from plan
  creates ATR distance columns from multipliers in spec

signals:
  fast > anchor > slow direction
  pullback_to_anchor uses anchor column
  reclaim_anchor uses anchor column

trade management:
  uses ready distance columns
  sl_stop = stop_distance / close
  tp_stop = take_distance / close
  does not calculate ATR

runner/report:
  run.py runs new variant
  JSON contains strategy_spec
  JSON contains ema_pullback_fast20_anchor200_slow1000

legacy deletion:
  no active FeatureProfile/FeatureRelation references
  no old manual variants in active runner
```

Do not assert exact live backtest metrics.

---

## 13. Acceptance

Run:

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
rg "FeatureProfile|FeatureRelation|intraday_trend|swing_trend" research/strategies/ema_pullback tests
rg "ema_pullback_baseline|ema_pullback_conservative|ema_pullback_aggressive|ema_pullback_20_200_500_reclaim" research/strategies/ema_pullback tests
```

Stage 10 is done if:

```text
tests pass
run.py works
ema_smoke.py works
latest.json is written
report contains ema_pullback_fast20_anchor200_slow1000
report contains strategy_spec
data_engine diff is empty
active legacy grep is empty
```

---

## 14. Cursor work order

Do exactly this order:

```text
1. Read this file.
2. Print change map.
3. Implement spec.py.
4. Implement spec_instances.py.
5. Implement features/plan.py.
6. Implement features/calculations.py support for FeaturePlan.
7. Implement signals from spec/plan.
8. Implement trade management from spec/plan.
9. Wire runner/backtest to active_strategy_specs().
10. Make run.py and ema_smoke.py work.
11. Delete legacy old path.
12. Update tests.
13. Run acceptance.
14. Report changed files and command results.
```

No extra architecture.
No second implementation path.
No framework.
No frontend.
No data_engine changes.
