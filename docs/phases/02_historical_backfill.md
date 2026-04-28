# Phase 2 — Historical Backfill (детальное ТЗ)

> Это детальное ТЗ для Phase 2. Scope ограничен исключительно исторической загрузкой свечей Bybit через REST и записью в существующую схему БД из Phase 1.
>
> Связанные документы:
> - `docs/00_master_plan.md` — мастер-план, ограничения по фазам, DECIDED/OPEN/DEFERRED.
> - `docs/phases/01_foundation.md` — завершённый фундамент, от которого стартует эта фаза.

---

## 1. Цель фазы

Команда `python -m data_engine backfill --symbol BTCUSDT --tf 1h` загружает в SQLite всю доступную историю Bybit от реального `launchTime` до последней полностью закрытой свечи выбранного таймфрейма.

Повторный запуск на тех же аргументах идемпотентен: дубликаты не появляются, команда завершается предсказуемо, итоговый статус считается по фактическому количеству строк в окне.

Прикладной смысл: одна команда даёт полный исторический ряд одной пары и одного TF без ручного ввода дат.

---

## 2. Scope и жёсткие ограничения

### 2.1 Что входит в Phase 2

- Исторический backfill свечей через Bybit REST.
- Расчёт временных окон и шага TF.
- Запись свечей в `candles` через upsert.
- Кеширование `launchTime` в `meta`.
- Naive completion check по counts (без DIM-алгоритмов).

### 2.2 Что не входит в Phase 2

- DIM/gaps/quarantine logic.
- Realtime/WS.
- FastAPI/service API.
- Scheduler.
- Indicators и их контракты.
- Parquet/export.

### 2.3 Рыночное ограничение Bybit

- В Phase 2 поддерживается только рынок Bybit `linear`.
- `category = "linear"` фиксируется как внутренняя константа в REST-фетчере и resolver-е.
- CLI не принимает `--category`.
- Spot/inverse/multi-category — out of scope.

---

## 3. Зависимости

### 3.1 Входные зависимости

- Обязательная завершённая Phase 1 (`phase-1-done`).

### 3.2 Runtime зависимости, добавляемые в этой фазе

- `pybit`
- `tenacity`

### 3.3 Запрещённые преждевременные зависимости

Нельзя добавлять зависимости будущих фаз: `pandas`, `numpy`, `vectorbt`, `fastapi`, `apscheduler`, `pyarrow`, любые indicator-библиотеки.

---

## Multi-symbol / multi-timeframe readiness

Phase 2 реализуется как generic-код по `symbol` и `tf`.

Acceptance этой фазы ограничен:

- `symbol: BTCUSDT`
- `tf: 1h`
- `market: bybit.linear`

Но в коде запрещено хардкодить `BTCUSDT` или `1h` вне тестов, README и manual smoke.

Требования:

- CLI принимает `--symbol` и `--tf`.
- `Candle.symbol` и `Candle.timeframe` сохраняются в БД как переданы.
- `Db.upsert`, `range_get`, `max_open_time_ms` всегда фильтруют по `symbol + timeframe`.
- `time_grid` работает по TF map, а не только по `1h`.
- Completion check считается только для переданных `symbol + tf`.
- `meta.launch_time_ms` в Phase 2 остаётся symbol-level.

Out of scope:

- batch backfill нескольких symbols/TF одной командой;
- config со списком symbols/TF;
- parallel backfill;
- multi-symbol orchestration;
- scheduler.

---

## 4. Deliverable

### 4.1 Команда

```bash
python -m data_engine backfill --symbol BTCUSDT --tf 1h
```

### 4.2 Минимальный формат итогового вывода

```text
symbol: BTCUSDT
timeframe: 1h
market: bybit.linear
launch_time_ms: <int>
from_ms: <int>
to_ms: <int>
fetched_rows: <int>
written_rows: <int>
expected_count: <int>
actual_count: <int>
status: ok|incomplete|error
```

### 4.3 Семантика итогового статуса

- `status: ok` — backfill cycle завершился штатно и final `actual_count == expected_count` по full historical `check_window`.
- `status: incomplete` — пайплайн backfill завершился штатно, но финальный `actual_count != expected_count`.
- `status: error` — пайплайн не смог корректно завершить цикл загрузки (например, пустой ответ fetcher в ожидаемом окне, неустранимая сетевая ошибка, неконсистентная сетка времени).

