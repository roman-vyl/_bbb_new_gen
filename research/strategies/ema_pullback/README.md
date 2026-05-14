# ema_pullback

Исследовательская strategy family для EMA pullback после Step 11 и Step 12.

После загрузки внешнего experiment-файла runner строит финальный `ExecutionConfig`
через `execution_config_from_external(...)`: `family`, `symbol`, `timeframe` и
опциональные поля `execution.*` берутся из конфига; при отсутствии
`execution.init_cash` / `fees` / `slippage` подставляются модульные дефолты
`DEFAULT_INIT_CASH` / `DEFAULT_FEES` / `DEFAULT_SLIPPAGE`. Рынок (`symbol`,
`timeframe`) всегда из загруженного спека, не из `config.py`. Отдельного
«рыночного дефолта» в модуле нет. CLI может задать только переопределение `db_path`.

Активный pipeline:

```text
EmaPullbackStrategySpec
→ FeaturePlan
→ calculated features
→ Component Registry
→ direction / blockers / setup / trigger / exits / risk
→ entry signals composer
→ execution exit-layer
→ vectorbt
→ JSON report
```

После parsing/validation внешних параметров typed-construction выполняется через
`component_builders.py`: это единый слой `params -> spec dataclasses` без работы
с `DataFrame`, indicator-расчётов или runtime execution.

Стратегии для прогона задаются **только** внешним YAML/JSON (см. `research/experiments/config_loader.py` и `instance_loader.py`). Typed-сборка из dict выполняется через `make_ema_pullback_strategy_spec(...)` / builders; отдельного «списка активных спеков в Python» нет.

Текущая модель держит все выходы в одном `components.exits`: сигнальные правила
и ATR stop/take описываются одинаково как `ExitRuleSpec`. `signals.py` собирает
только входы, а `execution/exits.py` маппит exit rules в `exits/short_exits` и
`sl_stop/tp_stop`.

`variant` — это человекочитаемый label собранного `StrategySpec`. Если caller не
задаёт его явно, имя генерируется из фактических периодов `anchor_stack`:

```text
ema_pullback_fast{fast.period}_anchor{anchor.period}_slow{slow.period}
```

## Структура каталога

| Путь | Назначение |
|------|------------|
| `config.py` | `ExecutionConfig`, `DEFAULT_INIT_CASH` / `DEFAULT_FEES` / `DEFAULT_SLIPPAGE`, `execution_config_from_external` |
| `spec.py` | Dataclass-контракты `EmaPullbackStrategySpec` и вложенных spec-частей |
| `component_builders.py` | Typed builders для `anchor/trigger/blockers/exits/trade_sides/components` |
| `spec_instances.py` | `make_ema_pullback_strategy_spec`, `variant_from_spec` |
| `run.py` | CLI: только `--config` (experiment file) и опционально `--db-path` |
| `features/plan.py` | `FeaturePlan` из `EmaPullbackStrategySpec` без расчёта данных |
| `features/calculations.py` | Расчёт только features, объявленных в `FeaturePlan` |
| `components/*.py` | Ступени пайплайна + `registry.py` для новых role ids |
| `execution/data_loader.py` | Загрузка DB candles в `LoadedCandles` (`ohlcv` + metadata диапазона) |
| `execution/backtest.py` | Backend `run_strategy_spec(...)` через vectorbt |
| `execution/report_table.py` | Stdout comparison table с `fast / anchor / slow` |
| `execution/runner.py` | `run_strategy_specs_from_config`: loader → финальный `ExecutionConfig` → backtest → таблица → JSON |
| `execution/result_models.py` | Dataclass-контракты `LoadedCandles`, `VariantMetrics`, `VariantResult` |
| `execution/signals.py` | Композитор `entries/short_entries` из spec + plan + Component Registry |
| `execution/exits.py` | Exit-layer: `components.exits` → `exits/short_exits/sl_stop/tp_stop` |
| `execution/results.py` | JSON payload schema v3, `latest.json` / `runs/<run_id>.json` |

