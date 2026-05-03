# Research Stage 10 — EMA Pullback StrategySpec Migration

> Исторический документ. Активная архитектура после рефакторинга exit-layer
> использует `components.exits` + `ExitRuleSpec` для signal exits и ATR stop/take.
> Старые упоминания `DistanceExitRuleSpec`, SL/TP в `TradeManagementSpec` и
> `execution/trade_management.py` описывают прежний Stage 10 дизайн, а не
> текущий runtime-контракт.

## Цель этапа

Перевести `ema_pullback` на один активный путь, где стратегия задаётся через `EmaPullbackStrategySpec`, но весь pipeline по-прежнему проходит через компоненты:

```text
EmaPullbackStrategySpec
→ FeaturePlan
→ calculated features
→ Component Registry
→ direction / blockers / setup / trigger / exits / risk
→ signals composer
→ trade management
→ vectorbt
→ JSON report
```

После завершения Stage 10 не должно остаться active pipeline, где стратегия задаётся через:

```text
FeatureProfile
FeatureRelation
intraday_trend
swing_trend
old manual variants
```

---

# Этап 10.1 — Добавить StrategySpec

## Создать файл

```text
research/strategies/ema_pullback/spec.py
```

## Добавить dataclass

```text
EmaSpec
AnchorStackSpec
ComponentStackSpec
PullbackSetupSpec
ReclaimTriggerSpec
AtrDistanceSpec
DistanceExitRuleSpec
TradeManagementSpec
EmaPullbackStrategySpec
```

## Поля

### EmaSpec

```text
source: str
timeframe: str
period: int
```

Validation:

```text
source == "close"
timeframe == "base"
period > 0
```

### AnchorStackSpec

```text
fast: EmaSpec
anchor: EmaSpec
slow: EmaSpec
```

Validation:

```text
fast.period < anchor.period < slow.period
```

### ComponentStackSpec

```text
direction: str
blockers: str
setup: str
trigger: str
exits: str
risk: str
```

Для первого spec:

```text
direction = "ema_anchor_stack_trend"
blockers = "no_blockers"
setup = "pullback_to_anchor"
trigger = "reclaim_anchor"
exits = "no_signal_exit"
risk = "no_risk_filter"
```

### PullbackSetupSpec

```text
lookback: int = 3
```

Validation:

```text
lookback > 0
```

### ReclaimTriggerSpec

На Stage 10 без дополнительных полей.

### AtrDistanceSpec

```text
timeframe: str
period: int
multiplier: float
```

Validation:

```text
timeframe == "base"
period > 0
multiplier > 0
```

### DistanceExitRuleSpec

```text
rule_type: str
distance: AtrDistanceSpec
```

Allowed:

```text
stop_loss_by_distance
take_profit_by_distance
```

Validation должна быть внутри `DistanceExitRuleSpec`.

### TradeManagementSpec

```text
profile: str = "rule_based"
exit_rules: tuple[DistanceExitRuleSpec, ...]
```

Validation:

```text
profile == "rule_based"
ровно один stop_loss_by_distance
ровно один take_profit_by_distance
```

### EmaPullbackStrategySpec

```text
variant: str
symbol: str
base_timeframe: str
anchor_stack: AnchorStackSpec
components: ComponentStackSpec
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

## Добавить helpers

```text
strategy_spec_to_dict(spec) -> dict
strategy_spec_config_id(spec) -> str
```

`config_id` считается только из canonical serialization `EmaPullbackStrategySpec`.

## Не делать на этом этапе

```text
не менять runner
не менять components
не удалять старые variants
не удалять FeatureProfile / FeatureRelation
```

---

# Этап 10.2 — Добавить concrete StrategySpec instance

## Создать файл

```text
research/strategies/ema_pullback/spec_instances.py
```

## Добавить factory

```text
ema_pullback_fast20_anchor200_slow1000_spec(
    symbol: str = "BTCUSDT",
    base_timeframe: str = "1h",
) -> EmaPullbackStrategySpec
```

## Factory создаёт

```text
variant = "ema_pullback_fast20_anchor200_slow1000"

