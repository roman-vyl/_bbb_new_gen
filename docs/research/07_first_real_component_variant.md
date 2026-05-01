# Research Stage 7 — First Real Component Variant

## Goal

Stage 7 — это первая попытка написать торговую логику, похожую на реальную стратегию, а не просто архитектурную заглушку.

Идея Stage 7:

```text
Long от EMA200 на 1h,
если EMA20 > EMA200
и EMA200 > EMA500,
после отката к EMA200
и возврата цены выше EMA200.
```

Главная цель этапа — не доказать прибыльность стратегии, а проверить, что наша архитектура действительно позволяет собрать и прогнать осмысленную component-based логику:

```text
FeaturesDev → Component Registry → StrategyConfig → StrategyInstance → signals.py → run.py → vectorbt
```

После Stage 7 смотрим, что выдаёт backtest, и уже потом решаем, куда усложнять стратегию.

---

## Current constraints

На этом этапе работаем только с тем, что уже доступно:

```text
base timeframe: 1h
data source: clean candles from data_engine
research family: ema_pullback
```

Не добавляем:

```text
RSI
ATR
HTF / multi-timeframe
daily/swing/intraday RSI
feature cache
grid
optimizer
YAML/JSON config
frontend/visual constructor
advanced exits
advanced risk
live trading
data_engine changes
```

---

## Trading idea

Проверяем простую long-логику:

```text
1. Есть восходящий intraday trend:
   EMA20 > EMA200

2. Есть восходящий swing trend:
   EMA200 > EMA500

3. Цена откатывается к EMA200.

4. Цена возвращается выше EMA200.

5. Вход в long.

6. Выход пока оставляем существующий/default.
```

Важно: EMA200 сама по себе не является trigger.  
EMA200 — это entry anchor, то есть опорная EMA, от которой ищется вход.

Trigger — это событие:

```text
цена вернулась выше entry anchor
```

---

## FeatureProfile

Добавить новый feature profile:

```text
ema_pullback_1h_20_200_500
```

Он должен описывать физические EMA series и semantic relations.

### Physical FeatureSeries

```text
ema_close_1h_20
ema_close_1h_200
ema_close_1h_500
```

На первом внедрении допускаются compatibility columns / aliases, если текущий код использует имена вроде:

```text
ema_20
ema_200
ema_500
```

Но смыслово они должны быть описаны через FeatureProfile.

### FeatureRelations

```text
intraday_trend:
  fast = ema_close_1h_20
  slow = ema_close_1h_200

swing_trend:
  fast = ema_close_1h_200
  slow = ema_close_1h_500

entry_anchor:
  ema = ema_close_1h_200
```

Ключевой смысл:

```text
EMA20 > EMA200 = intraday trend bullish
EMA200 > EMA500 = swing trend bullish
EMA200 = entry anchor
```

EMA200 одновременно играет разные роли:

```text
slow в intraday_trend
fast в swing_trend
entry anchor для входа
```

Это нормальная ситуация и именно ради неё нужен FeaturesDev.

---

## New direction component

Добавить новый direction component:

```text
intraday_and_swing_trend_long
```

Логика:

```text
intraday_trend.fast > intraday_trend.slow
AND
swing_trend.fast > swing_trend.slow
```

Для текущего profile это означает:

```text
EMA20 > EMA200
AND
EMA200 > EMA500
```

Этот компонент отвечает только за направление рынка:

```text
long allowed / long not allowed
```

Он не проверяет откат, trigger, exit или risk.

---

## New setup component

Добавить новый setup component:

```text
pullback_to_entry_anchor
```

Логика первой версии:

```text
в последние N свечей цена откатывалась к entry_anchor
```

Для текущего profile:

```text
entry_anchor = EMA200
```

Минимальная версия:

```text
rolling_any(low <= entry_anchor, window=3)
```

То есть setup отвечает на вопрос:

```text
Был ли недавно откат к EMA200?
```

Параметр `window=3` на Stage 7 можно оставить как простой default внутри компонента.  
Не добавлять CLI/config-grid для этого параметра на текущем этапе.

---

## New trigger component

Добавить новый trigger component:

```text
reclaim_entry_anchor
```

Логика первой версии:

```text
previous close <= previous entry_anchor
AND
current close > current entry_anchor
```

Для текущего profile:

```text
previous close <= previous EMA200
AND
current close > current EMA200
```

Trigger отвечает только за момент входа:

```text
Цена вернулась выше EMA200.
```

Trigger не должен сам проверять весь trend/setup.  
Итоговый вход должен собираться в `signals.py` через AND.

---

## Full component assembly

Добавить новый manual variant:

```text
ema_pullback_1h_20_200_500_reclaim
```