Важно: в этой фазе не выполняются repair/gap list/quarantine.

---

## 5. Allowed files (что разрешено создать/изменить)

### 5.1 Разрешённые новые файлы

```text
data_engine/contracts/__init__.py
data_engine/contracts/candle.py
data_engine/contracts/time_window.py
data_engine/contracts/fetch_request.py

data_engine/fetcher/__init__.py
data_engine/fetcher/base.py
data_engine/fetcher/bybit_rest.py
data_engine/fetcher/depth_resolver.py

data_engine/engine/__init__.py
data_engine/engine/time_grid.py

tests/test_time_grid.py
tests/test_db_backfill_store.py
tests/test_depth_resolver.py
tests/test_fetcher_bybit_rest.py
tests/test_backfill_cli.py
tests/test_phase2_boundaries.py
```

### 5.2 Разрешённые изменения существующих файлов

- `data_engine/store/db.py`
- `data_engine/store/__init__.py`
- `data_engine/service/cli.py`
- `data_engine/__main__.py`
- `pyproject.toml`
- `README.md`

---

## 6. Forbidden files и forbidden layers

В Phase 2 запрещено создавать или реализовывать:

- `data_engine/engine/gaps.py`
- `data_engine/engine/dim.py`
- `data_engine/indicators/**`
- `data_engine/realtime/**`
- `data_engine/adapters/**`
- `data_engine/service/api.py`
- `data_engine/service/scheduler.py`

Также запрещено добавлять:

- WS-клиенты и любые realtime-процессы.
- FastAPI endpoints.
- Планировщик задач.
- Parquet/export-код.
- Indicator interfaces/registry/adapters.

---

## 7. Неизменяемые ограничения по схеме (DDL guardrail)

- DDL из Phase 1 (`candles`, `schema_meta`, `meta`, `quarantine`) не меняется в Phase 2.
- Любые изменения схемы — только отдельным явным решением вне этого ТЗ.
- В рамках backfill нельзя добавлять колонки в `candles` для техданных загрузки (`retry_count`, `source` и т.д.).

---

## 8. Контракты модулей

### 8.1 `contracts`

#### `Candle` (frozen)

Поля:
- `symbol: str`
- `timeframe: str`
- `open_time_ms: int`
- `open: float`
- `high: float`
- `low: float`
- `close: float`
- `volume: float`

#### `TimeWindow` (frozen)

- `start_ms: int`
- `end_ms: int`
- Инвариант: `start_ms < end_ms`
- Семантика интервала: полуоткрытый `[start_ms, end_ms)`

#### `FetchRequest`

- `symbol: str`
- `timeframe: str`
- `window: TimeWindow`

### 8.2 `fetcher/base.py`

`IFetcher` Protocol:

- `fetch_candles(request: FetchRequest) -> list[Candle]`

### 8.3 `fetcher/bybit_rest.py`

- Реализация `IFetcher` только через REST.
- Работает только с `category="linear"`.
- `pybit` импортируется только в этом модуле:
  - `from pybit.unified_trading import HTTP`
  - клиент создаётся как `HTTP(testnet=False)`.
- `api_key`/`api_secret` в Phase 2 не используются, потому что нужные endpoints публичные.
- Использует `tenacity` retry policy.
- Возвращает свечи строго в порядке `open_time_ms ASC` (явная сортировка перед возвратом).
- Не содержит DIM/gap/quarantine logic.

### 8.4 `fetcher/depth_resolver.py`

`resolve_launch_time_ms(symbol: str) -> int`:

1. Пробует взять `launch_time_ms` из `meta`.
2. Если значения нет — получает `launchTime` через Bybit HTTP helper из `bybit_rest.py`, сохраняет в `meta`.
3. Возвращает `launch_time_ms`.

`depth_resolver.py` не импортирует `pybit` и не является HTTP-слоем.
Его ответственность — cache orchestration вокруг `Db.get_launch_time_ms` / `Db.set_launch_time_ms`.
Физическое общение с Bybit, включая `HTTP.get_instruments_info`, остаётся в `bybit_rest.py`.