anchor_stack:
  fast   = EMA close/base/20
  anchor = EMA close/base/200
  slow   = EMA close/base/1000

components:
  direction = "ema_anchor_stack_trend"
  blockers = "no_blockers"
  setup    = "pullback_to_anchor"
  trigger  = "reclaim_anchor"
  exits    = "no_signal_exit"
  risk     = "no_risk_filter"

setup:
  lookback = 3

trigger:
  reclaim_anchor

trade_management:
  profile = "rule_based"
  exit_rules:
    stop_loss_by_distance with ATR base/14 * 1.5
    take_profit_by_distance with ATR base/14 * 4.0
```

## Добавить active list

```text
active_strategy_specs(symbol: str, base_timeframe: str) -> list[EmaPullbackStrategySpec]
```

На конец Stage 10 в списке должен быть только:

```text
ema_pullback_fast20_anchor200_slow1000
```

## Не делать на этом этапе

```text
не подключать active_strategy_specs к runner
не удалять variants.py
```

---

# Этап 10.3 — Добавить FeaturePlan из StrategySpec

## Создать файл

```text
research/strategies/ema_pullback/features/plan.py
```

## Добавить dataclass

```text
PlannedFeature
FeaturePlan
```

## PlannedFeature поля

```text
feature_id: str
kind: str
source: str | None
timeframe: str
period: int | None
base_feature_id: str | None
multiplier: float | None
```

Allowed kind:

```text
ema
atr
atr_distance
```

## FeaturePlan поля

```text
features: tuple[PlannedFeature, ...]
anchor_columns: dict[str, str]
exit_distance_columns: dict[str, str]
```

`anchor_columns` содержит:

```text
fast
anchor
slow
```

`exit_distance_columns` содержит:

```text
stop_loss_by_distance
take_profit_by_distance
```

## Добавить функцию

```text
build_feature_plan_from_strategy_spec(spec) -> FeaturePlan
```

Для первого spec она должна вернуть feature ids:

```text
ema_close_base_20
ema_close_base_200
ema_close_base_1000
atr_close_base_14
atr_close_base_14_x1_5
atr_close_base_14_x4_0
```

## Правила

```text
FeaturePlan ничего не считает.
FeaturePlan строится только из StrategySpec.
FeaturePlan не читает FeatureProfile / FeatureRelation.
FeaturePlan удаляет дубли.
1.5 и 4.0 берутся только из spec.trade_management.exit_rules.
```

---

# Этап 10.4 — Добавить расчёт features из FeaturePlan

## Изменить файл

```text
research/strategies/ema_pullback/features/calculations.py
```

## Добавить функцию

```text
add_feature_columns_from_plan(df, plan) -> DataFrame
```

## Поддержать

```text
kind = "ema"
kind = "atr"
kind = "atr_distance"
```

## Логика

```text
ema:
  EMA считается по close

atr:
  ATR считается из high / low / close

atr_distance:
  df[feature_id] = df[base_feature_id] * multiplier
```

## Правила

```text
Считать только features из plan.features.
Не считать всегда 1.5 и 4.0.
Не писать в SQLite.
Не использовать data_engine indicators.
Не удалять старый add_feature_columns до финального cleanup.
```

---

# Этап 10.5 — Обновить компоненты под StrategySpec inputs

Компоненты остаются. Удалять `components/` нельзя.

## direction

Файл:

```text
research/strategies/ema_pullback/components/direction.py
```

Добавить или оставить clean function:

```text
ema_anchor_stack_trend(df, fast_col, anchor_col, slow_col)
```

Логика:

```text
df[fast_col] > df[anchor_col]
AND
df[anchor_col] > df[slow_col]
```

Функция не знает periods `20/200/1000`.

## blockers

Файл:

```text
research/strategies/ema_pullback/components/blockers.py
```

Убедиться, что есть:

```text
no_blockers(df)
```

Возвращает all-True mask.

## setup

Файл:

```text
research/strategies/ema_pullback/components/setup.py
```

Добавить или оставить:

```text
pullback_to_anchor(df, anchor_col, lookback)
```

Логика:

```text
low <= anchor хотя бы один раз за последние lookback свечей
```

## trigger

Файл:

```text
research/strategies/ema_pullback/components/triggers.py
```

Добавить или оставить:

```text
reclaim_anchor(df, anchor_col)
```

Логика:

```text
previous close <= previous anchor
current close > current anchor
```

## exits

Файл:

```text
research/strategies/ema_pullback/components/exits.py
```

Добавить:

```text
no_signal_exit(df)
```

Возвращает all-False mask.

## risk

Файл:

```text
research/strategies/ema_pullback/components/risk.py
```

Убедиться, что есть:

```text
no_risk_filter(df)
```

Возвращает all-True mask.

---

# Этап 10.6 — Обновить component registry, не удаляя pipeline

## Изменить файл

```text
research/strategies/ema_pullback/components/registry.py
```

Registry должен поддерживать role ids:

```text
direction:
  ema_anchor_stack_trend

