# EMA Pullback — Human README: от торговой идеи до исполнения

Документ описывает текущий `ema_pullback` pipeline после Step 11–12: `StrategySpec`,
`FeaturePlan`, расчёт признаков (включая RSI и MTF alignment), family-local component
registry, side-aware composer в `execution/signals.py`, trade management и отчёты.

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
  direction = ema_anchor_stack_trend
  blockers = (BlockerRuleSpec(component_id=no_blockers),)
  setup    = pullback_to_anchor
  trigger  = TriggerSpec(component_id=reclaim_anchor)
  exits    = (
    ExitRuleSpec(component_id=atr_stop_loss, exit_kind=stop_loss, distance=ATR14 * 1.5),
    ExitRuleSpec(component_id=atr_take_profit, exit_kind=take_profit, distance=ATR14 * 4.0),
  )
  risk     = no_risk_filter

trade_sides:
  enabled = long

setup:
  lookback = 3

trade_management:
  profile = reserved
```

Важно: здесь живут все смысловые параметры стратегии:

```text
EMA periods
fast / anchor / slow roles
component ids
trade sides
setup params
blocker rule params (например RSI thresholds / lookback)
exit rule params (например RSI thresholds или ATR distance)
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
(+ опционально RSI и MTF EMA/RSI, если они нужны rule specs компонентов)
```

И mapping ролей:

```text
anchor_columns:
  fast   -> ema_close_base_20
  anchor -> ema_close_base_200
  slow   -> ema_close_base_1000

exit_distance_columns:
  stop_loss -> atr_close_base_14_x1_5
  take_profit -> atr_close_base_14_x4_0

rsi_columns:
  (timeframe, period) -> rsi_close_{timeframe}_{period}
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

Для MTF признаков имена колонок включают timeframe, например:

```text
ema_close_4h_200
rsi_close_1d_14
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

Потом (если нужно компонентам) RSI:

```text
rsi_close_base_14
```

И (если rule spec просит MTF) EMA/RSI на старшем таймфрейме:

```text
1) resample base OHLCV на нужный timeframe (pandas freq из data_engine contracts)
2) посчитать индикатор на closed bars старшего TF
3) сдвинуть значение на момент завершения старшей свечи (no-lookahead)
4) выровнять на base index через forward-fill
```

Важно:

```text
features/calculations.py не решает, что стоп должен быть 1.5 ATR.
Он просто видит в FeaturePlan: нужна колонка atr_close_base_14_x1_5.
```

Множители пришли из `StrategySpec`, а не из хардкода в расчёте.

MTF сейчас строится **внутри research** из уже загруженного base OHLCV (отдельная
загрузка старших свечей из БД не требуется).

---

## 5. Component Registry — выбор кирпичиков логики

В `StrategySpec` написано:

```text
direction = ema_anchor_stack_trend
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
component_id = ema_anchor_stack_trend
→ components/direction.py::ema_anchor_stack_trend
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

`ema_anchor_stack_trend` получает:

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

`touch_anchor` (альтернативный trigger id) проверяет касание anchor со стороны
сделки и закрепление закрытием:

```text
long:
  low <= anchor
  AND close >= anchor

short:
  high >= anchor
  AND close <= anchor
```

### Blockers

Базовый noop:

```text
no_blockers
```

Возвращает `true` для всех баров.

Дополнительно (Step 12):

```text
counter_candle_blocker
  long: пропускает только bullish свечи (close >= open)
  short: пропускает только bearish свечи (close <= open)

rsi_extreme_blocker
  использует подготовленную RSI колонку (rsi_col)
  long: блокирует вход, если RSI слишком низкий (ниже long_min), опционально с lookback
  short: блокирует вход, если RSI слишком высокий (выше short_max), опционально с lookback
```

### Risk

Пока:

```text
no_risk_filter
```

Тоже всё пропускает.

Позже здесь могут быть фильтры допуска сделки.

### Exits

Exit rules живут в `components.exits`. Сигнальные правила дают boolean-серии,
а ATR stop/take дают distance-серии, которые execution-layer позже переводит в
`sl_stop/tp_stop`.

Базовый no-op signal exit:

```text
no_signal_exit
```

Он нужен только если стратегия явно хочет отсутствие signal-based exit.

