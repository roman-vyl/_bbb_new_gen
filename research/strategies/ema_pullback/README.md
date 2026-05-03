# ema_pullback

Исследовательская strategy family для EMA pullback после Step 11.

Единственная semantic-модель стратегии — `EmaPullbackStrategySpec`. Runtime-конфиг
содержит только технические настройки запуска (`ExecutionConfig`): `family`, `symbol`,
`timeframe`, `db_path`, `init_cash`, `fees`, `slippage`.

Активный pipeline:

```text
EmaPullbackStrategySpec
→ FeaturePlan
→ calculated features
→ Component Registry
→ direction / blockers / setup / trigger / exits / risk
→ long/short signals composer
→ trade management
→ vectorbt
→ JSON report
```

Текущий active spec создаётся через `default_ema_pullback_strategy_spec(...)`
и выбирается runner-ом через `active_strategy_specs(...)`.

`variant` — это identity собранного `StrategySpec`. Имя генерируется из
фактических периодов `anchor_stack`, а не хранится отдельным ручным литералом:

```text
ema_pullback_fast{fast.period}_anchor{anchor.period}_slow{slow.period}
```

## Структура каталога

| Путь | Назначение |
|------|------------|
| `config.py` | Runtime-only `ExecutionConfig` и значения по умолчанию для CLI |
| `spec.py` | Dataclass-контракты `EmaPullbackStrategySpec` и вложенных spec-частей |
| `spec_instances.py` | Factory текущего active spec и `active_strategy_specs(...)` |
| `run.py` | Тонкая CLI-точка входа для active StrategySpec runner |
| `features/plan.py` | `FeaturePlan` из `EmaPullbackStrategySpec` без расчёта данных |
| `features/calculations.py` | Расчёт только features, объявленных в `FeaturePlan` |
| `components/*.py` | Ступени пайплайна + `registry.py` для новых role ids |
| `execution/data_loader.py` | Загрузка DB candles в `LoadedCandles` (`ohlcv` + metadata диапазона) |
| `execution/backtest.py` | Backend `run_strategy_spec(...)` через vectorbt |
| `execution/report_table.py` | Stdout comparison table с `fast / anchor / slow` |
| `execution/runner.py` | Orchestration: active specs → backtest → stdout table → JSON artifact |
| `execution/result_models.py` | Dataclass-контракты `LoadedCandles`, `VariantMetrics`, `VariantResult` |
| `execution/signals.py` | Композитор `entries/exits/short_entries/short_exits` из spec + plan + Component Registry |
| `execution/trade_management.py` | SL/TP kwargs из готовых distance columns |
| `execution/results.py` | JSON payload schema v2, `latest.json` / `runs/<run_id>.json` |

## Active StrategySpec

`spec_instances.py` объявляет один active spec через нейтральную default-фабрику.
Числовые research-параметры задаются в `make_ema_pullback_strategy_spec(...)`,
а `variant` всегда выводится из фактических `fast / anchor / slow` периодов:

```text
variant = ema_pullback_fast{fast.period}_anchor{anchor.period}_slow{slow.period}

anchor_stack:
  fast   = EMA close/base/{fast.period}
  anchor = EMA close/base/{anchor.period}
  slow   = EMA close/base/{slow.period}

components:
  direction = ema_anchor_stack_bullish
  blockers  = no_blockers
  setup     = pullback_to_anchor
  trigger   = reclaim_anchor
  exits     = no_signal_exit
  risk      = no_risk_filter

trade_sides:
  enabled = ("long",)

trade_management:
  stop_loss_by_distance   = ATR distance from factory params
  take_profit_by_distance = ATR distance from factory params
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
  trigger   = close crosses above anchor

short:
  direction = fast < anchor < slow
  setup     = high touches anchor
  trigger   = close crosses below anchor
```

`execution/signals.py` возвращает `PortfolioSignals` с четырьмя сериями:
`entries`, `exits`, `short_entries`, `short_exits`. Disabled side заполняется
`False`, а `execution/backtest.py` передаёт short-серии в
`vectorbt.Portfolio.from_signals(...)`.

## Запуск

Из корня репозитория (с research-зависимостями, например `pip install -e ".[research]"`):

```bash
python research/strategies/ema_pullback/run.py
```

Флаги CLI задают только runtime-настройки: `--symbol`, `--tf`, `--db-path`,
`--init-cash`, `--fees`, `--slippage`. Они не меняют semantic strategy spec.

Smoke entrypoint использует тот же active StrategySpec runner:

```bash
python research/ema_smoke.py
```

Успешный `run.py` печатает одну строку active variant и stdout table:

```text
variant | config_id | fast | anchor | slow | trades | sharpe | profit_factor | max_drawdown
```

## JSON-отчёт

Прогон пишет:

- `research/results/latest.json` — последний прогон (перезаписывается)
- `research/results/runs/<run_id>.json` — тот же payload, имя по `run_id`

Top-level payload содержит `report_schema_version: 2`. Variant payload содержит:

```text
variant
config_id
symbol
timeframe
strategy_spec
metrics
trade_records
```

При успехе `run.py` печатает пути `results_artifact=` и `run_artifact=`, затем
`status=ok`.
