# Research Stage 9 — JSON-отчёт запуска

## Цель

После запуска `research/strategies/ema_pullback/run.py` сохранять результат не только в stdout, но и в JSON-файл.

JSON нужен для будущего frontend/dashboard, сравнения запусков и component grid.

## Что делаем

После каждого запуска runner создаёт:

```text
research/results/latest.json
research/results/runs/<run_id>.json
```

`latest.json` — последний запуск.  
`runs/<run_id>.json` — история запусков.

## Что хранить в JSON

На уровне запуска:

```text
run_id
created_at
family
symbol
timeframe
candles
data_range
variants
```

На уровне каждого variant:

```text
variant
config_id
feature_profile
components
trade_management_profile
params
metrics
trade_records
```

Минимальные metrics:

```text
trades
sharpe
profit_factor
max_drawdown
```

## Сделки

В JSON сохраняем не свечи, а сделки.

Свечи потом frontend/API будет получать отдельно из Data Engine.

Для каждой сделки сохраняем минимум:

```text
trade_id
direction
status
entry_time_ms
exit_time_ms
entry_price
exit_price
pnl
return_pct
exit_reason
```

Если причину выхода пока нельзя надёжно определить, пишем:

```text
exit_reason = "unknown"
```

## Где писать код

Добавить маленький модуль:

```text
research/strategies/ema_pullback/results.py
```

Его задача:

```text
собрать payload
привести numpy/pandas значения к JSON-safe типам
записать latest.json
записать runs/<run_id>.json
```

`run.py` остаётся runner-ом: запускает backtest, печатает таблицу, вызывает writer результата.

## Git

Сгенерированные JSON-файлы не коммитим.

Добавить в `.gitignore`:

```text
research/results/*.json
research/results/runs/*.json
```

При необходимости оставить `.gitkeep`.

## Что не делаем

```text
frontend
API
database
grid
optimizer
HTML/CSV/Parquet отчёты
сохранение всех свечей в JSON
графики
data_engine changes
```

## Acceptance

Stage 9 готов, если:

```text
python -m pytest -q
python research/strategies/ema_pullback/run.py
python research/ema_smoke.py
git diff --stat data_engine/
```

И после запуска есть:

```text
research/results/latest.json
research/results/runs/<run_id>.json
```

JSON валидный, содержит variants, metrics и trade_records.

`data_engine/` не изменён.
