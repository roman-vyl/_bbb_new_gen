# Research Stage 6 — First Real Component Variant

## Goal

Цель Stage 6 — сделать первый полный component-based variant внутри `research/strategies/ema_pullback`, чтобы подтвердить, что цепочка `components.py` -> `StrategyConfig` -> `StrategyInstance` -> composer в `signals.py` -> runner действительно запускает новую торговую логику через component ids.

На этой стадии добавляются только два новых реальных компонента:

- `setup`: `pullback_to_fast_ema`;
- `trigger`: `reclaim_fast_ema`.

Остальные роли должны оставаться подключёнными через существующие/default/stub components. Также Stage 6 должен дать прямое сравнение нового variant с уже существующими manual variants, без перехода к grid/optimizer/framework.

## Desired outcome

К концу Stage 6 ожидается следующее:

- в `setup.py` добавлен новый реальный setup component `pullback_to_fast_ema`;
- в `triggers.py` добавлен новый реальный trigger component `reclaim_fast_ema`;
- оба component ids зарегистрированы в family-local registry `components.py`;
- в `variants.py` добавлен новый manual variant, например `ema_pullback_reclaim_fast`;
- новый variant использует новые component ids:
  - `setup_component = pullback_to_fast_ema`;
  - `trigger_component = reclaim_fast_ema`;
- assembly в `StrategyConfig`/`StrategyInstance` включает все 6 ролей:
  - `direction_component = ema_trend`;
  - `blockers_component = no_blockers`;
  - `setup_component = pullback_to_fast_ema`;
  - `trigger_component = reclaim_fast_ema`;
  - `exits_component = ema_cross_down`;
  - `risk_component = no_risk_filter`;
- existing baseline/manual variants продолжают работать без изменения смысла;
- `python research/strategies/ema_pullback/run.py` печатает comparison table с новым variant и `status=ok`;
- `research/ema_smoke.py` остаётся рабочим.

## Scope

Разрешено в Stage 6:

- изменить `research/strategies/ema_pullback/setup.py`;
- изменить `research/strategies/ema_pullback/triggers.py`;
- изменить `research/strategies/ema_pullback/components.py` для регистрации новых ids;
- изменить `research/strategies/ema_pullback/variants.py` для добавления нового manual variant;
- при необходимости точечно изменить `signals.py`, только если это действительно нужно для корректной передачи данных компонентам;
- добавить или обновить тесты для новых components и нового variant;
- после реализации добавить implementation summary в этот документ.

## Out of scope

В Stage 6 явно запрещено:

- не менять `data_engine/`;
- не делать component grid;
- не делать optimizer;
- не делать parameter sweep;
- не делать YAML/JSON strategy config;
- не делать frontend/visual constructor;
- не делать global research framework;
- не создавать `research/common`;
- не делать auto-discovery/plugin system/dynamic imports;
- не добавлять live trading/execution/order routing;
- не делать advanced blockers/exits/risk в Stage 6;
- не менять смысл существующих baseline/manual variants без необходимости;
- не сохранять results в БД или файлы.

## Component design

Ниже зафиксирована минимальная семантика новых компонентов на Stage 6.

### Setup: `pullback_to_fast_ema`

Назначение:

- определить ситуацию, где рынок находится в EMA uptrend context;
- убедиться, что в последние несколько баров был откат к fast EMA.

Минимальная первая версия:

- используется уже рассчитанная `ema_fast`;
- используется `ema_slow`;
- trend context: `ema_fast > ema_slow`;
- pullback condition: за последние `pullback_lookback` баров хотя бы один `low <= ema_fast`;
- default для `pullback_lookback` может быть небольшим (например, `3`);
- результат компонента — `boolean Series`.

Важно:

- не добавлять новые параметры в CLI;
- если параметр нужен, он должен иметь default внутри компонента или быть вынесен в config на отдельной стадии;
- не добавлять ATR/volume/complex filters в Stage 6.

### Trigger: `reclaim_fast_ema`

Назначение:

- дать entry trigger, когда цена после отката возвращается выше fast EMA.

Минимальная первая версия:

- используется `close`;
- используется `ema_fast`;
- reclaim condition: текущий `close > ema_fast` и предыдущий `close <= previous ema_fast`;
- результат компонента — `boolean Series`.

Важно:

- trigger не должен сам повторно проверять весь setup/trend context;
- setup и direction остаются отдельными слоями;
- final entry по-прежнему собирается composer-ом через AND.

## Full assembly

Новый variant фиксируется как полная сборка всех ролей:

```text
variant = ema_pullback_reclaim_fast

direction_component = ema_trend
blockers_component = no_blockers
setup_component = pullback_to_fast_ema
trigger_component = reclaim_fast_ema
exits_component = ema_cross_down
risk_component = no_risk_filter
```

