# Step 16 — exit_reason Attribution (Research JSON)

Связанный мастер-план: [`strategy_constructor_master_plan.md`](strategy_constructor_master_plan.md) (Step 16).  
Предшествующий шаг: [`15_ohlc_aware_vectorbt_plan.md`](15_ohlc_aware_vectorbt_plan.md) (Step 15 — тот же OHLC для портфеля и для атрибуции стопов).  
Базовый артефакт сделок: [`09_json_run_report.md`](09_json_run_report.md).

---

## 1. Контекст

В structured research JSON (`research/results/…`) для каждой сделки в `trade_records` есть поле `exit_reason`. Сейчас при нормализации vectorbt → JSON оно часто остаётся плейсхолдером `unknown`.

Параллельно в payload уже есть **агрегированные** counters по exit-компонентам (сколько раз сработал RSI exit, сколько баров «готов» ATR distance и т.д.), но по ним нельзя ответить на вопрос: **эта конкретная сделка** закрылась по SL, по TP или по boolean signal exit.

Причина: на входе `Portfolio.from_signals` boolean-выходы склеиваются через OR, а distance-правила сжимаются в агрегированные `sl_stop` / `tp_stop`; к моменту `extract_trade_records(pf, close)` связь «trade #k → правило X» уже не восстанавливается из одного `pf` без дополнительного контекста.

---

## 2. Цель шага

Сделать `exit_reason` в `trade_records` **персделочно осмысленным** и **согласованным с фактическим порядком исполнения vectorbt**, без поломки backtest и без изменений в `data_engine/`.

Минимальный критерий готовности: по закрытым сделкам аналитик видит отличие SL / TP / signal (и при multi-instance — **какой** `instance_id` правила), а не только `unknown`.

---

## 3. Scope (in)

- Family `ema_pullback`: путь `build_exit_outputs_from_spec` → `Portfolio.from_signals` → `extract_trade_records`.
- Пост-обогащение или замена логики заполнения `exit_reason` при наличии **контекста атрибуции** (серии стопов, per-rule boolean, OHLC, ссылка на порядок правил в spec).
- Юнит-тесты под `optional_vectorbt` на синтетических рядах (SL-only, TP-only, signal-only, приоритет стопа над сигналом на одном баре).
- Краткое обновление [`09_json_run_report.md`](09_json_run_report.md) (формат строки и политика приоритетов).

## 4. Non-goals (out)

- Менять семантику входов/выходов стратегии (только отчётность / классификация уже смоделированного).
- Глобальный framework для всех family до появления второго consumer.
- База результатов, API, frontend.
- Гарантировать атрибуцию при произвольных `adjust_sl_func_nb` / `adjust_tp_func_nb` / trailing без явного расширения плана (см. §8).

---

## 5. Источник истины: порядок vectorbt

В `vectorbt` при `from_signals` с стопами: если на баре сработал стоп, обрабатывается **стоп**, пользовательская `signal_func` **не вызывается** (см. документацию `Portfolio.from_signals`: «Stop signal has priority»).

Внутри симуляции на баре для long-ветки сначала проверяется **stop loss** (`get_stop_price_nb` с `hit_below=True` для long), затем при отсутствии срабатывания — **take profit** (отдельный вызов с соответствующей семантикой). Это задаёт детерминированный порядок **SL перед TP** на одном баре.

Классификация в Step 16 должна **повторять этот порядок**, иначе JSON будет расходиться с реальностью портфеля.

Практический способ совпадения с движком: использовать тот же `get_stop_price_nb` из `vectorbt.portfolio.nb` (или эквивалентную чистую реализацию с идентичными ветвлениями для long/short).

---

## 6. Упрощающее допущение (MVP)

При **дефолтных** `adjust_sl_func_nb` / `adjust_tp_func_nb` и без trailing (`sl_trail` не задан / false) значения `sl_stop` / `tp_stop`, зафиксированные в симуляторе для открытой позиции, берутся из серий **`sl_stop` / `tp_stop` на баре входа сделки** (`entry_idx` в записях `pf.trades.records`), а не «текущего» значения на каждом баре. Это следует из типичного кода инициализации стопов при открытии позиции в `vectorbt.portfolio.nb` и сильно упрощает атрибуцию: не нужен полный state-machine replay по всем барам удержания.

Если позже family начнёт использовать trailing или кастомные adjust-функции, контракт Step 16 либо расширяется (replay), либо для таких режимов явно возвращается `unknown` с опциональным полем причины «unsupported_stop_mode» (решение на реализацию).

---

## 7. OHLC и симуляция

Передача `open` / `high` / `low` в `Portfolio.from_signals` описана в [`15_ohlc_aware_vectorbt_plan.md`](15_ohlc_aware_vectorbt_plan.md). Атрибуция `exit_reason` обязана использовать **те же** OHLC-ряды, что и симуляция портфеля, иначе классификация стопов расходится с фактом сделок.

