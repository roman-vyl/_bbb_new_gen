# EMA Pullback — Human README: от торговой идеи до исполнения

## 1. Человеческая формулировка

Идея на обычном языке:

> Я хочу купить откат к EMA200, если рынок выше по структуре: EMA20 выше EMA200, а EMA200 выше EMA1000.  
> Вход — когда цена откатилась к EMA200 и потом вернулась выше неё.  
> Стоп — на расстоянии 1.5 ATR.  
> Тейк — на расстоянии 4 ATR.

То есть у нас есть игра трёх EMA:

```text
fast EMA   = EMA20
anchor EMA = EMA200
slow EMA   = EMA1000
```

Условие направления:

```text
EMA20 > EMA200 > EMA1000
```

Торгуем не просто “где-то в тренде”, а именно:

```text
pullback к anchor EMA
```

---

## 2. StrategySpec — описание конкретного экземпляра стратегии

Эта человеческая идея сначала превращается в `EmaPullbackStrategySpec`.

Он отвечает на вопрос:

```text
Что именно я хочу тестировать?
```

Пример:

```text
variant = ema_pullback_fast20_anchor200_slow1000

symbol = BTCUSDT
base_timeframe = 1h

anchor_stack:
  fast   = EMA close/base/20
  anchor = EMA close/base/200
  slow   = EMA close/base/1000

components:
  direction = ema_anchor_stack_bullish
  blockers = no_blockers
  setup    = pullback_to_anchor
  trigger  = reclaim_anchor
  exits    = no_signal_exit
  risk     = no_risk_filter

setup:
  lookback = 3

trade_management:
  profile = rule_based
  exit_rules:
    stop_loss_by_distance = ATR14 * 1.5
    take_profit_by_distance = ATR14 * 4.0
```

Важно: здесь живут все смысловые параметры стратегии:

```text
EMA periods
fast / anchor / slow roles
component ids
setup params
trigger params
ATR period
ATR multipliers
exit rules
```

То есть больше не должно быть второго места, где отдельно лежит:

```text
ema_fast = 20
ema_slow = 200
trade_management_profile = ...
intraday_trend = ...
swing_trend = ...
```

`StrategySpec` — единственный источник истины.

---

## 3. FeaturePlan — список того, что надо посчитать

`StrategySpec` сам ничего не считает.

Из него строится `FeaturePlan`.

Он отвечает на вопрос:

```text
Какие колонки надо подготовить, чтобы эта стратегия могла работать?
```

Из нашего spec получается:

```text
ema_close_base_20
ema_close_base_200
ema_close_base_1000
atr_close_base_14
atr_close_base_14_x1_5
atr_close_base_14_x4_0
```

И mapping ролей:

```text
anchor_columns:
  fast   -> ema_close_base_20
  anchor -> ema_close_base_200
  slow   -> ema_close_base_1000

exit_distance_columns:
  stop_loss_by_distance -> atr_close_base_14_x1_5
  take_profit_by_distance -> atr_close_base_14_x4_0
```

То есть `FeaturePlan` — это переводчик:

```text
человеческие роли из StrategySpec
→ конкретные имена колонок в DataFrame
```

Он не считает EMA и ATR. Он только говорит:

```text
вот это надо посчитать
вот так потом эти колонки будут называться
```

---

## 4. Features calculations — подготовка колонок

Дальше `features/calculations.py` получает свечи и `FeaturePlan`.

Он отвечает на вопрос:

```text
Как физически посчитать нужные series?
```

На входе есть OHLCV:

```text
open
high
low
close
volume
```

По плану считаются:

```text
ema_close_base_20
ema_close_base_200
ema_close_base_1000
```

Потом ATR:

```text
atr_close_base_14
```

Потом distance features:

```text
atr_close_base_14_x1_5 = atr_close_base_14 * 1.5
atr_close_base_14_x4_0 = atr_close_base_14 * 4.0
```

Важно:

```text
features/calculations.py не решает, что стоп должен быть 1.5 ATR.
Он просто видит в FeaturePlan: нужна колонка atr_close_base_14_x1_5.
```

Множители пришли из `StrategySpec`, а не из хардкода в расчёте.

---

## 5. Component Registry — выбор кирпичиков логики

В `StrategySpec` написано:

```text
direction = ema_anchor_stack_bullish
setup    = pullback_to_anchor
trigger  = reclaim_anchor
```

Но сами функции живут в `components/`.

Registry отвечает на вопрос:

```text
По role + component_id какую функцию вызвать?
```

Например:

```text
role = direction
component_id = ema_anchor_stack_bullish
→ components/direction.py::ema_anchor_stack_bullish
```

Registry не знает весь `StrategySpec`.

Он не должен думать:

```text
ага, тут EMA20/200/1000, значит надо сделать то-то
```

Он делает только:

```text
role + id -> callable
```

---

## 6. Components — чистые куски торговой логики

Компоненты получают уже готовые column names.

### Direction

`ema_anchor_stack_bullish` получает:

```text
fast_col   = ema_close_base_20
anchor_col = ema_close_base_200
slow_col   = ema_close_base_1000
```

И проверяет:

```text
fast > anchor
AND
anchor > slow
```

То есть:

```text
EMA20 > EMA200 > EMA1000
```

Компонент не знает, что периоды именно 20/200/1000. Он знает только:

```text
fast_col
anchor_col
slow_col
```

### Setup

`pullback_to_anchor` получает:

```text
anchor_col = ema_close_base_200
lookback = 3
```

И проверяет:

```text
за последние 3 свечи low <= anchor
```

То есть цена реально откатывалась к EMA200.

### Trigger

`reclaim_anchor` получает:

```text
anchor_col = ema_close_base_200
```

И проверяет:

```text
previous close <= previous anchor
current close > current anchor
```

То есть цена вернулась выше EMA200.

### Blockers

Пока:

```text
no_blockers
```

Возвращает `true` для всех баров.

Позже здесь могут быть:

```text
не торговать при высокой волатильности
не торговать против старшего фильтра
не торговать в плохое время
```

### Risk

Пока:

```text
no_risk_filter
```

Тоже всё пропускает.

Позже здесь могут быть фильтры допуска сделки.

### Exits

Пока:

```text
no_signal_exit
```

То есть signal-based exit не используется.

Выход сейчас идёт через trade management: stop/take.

Позже можно добавить:

```text
RSI >= 80
дошли до старшей EMA
обратный сигнал
time stop
```

---

## 7. signals.py — сборка итогового входа

`execution/signals.py` отвечает за вопрос:

```text
Как из компонентов собрать финальный entry/exit signal?
```

Он делает:

```text
direction = ema_anchor_stack_bullish(...)
blockers  = no_blockers(...)
setup     = pullback_to_anchor(...)
trigger   = reclaim_anchor(...)
risk      = no_risk_filter(...)
exits     = no_signal_exit(...)
```

Потом собирает entry:

```text
entries =
  direction
  AND blockers
  AND setup
  AND trigger
  AND risk
```

В человеческом виде:

```text
Покупаем, если:
  EMA20 > EMA200 > EMA1000
  и не сработали блокеры
  и был откат к EMA200
  и цена вернулась выше EMA200
  и risk filter разрешает сделку
```

Exit signal сейчас:

```text
exits = no_signal_exit
```

То есть signal exit пустой, но stop/take будут добавлены отдельно.

---

## 8. Trade Management — применение правил выхода

`StrategySpec` говорит:

```text
exit_rules:
  stop_loss_by_distance = ATR14 * 1.5
  take_profit_by_distance = ATR14 * 4.0
```

`FeaturePlan` уже превратил это в колонки:

```text
stop_loss_by_distance -> atr_close_base_14_x1_5
take_profit_by_distance -> atr_close_base_14_x4_0
```

`trade_management.py` берёт готовые distance columns:

```text
stop_col = atr_close_base_14_x1_5
take_col = atr_close_base_14_x4_0
```

И превращает их в формат vectorbt:

```text
sl_stop = stop_distance / close
tp_stop = take_distance / close
```

Например, если:

```text
close = 100000
ATR14 = 1000
stop_distance = 1500
take_distance = 4000
```

То:

```text
sl_stop = 1500 / 100000 = 0.015
tp_stop = 4000 / 100000 = 0.04
```

То есть стоп 1.5%, тейк 4%.

Важно:

```text
trade_management.py не знает, что это ATR14.
trade_management.py не знает множители 1.5 и 4.0.
Он просто применяет готовые distance columns.
```

---

## 9. backtest.py — запуск одного StrategySpec

`execution/backtest.py` собирает всё вместе:

```text
spec
→ build_feature_plan_from_strategy_spec(spec)
→ add_feature_columns_from_plan(ohlcv, plan)
→ build_signals_from_spec(df, spec, plan)
→ build_stops_from_trade_management(df, spec, plan)
→ vectorbt.Portfolio.from_signals(...)
→ VariantResult
```