Текущие exit-компоненты:

```text
rsi_signal_exit
  использует подготовленную RSI колонку (rsi_col)
  long: exit_signal когда RSI выше long_exit_above
  short: exit_signal когда RSI ниже short_exit_below

atr_stop_loss
  возвращает подготовленную ATR distance series для stop_loss

atr_take_profit
  возвращает подготовленную ATR distance series для take_profit

constant_usd_stop_loss
  константная дистанция в USD (ряд одного значения) для stop_loss

constant_usd_take_profit
  константная дистанция в USD для take_profit

planned later:
  time_stop
```

Выходы в vectorbt комбинируются уже в `execution/exits.py`: signal exits идут в
`exits/short_exits`, а ATR distance rules маппятся в `sl_stop/tp_stop`.

---

## 7. signals.py — сборка итоговых входов

`execution/signals.py` отвечает за вопрос:

```text
Как из компонентов собрать финальные long/short entry signals?
```

Он делает один и тот же side-aware проход по текущим component ids:

```text
direction = ema_anchor_stack_trend(..., side)
blockers  = AND(blocker_i(..., side, rule=..., rsi_col=...))
setup     = pullback_to_anchor(..., side)
trigger   = resolve(components.trigger.component_id)(..., side)
risk      = no_risk_filter(..., side)
```

Потом собирает side entry:

```text
side_entries =
  direction
  AND blockers
  AND setup
  AND trigger
  AND risk
```

В человеческом виде:

```text
Long покупаем, если:
  EMA20 > EMA200 > EMA1000
  и все blockers разрешили вход (AND)
  и был откат к EMA200
  и сработал выбранный trigger (reclaim/touch/…)
  и risk filter разрешает сделку

Short продаём, если:
  EMA20 < EMA200 < EMA1000
  и все blockers разрешили вход (AND)
  и был откат к EMA200 (зеркально)
  и сработал выбранный trigger (зеркально)
  и risk filter разрешает сделку
```

`build_signals_from_spec(...)` возвращает:

```text
PortfolioSignals:
  entries
  short_entries
```

Если сторона отключена в `trade_sides`, соответствующие серии заполняются `False`.
Выходы собираются не здесь, а в `execution/exits.py`.

---

## 8. execution/exits.py — применение правил выхода

`StrategySpec` говорит:

```text
components.exits:
  ExitRuleSpec(atr_stop_loss, exit_kind=stop_loss, distance=ATR14 * 1.5)
  ExitRuleSpec(atr_take_profit, exit_kind=take_profit, distance=ATR14 * 4.0)
```

`FeaturePlan` уже превратил это в колонки:

```text
stop_loss -> atr_close_base_14_x1_5
take_profit -> atr_close_base_14_x4_0
```

`execution/exits.py` берёт готовые distance columns:

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
execution/exits.py не знает, что это ATR14.
execution/exits.py не знает множители 1.5 и 4.0.
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
→ build_exit_outputs_from_spec(df, spec, plan)
→ vectorbt.Portfolio.from_signals(entries, exits, short_entries, short_exits, ...)
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
  (+ опционально rsi_close_* и MTF ema_close_* / rsi_close_*)

↓ считается в

features/calculations.py:
  добавляет колонки в DataFrame

↓ идёт в

components:
  direction: fast > anchor > slow
  setup: pullback to anchor
  trigger: reclaim/touch/…
  blockers/risk/signal exits

↓ собирается в

signals.py:
  entries = direction AND blockers AND setup AND trigger AND risk
  short_entries = mirrored direction/setup/trigger path

↓ exit rules через

execution/exits.py:
  exits = OR(long signal exits)
  short_exits = OR(short signal exits)
  sl_stop = stop_distance / close
  tp_stop = take_distance / close

↓ исполняется в

vectorbt:
  Portfolio.from_signals(entries, exits, short_entries, short_exits, ...)

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
Signals — как собрать entries/short_entries
ExitLayer — как собрать exits/short_exits и применить stop/take exit rules
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
Как собрать entry-компоненты в entries/short_entries?
```

`execution/exits.py` отвечает:

```text
Как собрать components.exits в exits/short_exits/sl_stop/tp_stop?
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