## StrategySpec factory (Python)

`spec_instances.py` экспортирует фабрику `make_ema_pullback_strategy_spec(...)` для тестов,
`instance_loader` и ручных сценариев в коде — **не** как альтернативный пользовательский runner.

Числовые research-параметры задаются в `make_ema_pullback_strategy_spec(...)` и
внутри фабрики собираются через builders (`anchor_stack_from_periods(...)`,
`component_stack(...)`, `exits_atr_default(...)`, `trade_sides(...)`,
`pullback_setup(...)`). Если caller не задаёт `variant`, он выводится из фактических
`fast / anchor / slow` периодов; внешний config может передать человекочитаемый
variant label, а semantic uniqueness остаётся за `config_id`:

```text
variant = ema_pullback_fast{fast.period}_anchor{anchor.period}_slow{slow.period}

anchor_stack:
  fast   = EMA close/base/{fast.period}
  anchor = EMA close/base/{anchor.period}
  slow   = EMA close/base/{slow.period}

components:
  direction = ema_anchor_stack_trend
  blockers  = (BlockerRuleSpec(no_blockers),)
  setup     = pullback_to_anchor
  trigger   = ReclaimTriggerSpec()  # component_id reclaim_anchor
  exits     = (
    ExitRuleSpec(atr_stop_loss, exit_kind=stop_loss, ATR distance from factory params),
    ExitRuleSpec(atr_take_profit, exit_kind=take_profit, ATR distance from factory params),
  )
  risk      = no_risk_filter

trade_sides:
  enabled = ("long",)

external config также принимает:
  trade_sides = ["long", "short"]
  trade_sides = {enabled = ["long", "short"]}
  trade_sides = {long = true, short = false}

trade_management:
  profile = reserved  # зарезервировано, не содержит exit_rules
```

`config_id` считается только из canonical serialization `EmaPullbackStrategySpec`
через `strategy_spec_config_id(spec)`. `trade_sides` входит в serialization, поэтому
long-only и long+short specs получают разные `config_id`.

## Side Semantics

Default active spec остаётся long-only. Если factory получает
`enabled_sides=("long", "short")`, текущие component ids исполняются с `side`
context:

```text
long:
  direction = fast > anchor > slow
  setup     = low touches anchor
  trigger   = reclaim_anchor: close crosses above anchor
              touch_anchor: low touches anchor и close закрепилась выше anchor

short:
  direction = fast < anchor < slow
  setup     = high touches anchor
  trigger   = reclaim_anchor: close crosses below anchor
              touch_anchor: high touches anchor и close закрепилась ниже anchor
```

`execution/signals.py` возвращает только entry-серии: `entries` и
`short_entries`. Disabled side заполняется `False`. `execution/exits.py`
отдельно собирает `exits`, `short_exits`, `sl_stop`, `tp_stop`, а
`execution/backtest.py` передаёт все серии в `vectorbt.Portfolio.from_signals(...)`.

Несколько `blockers` объединяются через AND. Несколько сигнальных exit rules
объединяются через OR внутри exit-layer. ATR stop/take остаются такими же
семантическими exit rules и только в execution-слое становятся `sl_stop/tp_stop`.

SL/TP и signal exits конфигурируются только через `components.exits` (`ExitRuleSpec`).
ATR-выходы используют вложенный объект `distance` (как раньше). **Константная дистанция в USD**
(численно те же единицы, что у `close` на рынках вида `*USDT`: сдвиг цены в «долларах движения», не риск от `init_cash`)):
`component_id: constant_usd_stop_loss` / `constant_usd_take_profit` и поле `usd_distance` (строго `> 0`).
Execution-слой по-прежнему переводит это в `sl_stop` / `tp_stop` как отношение к `close`. Для этих компонентов **не** создаются ATR-колонки в `FeaturePlan`.
`trade_management` остаётся reserved-stub и не владеет exit graph.

