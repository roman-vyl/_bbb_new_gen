# ema_pullback

Исследовательская strategy family для EMA pullback после Step 11 и Step 12.

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
→ entry signals composer
→ execution exit-layer
→ vectorbt
→ JSON report
```

Текущий active spec создаётся через `default_ema_pullback_strategy_spec(...)`
и выбирается runner-ом через `active_strategy_specs(...)`.

Текущая модель держит все выходы в одном `components.exits`: сигнальные правила
и ATR stop/take описываются одинаково как `ExitRuleSpec`. `signals.py` собирает
только входы, а `execution/exits.py` маппит exit rules в `exits/short_exits` и
`sl_stop/tp_stop`.

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
| `execution/signals.py` | Композитор `entries/short_entries` из spec + plan + Component Registry |
| `execution/exits.py` | Exit-layer: `components.exits` → `exits/short_exits/sl_stop/tp_stop` |
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

trade_management:
  profile = reserved  # no active SL/TP ownership
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

## Live components (Step 12)

Family-local registry (`components/registry.py`) включает, среди прочего:

```text
direction: ema_anchor_stack_bullish
setup: pullback_to_anchor
trigger: reclaim_anchor, touch_anchor
blockers: no_blockers, counter_candle_blocker, rsi_extreme_blocker
exits: atr_stop_loss, atr_take_profit, rsi_signal_exit
future exits: fixed_stop_loss, fixed_take_profit, time_stop
risk: no_risk_filter
```

RSI считается в `features/calculations.py` по `FeaturePlan`; компоненты получают
готовую колонку через `rsi_col` (см. `execution/signals.py`).

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

Успешный `run.py` печатает summary-строку (`family`, `symbol`, `timeframe`,
`candles`, `variants`), затем stdout comparison table и пути артефактов:

```text
variant | config_id | fast | anchor | slow | trades | sharpe | profit_factor | max_drawdown
```

Колонки `fast | anchor | slow` — это периоды из `strategy_spec["anchor_stack"]`
в stdout-таблице; полный spec (включая tuples компонентов и RSI rules) лежит
только в JSON.

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

Top-level также содержит `run_id`, `created_at`, `candles`, `data_range`,
`variants_count`, `variants`.

При успехе `run.py` печатает пути `results_artifact=` и `run_artifact=`, затем
`status=ok`.