### 8.5 Bybit API contract

#### Свечи: `HTTP.get_kline`

`BybitREST.fetch_candles()` использует `HTTP.get_kline` с параметрами:

- `category="linear"`
- `symbol=<symbol>`
- `interval=<mapped interval>`
- `start=<window.start_ms>`
- `end=<window.end_ms - 1>`
- `limit=<BYBIT_KLINE_LIMIT>`

Явная константа Phase 2:

- `BYBIT_KLINE_LIMIT = 200`

Один запрос не должен покрывать весь диапазон от `launchTime` до `now`.
Backfill обязан идти чанками не больше `BYBIT_KLINE_LIMIT` свечей на request window.

#### Mapping internal TF → Bybit interval

- `"1m" -> "1"`
- `"3m" -> "3"`
- `"5m" -> "5"`
- `"15m" -> "15"`
- `"30m" -> "30"`
- `"1h" -> "60"`
- `"2h" -> "120"`
- `"4h" -> "240"`
- `"6h" -> "360"`
- `"12h" -> "720"`
- `"1d" -> "D"`
- `"1w" -> "W"`

#### Ответ `get_kline`

Ответ читается из `result.list`.
Каждая строка:

```text
[startTime, open, high, low, close, volume, turnover]
```

`startTime` и числовые значения приходят строками.
Mapping в `Candle`:

- `open_time_ms = int(row[0])`
- `open = float(row[1])`
- `high = float(row[2])`
- `low = float(row[3])`
- `close = float(row[4])`
- `volume = float(row[5])`
- `turnover` игнорируется в Phase 2

Перед возвратом `BybitREST.fetch_candles()`:

- локально фильтрует только `window.start_ms <= open_time_ms < window.end_ms`;
- сортирует результат по `open_time_ms ASC`;
- возвращает `list[Candle]`.

#### `launchTime`: `HTTP.get_instruments_info`

`bybit_rest.py` предоставляет helper для получения `launchTime`, который использует `HTTP.get_instruments_info` с параметрами:

- `category="linear"`
- `symbol=<symbol>`

Значение берётся как:

- `int(result.list[0].launchTime)`

Возвращённое значение затем кэшируется через `Db.set_launch_time_ms(symbol, ts_ms)`.
Кэширование выполняет `depth_resolver`; helper из `bybit_rest.py` только ходит в Bybit и парсит ответ.

### 8.6 `engine/time_grid.py`

Обязательные функции:

- `tf_ms(tf: str) -> int`
- `align_to_grid(ts_ms: int, tf: str) -> int`
- `ceil_to_grid(ts_ms: int, tf: str) -> int`
- `next_close_ms(ts_ms: int, tf: str) -> int`
- `last_closed_open_time_ms(now_ms: int, tf: str) -> int`

Правило верхней границы:

- `to_ms = last_closed_open_time_ms(now_ms, tf)`
- Для внутреннего окна загрузки: `window.end_ms = to_ms + tf_ms(tf)`

Правило нижней границы исторического окна:

- `candidate_from_ms = ceil_to_grid(launch_time_ms, tf)`
- Это старт поиска первой доступной свечи и исключение попыток запрашивать свечу до фактического старта инструмента.
- Для final completion check старт берётся от `effective_from_ms`, а не от `candidate_from_ms`:
  - первая реально найденная свеча при пустой БД;
  - `min_open_time_ms(symbol, tf)` при resume.

### 8.7 `store/db.py` (расширение контракта)

Добавляются методы:

- `upsert(rows: list[Candle]) -> int`
- `range_get(symbol: str, tf: str, window: TimeWindow) -> list[Candle]`
- `max_open_time_ms(symbol: str, tf: str) -> int | None`
- `set_launch_time_ms(symbol: str, ts_ms: int) -> None`
- `get_launch_time_ms(symbol: str) -> int | None`

Требования:

- `upsert` опирается на PK `candles(symbol, timeframe, open_time_ms)`.
- Все candle-запросы фильтруют по `symbol + timeframe`.
- `range_get` использует фильтр `[start_ms, end_ms)`:
  - `open_time_ms >= start_ms AND open_time_ms < end_ms`