Сборка:

```text
feature_profile = ema_pullback_1h_20_200_500

direction_component = intraday_and_swing_trend_long
blockers_component = no_blockers
setup_component = pullback_to_entry_anchor
trigger_component = reclaim_entry_anchor
exits_component = ema_cross_down
risk_component = no_risk_filter
```

Старые manual variants оставить как контрольную группу:

```text
ema_pullback_baseline
ema_pullback_conservative
ema_pullback_aggressive
```

После Stage 7 runner должен сравнивать старые variants и новый variant.

---

## signals.py behavior

`signals.py` остаётся composer.

Он не должен становиться местом торговой логики.

Ожидаемая логика:

```text
direction_output = selected direction component
blockers_output = selected blockers component
setup_output = selected setup component
trigger_output = selected trigger component
risk_output = selected risk component
exit_output = selected exit component

final_entry =
  direction_output
  AND blockers_output
  AND setup_output
  AND trigger_output
  AND risk_output

final_exit = exit_output
```

---

## Files likely to change

Разрешённая зона:

```text
research/strategies/ema_pullback/feature_profile.py
research/strategies/ema_pullback/features.py
research/strategies/ema_pullback/direction.py
research/strategies/ema_pullback/setup.py
research/strategies/ema_pullback/triggers.py
research/strategies/ema_pullback/components.py
research/strategies/ema_pullback/variants.py
research/strategies/ema_pullback/signals.py
tests/...
docs/research/07_first_real_component_variant.md
```

`signals.py` менять только если нужно для передачи feature relations/components context.  
Не превращать `signals.py` в feature layer, registry или optimizer.

---

## Out of scope

Stage 7 не делает:

```text
RSI
ATR
HTF
multi-timeframe alignment
feature cache
component grid
optimizer
parameter sweep
YAML/JSON strategy config
frontend/visual constructor
advanced blockers
advanced exits
advanced risk
live trading
execution/order routing
backend indicators
data_engine changes
writes to SQLite
```

---

## Rollout steps

### Step 7.1 — Document the plan

Создать и принять этот документ.

Код не менять.

---

### Step 7.2 — Add feature profile for 20/200/500

Добавить profile:

```text
ema_pullback_1h_20_200_500
```

С relations:

```text
intraday_trend
swing_trend
entry_anchor
```

---

### Step 7.3 — Prepare EMA20/EMA200/EMA500 features

Обновить `features.py`, чтобы выбранный profile мог получить нужные EMA series.

Компоненты не должны считать EMA сами.

---

### Step 7.4 — Add direction component

Добавить:

```text
intraday_and_swing_trend_long
```

Логика:

```text
intraday_trend bullish
AND
swing_trend bullish
```

---

### Step 7.5 — Add setup component

Добавить:

```text
pullback_to_entry_anchor
```

Минимальная логика:

```text
rolling_any(low <= entry_anchor, window=3)
```

---

### Step 7.6 — Add trigger component

Добавить:

```text
reclaim_entry_anchor
```

Минимальная логика:

```text
previous close <= previous entry_anchor
AND
current close > current entry_anchor
```

---

### Step 7.7 — Register new component ids

В `components.py` зарегистрировать:

```text
direction:
  intraday_and_swing_trend_long

setup:
  pullback_to_entry_anchor

trigger:
  reclaim_entry_anchor
```

Старые components не удалять.

---

### Step 7.8 — Add new manual variant

В `variants.py` добавить:

```text
ema_pullback_1h_20_200_500_reclaim
```

Он должен использовать:

```text
feature_profile = ema_pullback_1h_20_200_500
direction_component = intraday_and_swing_trend_long
setup_component = pullback_to_entry_anchor
trigger_component = reclaim_entry_anchor
```

Остальные роли:

```text
blockers_component = no_blockers
exits_component = ema_cross_down
risk_component = no_risk_filter
```

---

### Step 7.9 — Add tests

Проверить:

```text
new feature profile exists
feature profile has intraday_trend relation
feature profile has swing_trend relation
feature profile has entry_anchor relation
intraday_trend has fast/slow roles
swing_trend has fast/slow roles
entry_anchor has ema role

direction component returns true only when:
  EMA20 > EMA200 and EMA200 > EMA500

setup component detects recent pullback to entry anchor

trigger component detects reclaim above entry anchor

new component ids resolve through registry

new variant exists
new variant references valid feature_profile
new variant references valid component ids
existing manual variants still exist
all variants have unique config_id
```

---