blockers:
  no_blockers

setup:
  pullback_to_anchor

trigger:
  reclaim_anchor

exits:
  no_signal_exit

risk:
  no_risk_filter
```

## Удалять нельзя

```text
components/registry.py
components/direction.py
components/blockers.py
components/setup.py
components/triggers.py
components/exits.py
components/risk.py
```

## Удалять можно только после переключения active runner

Старые registry entries, которые нужны только FeatureRelation path:

```text
intraday_and_swing_trend_long
старые relation-based ids
```

Удалять только на финальном cleanup-этапе.

---

# Этап 10.7 — Переписать signals composer на StrategySpec + components

## Изменить файл

```text
research/strategies/ema_pullback/execution/signals.py
```

## Добавить функцию нового active path

```text
build_signals_from_spec(df, spec, plan)
```

## Логика

```text
1. resolve direction component by spec.components.direction
2. resolve blockers component by spec.components.blockers
3. resolve setup component by spec.components.setup
4. resolve trigger component by spec.components.trigger
5. resolve exits component by spec.components.exits
6. resolve risk component by spec.components.risk

7. fast_col   = plan.anchor_columns["fast"]
8. anchor_col = plan.anchor_columns["anchor"]
9. slow_col   = plan.anchor_columns["slow"]

10. direction = direction_component(df, fast_col, anchor_col, slow_col)
11. blockers  = blockers_component(df)
12. setup     = setup_component(df, anchor_col, spec.setup.lookback)
13. trigger   = trigger_component(df, anchor_col)
14. exits     = exits_component(df)
15. risk      = risk_component(df)

16. entries = direction AND blockers AND setup AND trigger AND risk
17. final_exit_signal = exits
```

## Правила

```text
signals.py использует Component Registry.
signals.py не считает EMA/ATR.
signals.py не знает periods 20/200/1000.
signals.py не читает FeatureProfile / FeatureRelation.
```

---

# Этап 10.8 — Обновить trade management на exit_rules

## Изменить файл

```text
research/strategies/ema_pullback/execution/trade_management.py
```

## Добавить функцию нового active path

```text
build_stops_from_trade_management(df, spec, plan)
```

## Логика

```text
stop_col = plan.exit_distance_columns["stop_loss_by_distance"]
take_col = plan.exit_distance_columns["take_profit_by_distance"]