---

## 8. Контракт поля `exit_reason`

### 8.1 Закрытые сделки

Строка в нижнем регистре, машиночитаемая, стабильно парсится без пробелов.

Предлагаемый формат (одно поле, без обязательного расширения schema version):

```text
sl:<instance_id>
tp:<instance_id>
signal:<instance_id>
unknown
```

- **`sl:` / `tp:`** — выход классифицирован как срабатывание агрегированного стопа соответствующего типа; `instance_id` — правило из `components.exits`, которое на **баре входа** внесло вклад в агрегат (см. §9). При полном равенстве нескольких правил — детерминированный tie-break: **первое в порядке `spec.components.exits`**.
- **`signal:`** — на баре выхода для соответствующей стороны (long vs short) сработало boolean exit; если сработало несколько правил, выбирается **первое в порядке `spec.components.exits`** (фиксированная политика; отражает «кто выиграл объяснимость», не обязательно внутренний порядок OR в vectorbt).
- **`unknown`** — нет контекста атрибуции, неподдерживаемый режим стопов, или внутренняя неконсистентность (например, закрытие без стопа и без True в boolean exit на `exit_idx`).

### 8.2 Открытые сделки

`exit_reason`: `null` (в JSON), так как выхода ещё не было. Тесты артефакта обновить под это поведение.

### 8.3 Версия отчёта

При сохранении только строкового `exit_reason` по смыслу достаточно текущего `report_schema_version`, если потребители уже терпимы к расширению допустимых значений. Если позже добавятся отдельные поля (`exit_kind`, `exit_instance_id`), имеет смысл bump `report_schema_version`.

---

## 9. Привязка SL/TP к `instance_id` при агрегате `min`

В [`research/strategies/ema_pullback/execution/exits.py`](../../research/strategies/ema_pullback/execution/exits.py) для нескольких distance-правил `stop_loss` (аналогично `take_profit`) строится по-баровый минимум / конкатенация с `min(axis=1)` — **тот же** агрегат, что уходит в `Portfolio.from_signals`.

Для подписи сделки:

1. На `entry_idx` взять per-rule серии долей (тот же расчёт «distance / close», что уже используется для портфеля, но **до** объединения в один столбец), в группе `stop_loss` или `take_profit`.
2. Сравнить с агрегированным значением на том же баре (с допуском по float, если нужно).
3. Среди совпавших выбрать правило с минимальным индексом в `spec.components.exits`.

---

## 10. Архитектура кода (предложение)

| Компонент | Назначение |
|-----------|------------|
| Новый модуль, напр. `execution/exit_attribution.py` | Чистые функции: контекст атрибуции, `classify_exit_reason` для одной записи trade + vectorbt helpers. |
| `execution/exits.py` или рядом | Построение `ExitAttributionContext`: per-rule boolean series (long/short), per-rule distance ratios, уже агрегированные `sl_stop`/`tp_stop`, ссылка на порядок правил. Избегать дублирования: переиспользовать разрешённые `(fn, rule)` из существующего `build_exit_outputs_from_spec`. |
| `execution/results.py` | `extract_trade_records(pf, close, *, attribution=None)`; при `None` — прежнее поведение (`unknown` / совместимость тестов). |
| `execution/backtest.py` | Собрать контекст; OHLC в `from_signals` — по [`15_ohlc_aware_vectorbt_plan.md`](15_ohlc_aware_vectorbt_plan.md); вызвать extract с attribution. |

---

## 11. Тестирование

- Существующие тесты без vectorbt / без контекста не должны ломаться.
- Под `@pytest.mark.optional_vectorbt`: минимальные сценарии с синтетическими `close` (+ при внедрении OHLC — с явными high/low), ожидаемые префиксы `sl:` / `tp:` / `signal:`.
- Регрессия: short и long, открытая сделка → `exit_reason is None`.

---

## 12. Acceptance

- `pytest` (включая optional marker при наличии vectorbt) зелёный.
- Прогон family runner / smoke по желанию команды; `data_engine/` не меняется.
- В `trade_records` закрытых сделок доминируют не `unknown`, при типичном конфиге с SL/TP/signal.

---

## 13. Связанные файлы (текущее состояние на момент плана)

- [`research/strategies/ema_pullback/execution/results.py`](../../research/strategies/ema_pullback/execution/results.py) — `extract_trade_records`.
- [`research/strategies/ema_pullback/execution/exits.py`](../../research/strategies/ema_pullback/execution/exits.py) — `build_exit_outputs_from_spec`, агрегация выходов.
- [`research/strategies/ema_pullback/execution/backtest.py`](../../research/strategies/ema_pullback/execution/backtest.py) — вызов vectorbt и extract.