Backtest — это оркестратор одного экземпляра стратегии.

Он не придумывает торговую логику. Он выполняет pipeline.

---

## 10. runner.py — запуск активных стратегий

`execution/runner.py` отвечает за запуск списка активных specs.

Он делает:

```text
specs = active_strategy_specs(symbol, base_timeframe)
loaded = load_candles_once(...)
for spec in specs:
    result = run_strategy_spec(spec, loaded.ohlcv)
write_research_results(...)
print table
```

Сейчас активный список должен содержать только:

```text
ema_pullback_fast20_anchor200_slow1000
```

То есть `run.py` больше не гоняет старые ручные variants:

```text
baseline
conservative
aggressive
20_200_500_reclaim
```

Они уходят из active path.

---

## 11. JSON report — что увидит будущий frontend

После запуска создаётся:

```text
research/results/latest.json
research/results/runs/<run_id>.json
```

В variant должен попасть:

```text
variant
config_id
symbol
timeframe
strategy_spec
metrics
trade_records
```

Для frontend это важно.

Он сможет показать:

```text
Strategy:
  EMA Pullback

Anchor stack:
  fast: EMA20
  anchor: EMA200
  slow: EMA1000

Entry:
  fast > anchor > slow
  pullback to anchor
  reclaim anchor

Trade management:
  stop: ATR14 * 1.5
  take: ATR14 * 4.0

Metrics:
  trades
  Sharpe
  PF
  MaxDD

Trades:
  entry_time
  exit_time
  entry_price
  exit_price
  pnl
```

---

## 12. Весь путь в одной схеме

```text
Человеческая идея:
  купить откат к EMA200,
  если EMA20 > EMA200 > EMA1000,
  стоп 1.5 ATR,
  тейк 4 ATR

↓ превращается в

EmaPullbackStrategySpec:
  fast = EMA20
  anchor = EMA200
  slow = EMA1000
  components = direction/setup/trigger/etc
  exit_rules = ATR distances

↓ компилируется в

FeaturePlan:
  ema_close_base_20
  ema_close_base_200
  ema_close_base_1000
  atr_close_base_14
  atr_close_base_14_x1_5
  atr_close_base_14_x4_0

↓ считается в

features/calculations.py:
  добавляет колонки в DataFrame

↓ идёт в

components:
  direction: fast > anchor > slow
  setup: pullback to anchor
  trigger: reclaim anchor
  blockers/risk/exits

↓ собирается в

signals.py:
  entries = direction AND blockers AND setup AND trigger AND risk
  exits = signal exits

↓ stop/take через

trade_management.py:
  sl_stop = stop_distance / close
  tp_stop = take_distance / close

↓ исполняется в

vectorbt:
  Portfolio.from_signals(...)

↓ сохраняется в

JSON report:
  strategy_spec
  metrics
  trade_records
```

---

## 13. Почему это лучше старого FeatureRelation-подхода

Старый подход был:

```text
FeatureProfile:
  intraday_trend
  swing_trend
  entry_anchor
```

Это было удобно как временный мост, но плохо для будущего frontend/grid.

Проблема:

```text
стратегия задавалась не в одном месте
часть смысла была в FeatureRelation
часть в variants
часть в components
часть в trade_management
```

Новый подход:

```text
StrategySpec — единственный источник смысла стратегии.
```

А остальные слои делают свою работу:

```text
FeaturePlan — что посчитать
Features — как посчитать
Components — как принять решение
Signals — как собрать entry/exit
TradeManagement — как применить exit rules
Backtest — как прогнать
Report — как сохранить
```

---

## 14. Главное правило

`StrategySpec` отвечает на вопрос:

```text
Что за стратегия?
```

`FeaturePlan` отвечает:

```text
Какие колонки нужны?
```

`Features` отвечают:

```text
Как посчитать эти колонки?
```

`Components` отвечают:

```text
Какая логика входа/фильтра/выхода?
```

`signals.py` отвечает:

```text
Как собрать компоненты в entries/exits?
```

`trade_management.py` отвечает:

```text
Как применить готовые exit distance columns?
```

`backtest.py` отвечает:

```text
Как прогнать это через vectorbt?
```

`results.py` отвечает:

```text
Как сохранить результат?
```

Так торговая фраза “купить откат к EMA200 при EMA20 > EMA200 > EMA1000” проходит через весь pipeline.