- `range_get` возвращает строки в `open_time_ms ASC`.
- `max_open_time_ms` фильтрует по `symbol + timeframe`.
- Completion check считает `actual_count` только для переданных `symbol + timeframe`.

### 8.8 `service/cli.py::backfill`

Пайплайн:

1. Валидация `symbol` и `tf`.
2. Проверка `db_path` до открытия:
   - если файл не существовал до запуска — после открытия можно вызвать `apply_ddl()`;
   - если файл уже существовал — `apply_ddl()` автоматически не вызывается.
3. После открытия БД вызвать `health()`.
4. Если `contract != "ok"`:
   - backfill останавливается;
   - выставляется `status: error`;
   - печатается понятная диагностика;
   - повреждённая существующая БД не чинится молча.
5. Получение `launch_time_ms` через resolver.
6. Определение стартовой точки текущего fetch-run:
   - если `max_open_time_ms` есть, старт = `max_open_time_ms + tf_ms(tf)`;
   - иначе старт = `ceil_to_grid(launch_time_ms, tf)`.
   - `effective_from_ms` для отчёта и completion check берётся из минимальной свечи в БД по `symbol+tf` (или из первой реально полученной свечи, если до запуска БД была пустой).
7. Расчёт верхней границы как последней закрытой свечи (`to_ms`).
8. Цикл `fetch -> upsert` по временным окнам до `to_ms`, чанками не больше `BYBIT_KLINE_LIMIT` свечей.
9. Naive completion check (раздел 9) от `effective_from_ms`.
10. Печать финального отчёта.

---

## 9. Naive completion check (единственный check в Phase 2)

Phase 2 выполняет только naive completion check:

- считает `expected_count` по временному окну и `tf`;
- считает `actual_count` в БД;
- если counts совпали — `status: ok`;
- если нет — `status: incomplete`;
- `repair`/`gap list`/`quarantine` не выполняются.

Окно финального completion check всегда строится от фактического начала ряда (`effective_from_ms`), а не от старта текущего fetch-run:

- `check_window.start_ms = effective_from_ms`
- `check_window.end_ms = to_ms + tf_ms(tf)`

Формула:

- `duration_ms = check_window.end_ms - check_window.start_ms`
- `assert duration_ms % tf_ms(tf) == 0`
- `expected_count = duration_ms // tf_ms(tf)`  
  (`expected_count` всегда целочисленный).
- `actual_count` считается по БД в том же `check_window` (`range_get`/COUNT, полуоткрытый интервал `[start_ms, end_ms)`).

---

## 10. Поведение при ошибках

- Retry применяется только к транзиентным сетевым/API-ошибкам.
- Leading empty chunks до первой найденной свечи допустимы и не считаются ошибкой.
- Если после появления данных в ожидаемом окне fetcher вернул пустой список:
  - backfill останавливается;
  - выставляется `status: error`;
  - печатается диагностическое сообщение;
  - quarantine/repair не запускаются.
- Если до `to_ms` не найдено ни одной свечи:
  - backfill завершается с `status: error`;
  - диагностика: `no candles found in expected range`.
- Бесконечные циклы загрузки запрещены.

---

## 11. Тесты (по именам)

### 11.1 `tests/test_time_grid.py`

- `test_tf_ms_known_values`
- `test_align_to_grid_rounds_down`
- `test_ceil_to_grid_rounds_up`
- `test_next_close_ms`
- `test_last_closed_open_time_ms`

### 11.2 `tests/test_db_backfill_store.py`

- `test_upsert_is_idempotent`
- `test_max_open_time_ms_empty_and_non_empty`
- `test_range_get_uses_half_open_window_and_returns_asc`
- `test_launch_time_meta_roundtrip`

### 11.3 `tests/test_depth_resolver.py`

- `test_resolver_reads_cached_launch_time`
- `test_resolver_fetches_and_caches_when_missing`
- `test_resolver_uses_linear_category`
- `test_resolver_parses_launch_time_from_instruments_info`

### 11.4 `tests/test_fetcher_bybit_rest.py`