sl_stop = df[stop_col] / df["close"]
tp_stop = df[take_col] / df["close"]
```

Возвращать kwargs для vectorbt:

```text
{
  "sl_stop": sl_stop,
  "tp_stop": tp_stop,
}
```

## Правила

```text
trade_management.py не знает ATR.
trade_management.py не знает ATR period.
trade_management.py не знает multiplier.
trade_management.py не строит имена ATR columns.
trade_management.py только применяет готовые distance columns.
```

---

# Этап 10.9 — Подключить новый backtest path

## Изменить файл

```text
research/strategies/ema_pullback/execution/backtest.py
```

## Добавить функцию

```text
run_strategy_spec(spec, ohlcv) -> VariantResult
```

## Pipeline

```text
plan = build_feature_plan_from_strategy_spec(spec)
df = add_feature_columns_from_plan(ohlcv, plan)
signals = build_signals_from_spec(df, spec, plan)
stops = build_stops_from_trade_management(df, spec, plan)
portfolio = vectorbt.Portfolio.from_signals(...)
return VariantResult(...)
```

## VariantResult должен содержать

```text
variant
config_id
symbol
timeframe
strategy_spec
metrics
trade_records
```

## Важно

```text
Не удалять старый run_strategy_instance до финального cleanup.
```

---

# Этап 10.10 — Переключить runner на active_strategy_specs

## Изменить файл

```text
research/strategies/ema_pullback/execution/runner.py
```

## Новый active flow

```text
specs = active_strategy_specs(symbol, base_timeframe)
loaded = load_candles_once(...)
for spec in specs:
    result = run_strategy_spec(spec, loaded.ohlcv)
write_research_results(...)
```

## После этого

`run.py` должен показывать только новый variant:

```text
ema_pullback_fast20_anchor200_slow1000
```

## Изменить файл

```text
research/ema_smoke.py
```

Он должен использовать новый StrategySpec active runner.

---

# Этап 10.11 — Обновить JSON report

## Изменить файлы

```text
research/strategies/ema_pullback/execution/result_models.py
research/strategies/ema_pullback/execution/results.py
```

## Добавить в variant JSON

```text
strategy_spec
```

Старые поля, которые больше не имеют смысла, удалить после переключения active runner:

```text
feature_profile
components старого формата, если они отражали legacy FeatureRelation path
```

Но сохранить полезное:

```text
variant
config_id
symbol
timeframe
metrics
trade_records
```

---

# Этап 10.12 — Обновить tests под новый active path

Удалить или переписать tests, которые проверяют старые active variants:

```text
ema_pullback_baseline
ema_pullback_conservative
ema_pullback_aggressive
ema_pullback_20_200_500_reclaim
ema_pullback_20_200_500_reclaim_fixed_sl_tp
ema_pullback_20_200_500_reclaim_feature_distance_sl_tp
FeatureProfile
FeatureRelation
intraday_trend
swing_trend
```

Добавить tests:

```text
spec validation
spec instance factory
config_id from StrategySpec
FeaturePlan expected ids
add_feature_columns_from_plan
component registry new ids
build_signals_from_spec через components
build_stops_from_trade_management
run_strategy_spec
runner writes JSON with strategy_spec
run.py shows ema_pullback_fast20_anchor200_slow1000
```

---

# Этап 10.13 — Финальный legacy cleanup

Удалять только после того, как:

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
```

уже проходят на новом active path.

## Удалить

```text
features/profile.py
old FeatureProfile / FeatureRelation classes
old relation-based signal composer code
old manual variants from variants.py
old tests for manual variants
old tests for FeatureRelation
old imports of StrategyConfig/StrategyInstance if они больше не используются
old registry entries for removed variants/components
```

## Не удалять

```text
components/
components/registry.py
components/direction.py
components/blockers.py
components/setup.py
components/triggers.py
components/exits.py
components/risk.py
execution/results.py
execution/data_loader.py
execution/report_table.py
execution/result_models.py
execution/backtest.py
execution/runner.py
features/calculations.py
features/plan.py
spec.py
spec_instances.py
```

Если файл содержит и legacy, и новый нужный код — удалить только legacy внутри файла.

---

# Этап 10.14 — Финальная проверка

Запустить:

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
rg "FeatureProfile|FeatureRelation|intraday_trend|swing_trend" research/strategies/ema_pullback tests
rg "ema_pullback_baseline|ema_pullback_conservative|ema_pullback_aggressive|ema_pullback_20_200_500_reclaim" research/strategies/ema_pullback tests
```

Ожидаемый результат:

```text
tests pass
run.py works
ema_smoke.py works
latest.json is written
report contains ema_pullback_fast20_anchor200_slow1000
report contains strategy_spec
data_engine diff is empty
grep по legacy пустой в active code/tests
```
