---
name: Step 11 Sides
overview: Внедрить Step 11 как тонкий typed layer для long/short поверх существующего `EmaPullbackStrategySpec`, без отдельного framework, grid, внешних config-файлов и набора новых компонентов.
todos:
  - id: side-spec
    content: Add TradeSide/TradeSideSpec to StrategySpec and factory defaults
    status: completed
  - id: signal-container
    content: Replace pair return with long/short PortfolioSignals container
    status: completed
  - id: side-components
    content: Pass side context through current components with minimal mirrored semantics
    status: completed
  - id: vectorbt-wiring
    content: Wire entries/exits/short_entries/short_exits into vectorbt backend
    status: completed
  - id: focused-tests
    content: Update existing tests and add focused spec, component, pipeline, backtest, and optional vectorbt side tests
    status: completed
  - id: readme-updates
    content: Update README docs in docs/research/README.md, docs/research/EMA_PULLBACK_PIPELINE_README.md, and research/strategies/ema_pullback/README.md
    status: completed
isProject: false
---

# Step 11: Bidirectional Side Semantics MVP

## Цель
Сделать стратегию не long-only на уровне модели и исполнения, но не превращать Step 11 в большой component framework. Минимальный результат: `StrategySpec` явно говорит, какие стороны разрешены, signal composer собирает long/short сигналы, а `vectorbt` получает `entries/exits/short_entries/short_exits`.

## Граница простого внедрения
- Не добавлять global registry, optimizer, grid, JSON/YAML config или новый constructor layer.
- Не создавать набор альтернативных компонентов.
- Не менять `data_engine/`.
- Не трогать Step 13 external config.
- Сохранить текущий active default как `long` по умолчанию, чтобы поведение runner-а осталось предсказуемым.

## Предлагаемая реализация

1. Ввести side-модель в [`research/strategies/ema_pullback/spec.py`](research/strategies/ema_pullback/spec.py):
   - `TradeSide = Literal["long", "short"]`.
   - `TradeSideSpec(enabled: tuple[TradeSide, ...] = ("long",))`.
   - validation: не пусто, только `long/short`, без дублей.
   - добавить поле `trade_sides: TradeSideSpec` в `EmaPullbackStrategySpec`.

   Это поле должно входить в `strategy_spec_to_dict(...)`, а значит и в `config_id`. Это правильно: long-only и long+short являются разными semantic strategy instances.

2. Расширить factory в [`research/strategies/ema_pullback/spec_instances.py`](research/strategies/ema_pullback/spec_instances.py):
   - `make_ema_pullback_strategy_spec(..., enabled_sides=("long",))`.
   - default остаётся long-only.
   - `variant` пока не переименовывать: текущая модель variant всё ещё описывает anchor stack, а `config_id` отличает semantic spec. Это меньше churn-а для stdout/report tests.

3. Ввести компактный signal container в [`research/strategies/ema_pullback/execution/signals.py`](research/strategies/ema_pullback/execution/signals.py):
   - `PortfolioSignals(entries, exits, short_entries, short_exits)`.
   - `build_signals_from_spec(...)` возвращает этот container вместо пары.
   - disabled side получает all-False series с тем же index.

   Текущая точка long-only сейчас выглядит так:
   ```python
   final_entry = long_allowed & blockers_ok & setup_long & trigger_long & risk_ok
   final_exit = exit_signal
   ```
   Её стоит заменить на сборку по side: long и short считаются одинаковым pipeline-контрактом, но с разной side-семантикой.

4. Сделать текущие компоненты side-aware минимально, без новых component ids:
   - [`components/direction.py`](research/strategies/ema_pullback/components/direction.py):
     - long: `fast > anchor > slow`.
     - short: `fast < anchor < slow`.
   - [`components/setup.py`](research/strategies/ema_pullback/components/setup.py):
     - long pullback: `low <= anchor`.
     - short pullback: `high >= anchor`.
   - [`components/triggers.py`](research/strategies/ema_pullback/components/triggers.py):
     - long reclaim: close crosses above anchor.
     - short reclaim: close crosses below anchor.
   - [`components/blockers.py`](research/strategies/ema_pullback/components/blockers.py), [`components/risk.py`](research/strategies/ema_pullback/components/risk.py), [`components/exits.py`](research/strategies/ema_pullback/components/exits.py): accept optional `side` but keep current neutral behavior.

   Это не Step 12 component expansion: мы не добавляем новые live blocker/risk/exit variants, только даём текущим компонентам side context.

5. Подключить short wiring в [`research/strategies/ema_pullback/execution/backtest.py`](research/strategies/ema_pullback/execution/backtest.py):
   - получить `signals = build_signals_from_spec(...)`.
   - получить `exit_outputs = build_exit_outputs_from_spec(...)`.
   - применить ATR warmup mask отдельно к `signals.entries` и `signals.short_entries`.
   - вызвать `vbt.Portfolio.from_signals(...)` с `entries`, `exit_outputs.exits`, `short_entries`, `exit_outputs.short_exits`.
   - оставить `sl_stop/tp_stop` прежними: это процентные distance series, они подходят для обеих сторон.