Пример YAML (`strategy.exits`):

```yaml
exits:
  - instance_id: sl_usd
    component_id: constant_usd_stop_loss
    usd_distance: 500.0
  - instance_id: tp_usd
    component_id: constant_usd_take_profit
    usd_distance: 1200.0
```

## External Params -> Builders -> Spec

Типовой путь для внешнего dict-конфига:

```python
from research.strategies.ema_pullback.component_builders import exits_atr_default
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec

params = {
    "symbol": "BTCUSDT",
    "base_timeframe": "1h",
    "fast_period": 100,
    "anchor_period": 200,
    "slow_period": 1000,
    "atr_period": 14,
    "stop_atr_multiplier": 1.5,
    "take_atr_multiplier": 4.0,
}

spec = make_ema_pullback_strategy_spec(**params)
assert spec.components.exits == exits_atr_default(
    atr_period=14,
    stop_atr_multiplier=1.5,
    take_atr_multiplier=4.0,
)
```

## Live components (Step 12)

Family-local registry (`components/registry.py`) включает, среди прочего:

```text
direction: ema_anchor_stack_trend
setup: pullback_to_anchor
trigger: reclaim_anchor, touch_anchor
blockers: no_blockers, counter_candle_blocker, rsi_extreme_blocker
exits: atr_stop_loss, atr_take_profit, constant_usd_stop_loss, constant_usd_take_profit, rsi_signal_exit
time_stop (future)
risk: no_risk_filter
```

RSI считается в `features/calculations.py` по `FeaturePlan`; компоненты получают
готовую колонку через `rsi_col` (см. `execution/signals.py`).

## Запуск

Из корня репозитория (с research-зависимостями, например `pip install -e ".[research]"`):

```bash
python research/strategies/ema_pullback/run.py --config research/experiments/configs/ema_pullback/ema_pullback_batch_001_step14.yaml
```

Опционально указать SQLite:

```bash
python research/strategies/ema_pullback/run.py --config path/to/experiment.yaml --db-path path/to/custom.sqlite
```

`symbol`, `timeframe`, `execution.*` задаются в experiment-конфиге, а не через CLI.

Успешный прогон печатает summary-строку (`family`, `experiment_id`, `symbol`, `timeframe`,
`candles`, `variants`), затем side-aware stdout comparison table и пути артефактов:

```text
variant | config_id | fast | anchor | slow | long_trades | long_pnl | long_return_pct | long_profit_factor | long_win_rate | short_trades | short_pnl | short_return_pct | short_profit_factor | short_win_rate | total_trades | total_pnl | total_return_pct | total_profit_factor | total_win_rate | total_sharpe | total_max_drawdown | open_trades_long | open_trades_short | open_trades_total
```

Колонки `fast | anchor | slow` — это периоды из `strategy_spec["anchor_stack"]`.
Side-aware метрики разделены на `long`, `short`, `total`; открытые сделки
выведены отдельно как `open_trades_*`. Полный spec (включая tuples компонентов,
RSI rules и distance exits) лежит только в JSON.

## JSON-отчёт

Прогон пишет:

- `research/results/latest.json` — последний прогон (перезаписывается)
- `research/results/runs/<run_id>.json` — тот же payload, имя по `run_id`

Top-level payload содержит `report_schema_version: 3`. Variant payload содержит:

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

Top-level также содержит `run_id`, `created_at`, `candles`, `data_range`,
`variants_count`, `variants`. При запуске через external config дополнительно
появляется `batch_metadata` с `experiment_id`, `source_file`, `entries`,
`validation_phase_status` и aggregate counters.

`metrics` имеет side-aware форму:

```text
metrics.long
metrics.short
metrics.total
metrics.open_trades
```

При успехе `run.py` печатает пути `results_artifact=` и `run_artifact=`, затем
`status=ok`.
