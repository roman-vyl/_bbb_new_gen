# ema_pullback

Исследовательская strategy family: базовый сценарий пересечения EMA fast/slow с явным
конвейером direction → blockers → setup → trigger → exits → risk, ручные варианты
(manual variants) и JSON-артефакты прогона.

## Структура каталога

| Путь | Назначение |
|------|------------|
| `config.py` | Неизменяемый `StrategyConfig`, значения по умолчанию, детерминированный `config_id` |
| `variants.py` | Ручной список `StrategyInstance` для multi-variant прогонов |
| `run.py` | Тонкая CLI-точка входа + переходные compatibility-wrapper |
| `instance.py` | Конфиг + вычисленный `config_id` |
| `features/calculations.py` | OHLCV → колонки EMA / подготовленные ATR-расстояния |
| `features/profile.py` | Локальные для family профили фич и семантические relations |
| `components/*.py` | Ступени пайплайна + `registry.py` (статическая карта компонентов) |
| `execution/data_loader.py` | Загрузка DB candles в `LoadedCandles` (`ohlcv` + metadata диапазона) |
| `execution/backtest.py` | Единый backend прогона одного `StrategyInstance` через vectorbt |
| `execution/report_table.py` | Stdout comparison table для manual variants |
| `execution/runner.py` | Orchestration: variants → backtest → stdout table → JSON artifact |
| `execution/result_models.py` | Dataclass-контракты `LoadedCandles`, `VariantMetrics`, `VariantResult` |
| `execution/signals.py` | Композитор: разрешённые компоненты → серии входа/выхода |
| `execution/trade_management.py` | Профили SL/TP для `Portfolio.from_signals` |
| `execution/results.py` | Полезная нагрузка прогона, `latest.json` / `runs/<run_id>.json` |

## Запуск

Из корня репозитория (с research-зависимостями, например `pip install -e ".[research]"`):

```bash
python research/strategies/ema_pullback/run.py
```

Флаги CLI совпадают с историческим EMA smoke (`--symbol`, `--tf`, `--db-path`, комиссии и т.д.).

## JSON-отчёт

Прогоны с несколькими вариантами пишут:

- `research/results/latest.json` — последний прогон (перезаписывается)
- `research/results/runs/<run_id>.json` — тот же payload, имя по `run_id`

При успехе `run.py` печатает пути `results_artifact=` и `run_artifact=`.
