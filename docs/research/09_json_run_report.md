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

После Step 16 ([`16_exit_reason_attribution_plan.md`](16_exit_reason_attribution_plan.md)) для закрытых сделок ожидаются машиночитаемые строки с префиксом и `instance_id` правила из spec, например:

```text
stop_loss:<instance_id>
take_profit:<instance_id>
signal:<instance_id>
```

Для открытых сделок (выхода ещё нет): `exit_reason = "open"`. Если контекст атрибуции недоступен или режим не поддержан — по-прежнему `unknown`. Приоритет отчёта согласован с vectorbt: стоп важнее boolean signal exit на том же баре; внутри стопов — сначала stop loss, затем take profit (см. план Step 16).

## Schema v4 (report diagnostics)

Новые запуски ema_pullback пишут `report_schema_version: 4`. Исторические артефакты v3 остаются читаемыми без новых полей.

Дополнительные поля **закрытой** сделки (`status == "closed"`):

```text
entry_profile              # aligned | countertrend | neutral — lock at entry
entry_context_state        # up | down | neutral | unknown
active_exit_profile        # locked trade profile for position lifetime
exit_group                   # always_on | profile | null
exit_profile                 # winning exit rule bucket | null (not active_exit_profile)
exit_component_id            # string | null
exit_instance_id             # string | null
exit_kind                    # string | null
gross_pnl
fees_paid
gross_return_pct             # before fees; return_pct remains net
hold_bars                    # exit_idx - entry_idx + 1
hold_minutes                 # hold_bars * base_timeframe_minutes
```

`variant.metrics` (только из closed `trade_records`):

```text
profile_breakdown            # aligned | countertrend | neutral buckets
exit_reason_breakdown        # keyed by full exit_reason
fee_diagnostics              # total_fees_paid, gross_pnl, net_pnl, fees_rate, ...
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