- `test_fetch_candles_maps_payload_to_candle`
- `test_fetch_candles_returns_asc_order`
- `test_fetcher_retries_on_transient_errors`
- `test_fetcher_uses_linear_category_constant`
- `test_fetcher_maps_1h_to_bybit_interval_60`
- `test_fetcher_passes_end_as_window_end_minus_one`
- `test_fetcher_uses_explicit_limit`
- `test_fetcher_filters_rows_to_requested_window`

### 11.5 `tests/test_backfill_cli.py`

- `test_backfill_from_empty_db`
- `test_backfill_existing_broken_db_is_not_auto_fixed`
- `test_backfill_resume_from_last_open_time`
- `test_backfill_idempotent_second_run`
- `test_backfill_uses_full_history_window_for_completion_check`
- `test_backfill_reports_incomplete_when_counts_mismatch`
- `test_backfill_sets_error_on_empty_fetch_chunk`
- `test_backfill_chunks_fetch_windows`

### 11.6 `tests/test_phase2_boundaries.py`

- `test_forbidden_paths_absent_for_phase2`
- `test_forbidden_dependencies_absent_for_phase2`

---

## 12. Test strategy и стабильность прогона

- Автотесты (`pytest`) не зависят от реальной сети.
- В тестах `BybitREST` используется fake client injection, а не реальный `HTTP`.
- В тестах CLI используется fake fetcher/resolver либо monkeypatch фабрик в `service.cli`.
- Retry-тесты не должны реально ждать: используется fake/no-op wait policy или monkeypatch retry settings.
- Live Bybit smoke выполняется только вручную как acceptance, но не как обязательный unit/integration test.

---

## 13. Acceptance checklist

Все пункты обязательны:

1. Команда `python -m data_engine backfill --symbol BTCUSDT --tf 1h` завершается предсказуемо и печатает итоговый отчёт.
2. `market: bybit.linear` отражён в поведении и коде (category зафиксирован как `linear`).
3. Верхняя граница загрузки — только последняя закрытая свеча выбранного TF.
4. Повторный запуск команды не создаёт дубликатов.
5. Resume после частичной загрузки начинается с `max_open_time_ms + tf_ms(tf)`.
6. Используется только naive completion check по `expected_count` и `actual_count`.
7. Completion check считается по полному фактическому окну: от `effective_from_ms` до `to_ms + tf_ms(tf)`.
8. При несовпадении counts после штатного завершения выставляется `status: incomplete`; repair/gap list/quarantine не запускаются.
9. Пустой fetch chunk в ожидаемом окне завершает команду без бесконечного цикла, с диагностикой и `status: error`.
10. `range_get` использует полуоткрытый интервал `[start_ms, end_ms)` и возвращает ASC.
11. `BybitREST.fetch_candles()` возвращает `list[Candle]` в ASC.
12. Существующая повреждённая БД не чинится backfill-командой автоматически: `contract != ok` останавливает команду с `status: error`.
13. REST-запросы идут чанками не больше `BYBIT_KLINE_LIMIT` свечей и используют `end = window.end_ms - 1`.
14. DDL из Phase 1 не изменён.
15. В `pyproject.toml` добавлены только `pybit` и `tenacity`, без зависимостей будущих фаз.
16. Запрещённые пути/слои из раздела 6 отсутствуют и покрыты boundary-тестом.
17. Все тесты Phase 1 и Phase 2 проходят (`pytest -q`).

---

## 14. Phase 2 binding defaults

### 14.1 Retry policy

Обязательные значения для Phase 2:

- `stop_after_attempt(5)`
- `wait_exponential(min=1, max=16)`
- retry только для сетевых ошибок, `429`, и `5xx`.

### 14.2 TF scope

Обязательные значения для Phase 2:

- обязательный acceptance на `BTCUSDT 1h`;
- `1m/5m/1d` — только дополнительный manual smoke, не блокирующий закрытие фазы.

### 14.3 Resume behavior

Обязательные значения для Phase 2:

- resume только от `max_open_time_ms + tf_ms(tf)`;
- отдельные checkpoint-файлы не вводятся.

---

## 15. Out of scope (явно)

- Любая логика поиска/ремонта дыр.
- Quarantine workflow и reasoned gap reports.
- Любая realtime-логика.
- Любой API/scheduler/export слой.
- Любой indicator framework.
- Любая миграция/изменение DDL без отдельного решения.

