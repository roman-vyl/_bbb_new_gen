# Research Stage 4 — Manual Variants

## Goal

Цель Stage 4: добавить несколько ручных variants для `ema_pullback`, запускать и сравнивать несколько `StrategyInstance` в одном прогоне и при этом сохранить простую архитектуру без framework-слоя.

- Добавить ручные variants внутри `research/strategies/ema_pullback/`.
- Запускать несколько `StrategyInstance` одной family в одном runner.
- Сохранить research-track подход: минимум абстракций, без optimizer/registry/grid.

## Desired outcome

Ожидаемый результат этапа:

- `python research/strategies/ema_pullback/run.py` выводит comparison table по variants.
- Включены variants: `baseline` / `conservative` / `aggressive`.
- Каждый variant имеет deterministic `config_id`.
- Candles загружаются один раз на весь запуск.
- Каждый variant прогоняется через один и тот же pipeline.

## Scope

Разрешено в рамках Stage 4:

- Создать `research/strategies/ema_pullback/variants.py`.
- Изменить `research/strategies/ema_pullback/run.py`.
- При необходимости точечно изменить `research/strategies/ema_pullback/config.py`.
- Добавить тесты для manual variants.

## Out of scope

Явно запрещено:

- Не менять `data_engine/`.
- Не добавлять `data_engine/strategies`, `data_engine/signals`, `data_engine/backtest`, `data_engine/adapters/vectorbt.py`.
- Не добавлять backend indicators.
- Не делать registry/component registry/grid/optimizer.
- Не делать YAML/JSON config.
- Не делать `research/common` framework без явной необходимости.
- Не делать live trading/execution/order routing/live risk engine.
- Не сохранять результаты в БД.

## Manual variants

Начальные ручные variants:

- `ema_pullback_baseline`: `ema_fast=20`, `ema_slow=50`.
- `ema_pullback_conservative`: `ema_fast=50`, `ema_slow=200`.
- `ema_pullback_aggressive`: `ema_fast=10`, `ema_slow=30`.

Пояснения:

- Variants отличаются только параметрами `StrategyConfig`.
- Компоненты `direction/setup/trigger/exits` на этом этапе не варьируются.
- Stage 4 остаётся в пределах `research/`, без переноса в backend или data engine.

## Proposed file changes

- `research/strategies/ema_pullback/variants.py` — ручной factory/list `StrategyInstance`.
- `research/strategies/ema_pullback/run.py` — multi-variant runner и stdout comparison table.
- `research/strategies/ema_pullback/config.py` — менять только если текущая модель требует минимальной адаптации.
- `tests/...` — покрытие deterministic `config_id` и uniqueness для variants.

## Runner behavior

Алгоритм runner:

1. Load candles once.
2. Build manual variants.
3. For each `StrategyInstance`:
   - calculate features;
   - compose signals;
   - run vectorbt portfolio;
   - collect metrics.
4. Print comparison table.
5. Print `status=ok`.

## Tests

Ожидаемые тесты Stage 4:

- `build_manual_variants` возвращает минимум 3 variants.
- Все variants имеют уникальные names.
- Все variants имеют уникальные `config_id`.
- Повторные вызовы дают те же `config_id`.
- Все variants имеют family `ema_pullback`.
- Для каждого variant выполняется `ema_fast < ema_slow`.
- `db_path` остаётся исключённым из `config_id`, если это уже покрыто существующим config test.

## Acceptance commands

```bash
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
git status -sb
```