### Step 7.10 — Run acceptance commands

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```

---

### Step 7.11 — Add implementation summary

После реализации добавить summary:

```text
what changed
which files changed
what behavior was preserved
which tests were run
backtest output summary
confirmation that data_engine/ was not changed
```

---

## Acceptance result

## Implementation summary (completed)

### What changed

Implemented Stage 7 end-to-end:

- Added new feature profile `ema_pullback_1h_20_200_500` with semantic relations:
  - `intraday_trend` (`EMA20` vs `EMA200`)
  - `swing_trend` (`EMA200` vs `EMA500`)
  - `entry_anchor` (`EMA200`)
- Updated feature preparation so selected `feature_profile` defines required EMA columns
  (including `ema_500` for Stage 7 variant).
- Added Stage 7 components:
  - direction: `intraday_and_swing_trend_long`
  - setup: `pullback_to_entry_anchor`
  - trigger: `reclaim_entry_anchor`
- Registered new component ids in the family registry.
- Added manual variant `ema_pullback_1h_20_200_500_reclaim`.
- Updated signal composition path to pass semantic relation columns from selected
  feature profile into direction/setup/trigger components.
- Extended tests to cover new profile, component ids, component logic, and variant wiring.

### Which files changed

```text
research/strategies/ema_pullback/feature_profile.py
research/strategies/ema_pullback/features.py
research/strategies/ema_pullback/direction.py
research/strategies/ema_pullback/setup.py
research/strategies/ema_pullback/triggers.py
research/strategies/ema_pullback/components.py
research/strategies/ema_pullback/signals.py
research/strategies/ema_pullback/variants.py
research/strategies/ema_pullback/run.py
tests/test_ema_pullback_feature_profile.py
tests/test_ema_pullback_components.py
tests/test_ema_pullback_manual_variants.py
tests/test_ema_pullback_pipeline.py
docs/research/07_first_real_component_variant.md
```

### What behavior was preserved

- Existing manual variants preserved:
  - `ema_pullback_baseline`
  - `ema_pullback_conservative`
  - `ema_pullback_aggressive`
- Existing default crossover pipeline behavior preserved for legacy/default profile.
- Existing exit/risk/blockers defaults preserved.

### Tests and commands run

```text
python -m pytest -q
  -> 140 passed

python research/strategies/ema_pullback/run.py
  -> status=ok

python research/ema_smoke.py
  -> status=ok
```

### Backtest output summary

`run.py` comparison table (4 variants, status=ok):

```text
ema_pullback_baseline              sharpe=0.951653  pf=1.189819  max_dd=-0.587362
ema_pullback_conservative          sharpe=0.863949  pf=1.322492  max_dd=-0.597011
ema_pullback_aggressive            sharpe=1.014079  pf=1.139126  max_dd=-0.600443
ema_pullback_1h_20_200_500_reclaim sharpe=0.820921  pf=1.883021  max_dd=-0.527299
```

### data_engine confirmation

`git diff --stat data_engine/` produced no changes.

Stage 7 считается успешным, если:

```text
1. Добавлен feature profile ema_pullback_1h_20_200_500.
2. EMA20/EMA200/EMA500 подготовлены через FeaturesDev.
3. Добавлен direction component intraday_and_swing_trend_long.
4. Добавлен setup component pullback_to_entry_anchor.
5. Добавлен trigger component reclaim_entry_anchor.
6. Все новые component ids зарегистрированы.
7. Добавлен manual variant ema_pullback_1h_20_200_500_reclaim.
8. Старые manual variants продолжают работать.
9. run.py печатает comparison table со старым variants и новым variant.
10. run.py завершается status=ok.
11. research/ema_smoke.py остаётся рабочим.
12. Все тесты проходят.
13. data_engine/ не изменён.
```

---

## What to look at after backtest

После первого запуска не делаем сразу рефакторинг.

Сначала смотрим:

```text
сколько сделок появилось
не слишком ли мало входов
не слишком ли много входов
есть ли вообще trades
как изменились Sharpe / PF / MaxDD
не сломались ли старые variants
```

Если trades слишком мало:

```text
setup/trigger слишком строгие
```

Если trades слишком много:

```text
setup/trigger слишком мягкие
```

Если trades есть, но результат плохой:

```text
логика может быть нормальной как архитектурная проверка,
но нужны blockers/exits/risk/debug counters позже
```

---

## Architecture notes

Stage 7 — первая реальная торговая вертикаль.

Но это всё ещё не полноценная стратегия.

На Stage 7 мы проверяем:

```text
можем ли мы собрать осмысленную торговую идею из:
  feature_profile
  direction component
  setup component
  trigger component
  default blockers/exits/risk
```

Главный результат Stage 7 — не прибыльность, а рабочая связка:

```text
semantic feature relations
→ real components
→ manual variant
→ backtest
→ comparison table
```