6. Обновить отчётность только там, где уже есть side-поля:
   - [`execution/results.py`](research/strategies/ema_pullback/execution/results.py) уже нормализует vectorbt direction в `long/short`, менять схему не нужно.
   - JSON автоматически получит `trade_sides` внутри `strategy_spec`.
   - `report_schema_version` можно оставить `2`, если top-level schema не меняется. Если хочется явно зафиксировать контракт `strategy_spec.trade_sides`, можно поднять до `3`, но я бы не делал этого в MVP без потребителя схемы.

## Тесты
Тестовый scope не должен быть только "добавить пару новых проверок". Step 11 меняет контракт signals и spec, поэтому нужно пройтись по существующим тестам и добавить side-specific coverage.

Существующие тесты, которые почти наверняка потребуют адаптации:
- [`tests/test_ema_pullback_pipeline.py`](tests/test_ema_pullback_pipeline.py): должен ожидать entry-only `PortfolioSignals(entries, short_entries)` и отдельный exit-layer для `exits/short_exits`.
- [`tests/test_ema_pullback_components.py`](tests/test_ema_pullback_components.py): текущие вызовы компонентов без `side` нужно сохранить через default `side="long"` или обновить на явный `side`.
- [`tests/test_ema_pullback_exits.py`](tests/test_ema_pullback_exits.py): оставить как guardrail, что `sl_stop/tp_stop` остаются distance/close и не зависят от side.
- [`tests/test_strategy_config_instance.py`](tests/test_strategy_config_instance.py): расширить проверками `TradeSideSpec`, default long-only и влияния side spec на `config_id`.
- [`tests/test_ema_pullback_results_artifact.py`](tests/test_ema_pullback_results_artifact.py): не ломать текущий schema payload; при наличии vectorbt добавить проверку short trade normalization.
- [`tests/test_ema_pullback_run_metrics.py`](tests/test_ema_pullback_run_metrics.py): если stdout table остаётся прежним, менять минимум; если добавляем колонку sides, отдельно проверить вывод.

Новые focused tests:
- Spec contract:
  - default `trade_sides.enabled == ("long",)`;
  - `("long", "short")` валиден;
  - пустой список, неизвестная side и дубли rejected;
  - long-only и long+short дают разные `strategy_spec_config_id(...)`.
- Component semantics:
  - `ema_anchor_stack_trend(..., side="long")`: `fast > anchor > slow`;
  - тот же component с `side="short"`: `fast < anchor < slow`;
  - `untouched_anchor_setup(..., side="long")`: armed regime — anchor untouched `lookback` bars, then through first touch and `active_bars` window (`low <= anchor` defines touch);
  - `untouched_anchor_setup(..., side="short")`: mirror with `high >= anchor` and `close < anchor` while armed.
  - `reclaim_anchor(..., side="long")`: close crosses above anchor;
  - `reclaim_anchor(..., side="short")`: close crosses below anchor;
  - neutral components accept side and preserve all-True/all-False behavior.
- Signal composer:
  - disabled short side returns all-False `short_entries`;
  - enabled short side can produce `short_entries`;
  - long side output stays identical for default spec on deterministic fixture;
  - all returned series are bool, same index, no NaN.
- Exit-layer:
  - disabled short side returns all-False `short_exits`;
  - signal exits OR-ятся отдельно от entry composer;
  - ATR stop/take rules маппятся в `sl_stop/tp_stop`.
- Backtest wiring:
  - unit-level test with monkeypatched/fake `Portfolio.from_signals` if practical, verifying `entries`, `exits`, `short_entries`, `short_exits` are passed;
  - ATR warmup mask applies to both long and short entries.
- Optional vectorbt:
  - extend existing optional test to create one short trade and assert `extract_trade_records(...)` emits `direction == "short"`.

Команды проверки после реализации:
- `pytest tests/test_strategy_config_instance.py tests/test_ema_pullback_components.py tests/test_ema_pullback_pipeline.py tests/test_ema_pullback_exits.py tests/test_ema_pullback_run_metrics.py`
- `pytest tests/test_ema_pullback_results_artifact.py`
- Если установлен `vectorbt`: `pytest -m optional_vectorbt`

## To Do
- Обновить README в нескольких местах после реализации Step 11:
  - [`docs/research/README.md`](docs/research/README.md)
  - [`docs/research/EMA_PULLBACK_PIPELINE_README.md`](docs/research/EMA_PULLBACK_PIPELINE_README.md)
  - [`research/strategies/ema_pullback/README.md`](research/strategies/ema_pullback/README.md)

## Критерий готовности
Step 11 считается готовым, если default long-only прогон остаётся рабочим, spec явно содержит `trade_sides`, composer и vectorbt path поддерживают четыре signal series, а включение `("long", "short")` не требует новых registry/framework слоёв.