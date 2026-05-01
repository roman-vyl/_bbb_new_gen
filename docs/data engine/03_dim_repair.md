# Phase 3 — DIM Repair (детальное ТЗ)

> Phase 3 реализует candle-only DIM repair.
> Главный deliverable: `fix_candles(symbol, tf, window, db, fetcher, expected_latest_open_ms=None) -> FixReport`.
> CLI `python -m data_engine fix --symbol BTCUSDT --tf 1h` — только wrapper, который строит historical window и вызывает `fix_candles`.

Связанные документы:

- `docs/00_master_plan.md` — мастер-план, ограничения по фазам, DECIDED/OPEN/DEFERRED.
- `docs/phases/02_historical_backfill.md` — завершённый historical backfill, контракты `Candle`, `TimeWindow`, `FetchRequest`, `IFetcher`, `Db.upsert`, `Db.range_get`.
- `docs/phases/04_research_smoke.md` — следующая фаза, которая опирается на чистый ряд свечей.

---

## 1. Цель фазы

Phase 3 добавляет ремонт свечного окна через одну расширяемую функцию:

```python
fix_candles(symbol, tf, window, db, fetcher, expected_latest_open_ms=None) -> FixReport
```

Функция делает только четыре шага:

1. `preflight` — найти missing candle intervals внутри переданного `window`.
2. `fix` — дозагрузить отсутствующие свечи через `fetcher`.
3. `postflight` — снова проверить gaps, OHLC и freshness.
4. Вернуть `FixReport`.

Ключевой принцип: это функция ремонта окна, а не «исторический режим».

В Phase 3 историчность живёт только в CLI-обёртке:

```bash
python -m data_engine fix --symbol BTCUSDT --tf 1h
```

CLI сам строит full historical window и вызывает `fix_candles`. Будущий realtime watchdog в Phase 6 сможет вызвать ту же функцию на маленьком `missed_window` после reconnect, но Phase 3 не пишет realtime-код.

---

## 2. Scope и жёсткие ограничения

### 2.1 Что входит в Phase 3

- Единственная реализация поиска дыр в свечах: `find_gaps_linear`.
- Candle-only DIM repair для явного `TimeWindow`.
- CLI-команда `fix`, которая строит historical window и вызывает `fix_candles`.
- Read-only OHLC validation/report.
- Ограниченный freshness check.
- Минимальная append-only quarantine-запись для failed fetch/postflight failure.
- Автоматизированные тесты на gaps, DIM, CLI delegation и phase boundaries.

### 2.2 Что не входит в Phase 3

- Индикаторы: расчёт, ремонт, contracts, registry, adapters, storage.
- Realtime/WS, realtime hooks, watchdog, reconnect logic.
- Scheduler, auto-loop, retry queue, background processor.
- FastAPI/API.
- Второй backfill.
- Parquet/export.
- `research/`-скрипты как deliverable этой фазы (они остаются в Phase 4).
- Magic values для отсутствующих свечей.
- `dry-run`, если отдельно не появится новое решение.

### 2.3 Empty DB не является вторым backfill

Если CLI `fix` запускается на пустой БД, это всё ещё DIM repair:

1. CLI строит full historical window.
2. CLI вызывает `fix_candles(symbol, tf, window, db, fetcher, expected_latest_open_ms=...)`.
3. `fix_candles` видит full-window gap.
4. `fix_candles` чинит его тем же механизмом, что и любую другую дыру.

Отдельный backfill pipeline внутри DIM не появляется.

---

## 3. Зависимости

### 3.1 Входные зависимости

- Phase 1: `Settings`, SQLite schema, `Db.health`, таблицы `candles`, `meta`, `quarantine`.
- Phase 2: `Candle`, `TimeWindow`, `FetchRequest`, `IFetcher`, `BybitREST`, `resolve_launch_time_ms`, `time_grid`, `Db.upsert`, `Db.range_get`, `Db.count_candles`, `Db.min_open_time_ms`, `Db.max_open_time_ms`.

### 3.2 Runtime зависимости

Новые runtime dependencies в Phase 3 не добавляются.

### 3.3 Запрещённые преждевременные зависимости

Нельзя добавлять зависимости будущих фаз:

- `pandas`
- `numpy`
- `vectorbt`
- `fastapi`
- `apscheduler`
- `pyarrow`
- любые indicator-библиотеки

Также нельзя добавлять `hypothesis`/property-based dependency без отдельного явного решения. Тесты gaps в Phase 3 пишутся обычным `pytest`.

---

## 4. Архитектурные границы

Разделение ответственностей фиксируется так:

```text
CLI     = собрать зависимости и окно
DIM     = починить переданное окно
fetcher = скачать свечи
Db      = сохранить/прочитать свечи и записать минимальную диагностику
gaps.py = математика дыр
```

Запрещённые направления:

- DIM не импортирует CLI.
- Db не знает про Bybit.
- fetcher не знает про gaps/DIM.
- `find_gaps_linear` не ходит в БД и не вызывает fetcher.
- DIM не рекурсивный.
- DIM не содержит historical-window policy внутри `fix_candles`.

---

## 5. Deliverable

### 5.1 Core API

```python
fix_candles(symbol, tf, window, db, fetcher, expected_latest_open_ms=None) -> FixReport
```

Семантика:

- `symbol` и `tf` явно задают ряд свечей.
- `window` всегда передаётся снаружи.
- `expected_latest_open_ms` передаётся снаружи (или `None`) и определяет, нужен ли freshness check на «последнюю закрытую свечу».
- `db` предоставляет чтение/запись свечей.
- `fetcher` реализует `IFetcher.fetch_candles(FetchRequest) -> list[Candle]`.
- Возврат всегда идёт через `FixReport`.

### 5.2 CLI

```bash
python -m data_engine fix --symbol BTCUSDT --tf 1h
```

Минимальный формат вывода:

```text
symbol: BTCUSDT
timeframe: 1h
from_ms: <int>
to_ms: <int>
gaps_before: <int>
gaps_after: <int>
fetched_rows: <int>
written_rows: <int>
invalid_ohlc_rows: <int>
fresh: true|false
status: ok|incomplete|invalid|error
```

Если есть диагностика, CLI может дополнительно печатать:

```text
diagnostic: <text>
```

### 5.3 Статусы `FixReport`

- `ok` — postflight прошёл: gaps отсутствуют, OHLC валиден, freshness check зелёный для full historical CLI window.
- `incomplete` — DIM завершился без hard error, но после postflight остались gaps или не загружена последняя закрытая свеча.
- `invalid` — gaps закрыты или несущественны для статуса, но найдены невалидные OHLC-строки.
- `error` — не удалось корректно выполнить repair pipeline: ошибка fetcher, ошибка БД, невалидное окно, schema contract не `ok`, unexpected exception.

---

## 6. Разрешённые файлы

### 6.1 Разрешённые новые файлы

```text
data_engine/contracts/gap.py
data_engine/contracts/fix_report.py

data_engine/engine/gaps.py
data_engine/engine/dim.py

tests/test_gaps.py
tests/test_dim_repair.py
tests/test_fix_cli.py
tests/test_phase3_boundaries.py
```

`Gap` и `FixReport` можно разместить иначе, если при реализации окажется чище использовать существующий `contracts/__init__.py`, но они должны оставаться контрактами, а не CLI-деталями.

### 6.2 Разрешённые изменения существующих файлов

- `data_engine/contracts/__init__.py`
- `data_engine/engine/__init__.py`
- `data_engine/store/db.py`
- `data_engine/store/__init__.py`
- `data_engine/service/cli.py`
- `data_engine/__main__.py`, только если это нужно для корректного CLI routing
- `README.md`

### 6.3 Forbidden files и forbidden layers

В Phase 3 запрещено создавать или реализовывать:

- `data_engine/indicators/**`
- `data_engine/realtime/**`
- `data_engine/adapters/**`
- `data_engine/service/api.py`
- `data_engine/service/scheduler.py`

Также запрещено менять DDL schema без отдельного решения. Таблица `quarantine` уже есть в Phase 1 и используется как минимальный append-only diagnostic sink.

---

## 7. Контракты

### 7.1 `Gap`

`Gap` описывает отсутствующий полуоткрытый интервал свечей:

```python
Gap(start_ms: int, end_ms: int)
```

Инварианты:

- `start_ms < end_ms`
- `start_ms` и `end_ms` выровнены по `tf_ms`
- семантика интервала: `[start_ms, end_ms)`
- gap длиной в одну свечу имеет `end_ms = start_ms + tf_ms`

`Gap` не содержит `symbol` и `tf`, потому что это математика окна. `symbol` и `tf` живут в `fix_candles`/`FixReport`.

### 7.2 `FixReport`

Минимальные поля:

```python
FixReport(
    symbol: str,
    timeframe: str,
    window: TimeWindow,
    status: Literal["ok", "incomplete", "invalid", "error"],
    gaps_before: list[Gap],
    gaps_after: list[Gap],
    fetched_rows: int,
    written_rows: int,
    invalid_ohlc_rows: int,
    fresh: bool,
    diagnostics: list[str],
)
```

Допустимо добавить технические поля, если они нужны тестам и CLI-выводу, например `quarantined_records: int`.

Запрещено превращать `FixReport` в storage model или API response будущих фаз. Это локальный отчёт DIM/CLI.

### 7.3 `find_gaps_linear`

```python
find_gaps_linear(timestamps: list[int], step_ms: int, window: TimeWindow) -> list[Gap]
```

Функция чистая:

- не читает БД;
- не пишет БД;
- не вызывает fetcher;
- не знает про `symbol`;
- не знает про Bybit;
- не импортирует CLI.

Семантика:

- expected grid строится внутри `[window.start_ms, window.end_ms)`;
- actual timestamps сравниваются с expected grid;
- timestamp вне окна игнорируется или отбрасывается до сравнения;
- duplicate timestamps не создают ложных gaps;
- unsorted timestamps допустимы, функция сама нормализует порядок;
- empty timestamps дают один full-window gap `[window.start_ms, window.end_ms)`;
- complete grid даёт `[]`;
- поддерживаются leading, middle, trailing и multiple gaps;
- смежные missing timestamps схлопываются в один `Gap`.

Пример:

```text
window=[0, 5000), step=1000
actual=[0, 3000, 4000]
expected=[0, 1000, 2000, 3000, 4000]
gaps=[Gap(1000, 3000)]
```

### 7.4 `validate_window_aligned`

Окно repair должно быть выровнено по `step_ms`:

- `window.start_ms % step_ms == 0`
- `window.end_ms % step_ms == 0`
- `window.start_ms < window.end_ms`

Если окно невалидно, `fix_candles` возвращает `status="error"` или бросает контролируемое исключение, которое CLI превращает в `status: error`. Конкретная форма выбирается при реализации, но поведение CLI должно быть стабильным.

### 7.5 OHLC validation

OHLC validation в Phase 3 только read-only validation/report.

Проверка:

- `open > 0`
- `high > 0`
- `low > 0`
- `close > 0`
- `volume >= 0`
- `high >= low`
- `high >= open`
- `high >= close`
- `low <= open`
- `low <= close`

DIM не исправляет значения свечей. Если найдены invalid OHLC rows:

- они остаются в `candles`;
- `FixReport.invalid_ohlc_rows > 0`;
- итоговый статус становится `invalid`, если нет более жёсткого `error`.

### 7.6 Freshness check (через явный параметр)

Freshness в Phase 3 ограничен.

`fix_candles` не определяет «historical mode» самостоятельно. Вместо этого используется явный параметр:

```python
expected_latest_open_ms: int | None
```

- CLI full historical fix передаёт `last_closed_open_time_ms(now_ms, tf)`.
- Произвольный `window` и будущий realtime path могут передать `None`.

Если `expected_latest_open_ms is not None`, postflight проверяет наличие свечи с этим `open_time_ms` внутри repaired `window` (postflight range), а не по глобальному максимуму вне окна.

```python
exists candle where (
    candle.symbol == symbol
    and candle.timeframe == tf
    and candle.open_time_ms == expected_latest_open_ms
    and window.start_ms <= candle.open_time_ms < window.end_ms
)
```

Если последняя закрытая свеча отсутствует, report получает:

- `fresh = false`
- `status = "incomplete"`, если нет `error`/`invalid`

Если `expected_latest_open_ms is None`, сложные stale thresholds не вводятся. В Phase 3 достаточно проверить целостность самого окна; политика «слишком старо/не слишком старо» не живёт внутри DIM.

### 7.7 Quarantine

Quarantine в Phase 3 минимальный:

- append-only diagnostic record;
- используется для failed fetch и postflight failure;
- хранит `symbol`, `timeframe`, `start_ms`, `end_ms`, `reason`, JSON/text `payload`, `created_at_ms`;
- опирается на существующую таблицу `quarantine`.
- разрешён минимальный метод `Db.put_quarantine(...)` как append-only helper для диагностики.

Не делать:

- `QuarantineStore` как отдельный слой;
- quarantine workflow;
- scheduler;
- processor;
- retry queue;
- отдельный lifecycle/status quarantine records.

Если запись в quarantine сама падает, это не должно маскировать исходную ошибку в report diagnostics.

---

## 8. Алгоритм `fix_candles`

### 8.1 Preflight

1. Вычислить `step_ms = tf_ms(tf)`.
2. Проверить alignment `window`.
3. Прочитать свечи через `db.range_get(symbol, tf, window)`.
4. Взять `open_time_ms` из полученных свечей.
5. Найти `gaps_before = find_gaps_linear(timestamps, step_ms, window)`.

Если `gaps_before == []`, fix-шаг ничего не скачивает, но postflight всё равно выполняется.

### 8.2 Fix

Для каждого `Gap` из `gaps_before`:

1. Построить `FetchRequest(symbol=symbol, timeframe=tf, window=TimeWindow(gap.start_ms, gap.end_ms))`.
2. Вызвать `fetcher.fetch_candles(request)`.
3. Отфильтровать/проверить, что вернувшиеся свечи относятся к `symbol`, `tf` и gap window.
4. Записать свечи через `db.upsert(candles)`.
5. Увеличить `fetched_rows` и `written_rows`.

Если fetcher падает или возвращает неожиданные данные:

- добавить диагностику в `FixReport`;
- записать append-only quarantine record;
- не вставлять magic rows;
- перейти к postflight, если состояние позволяет корректно его выполнить;
- итоговый статус не может быть `ok`.

В Phase 3 не нужен отдельный retry loop в DIM. Сетевые retry уже относятся к fetcher/Phase 2 (`tenacity` в REST-слое).

### 8.3 Postflight

1. Снова прочитать `db.range_get(symbol, tf, window)`.
2. Снова выполнить `find_gaps_linear`.
3. Выполнить read-only OHLC validation.
4. Выполнить freshness check только если `expected_latest_open_ms` передан.
5. Сформировать `FixReport`.
6. Если `gaps_after != []` или postflight не смог подтвердить целостность, записать минимальную quarantine diagnostics.

DIM не запускает себя повторно. Если после fix остались gaps, это failed/incomplete repair, а не повод для рекурсии.

### 8.4 Приоритет статусов

Если несколько проблем найдены одновременно, статус выбирается по приоритету:

1. `error`
2. `invalid`
3. `incomplete`
4. `ok`

Примеры:

- fetcher exception + invalid OHLC -> `error`
- gaps closed + invalid OHLC -> `invalid`
- gaps remain + OHLC valid -> `incomplete`
- no gaps + OHLC valid + fresh -> `ok`

---

## 9. CLI `fix`

### 9.1 Аргументы

Минимальная команда Phase 3:

```bash
python -m data_engine fix --symbol BTCUSDT --tf 1h
```

В Phase 3 CLI `fix` принимает только `--symbol` и `--tf`.
Explicit window остаётся на уровне core API `fix_candles(...)` для будущих внутренних вызовов и realtime-сценариев.

### 9.2 Full historical window (с `effective_from_ms`)

Для historical CLI window:

1. Получить `launch_time_ms` через `resolve_launch_time_ms(db, symbol)`.
2. `candidate_from_ms = ceil_to_grid(launch_time_ms, tf)`.
3. `to_ms = last_closed_open_time_ms(now_ms, tf)`.
4. Определить `effective_from_ms`:
   - если в БД уже есть свечи `symbol+tf`, взять `db.min_open_time_ms(symbol, tf)`;
   - если БД по `symbol+tf` пустая, найти первую доступную свечу через leading-empty discovery от `candidate_from_ms` до `to_ms`.
5. `window = TimeWindow(effective_from_ms, to_ms + tf_ms(tf))`.

`launch_time_ms` остаётся raw meta value и не используется как гарантированная «первая доступная свеча».
Верхняя граница `window.end_ms` включает последнюю полностью закрытую свечу как последний expected timestamp.
Leading-empty discovery может вызывать `fetcher` для поиска первого доступного `open_time_ms`, но остаётся read-only относительно SQLite: в discovery-шаге `upsert` не выполняется. Все записи свечей происходят только внутри `fix_candles`.

### 9.3 CLI pipeline

1. Нормализовать `symbol`.
2. Провалидировать `tf` через `tf_ms`.
3. Открыть `Db`.
4. Если DB-файл отсутствовал, можно создать DDL тем же pattern, что в `status`/`backfill`.
5. Выполнить `db.health()`.
6. Если `contract != "ok"` — напечатать `status: error` и завершиться с code `1`.
7. Собрать `BybitREST`.
8. Собрать `window`.
9. Посчитать `expected_latest_open_ms = last_closed_open_time_ms(now_ms, tf)` для full historical CLI режима.
10. Вызвать `fix_candles(symbol, tf, window, db, fetcher, expected_latest_open_ms=expected_latest_open_ms)`.
11. Напечатать `FixReport`.
12. Завершиться с code:
   - `0`, если `status == "ok"`;
   - `1`, если `status in {"incomplete", "invalid", "error"}`.

CLI не содержит собственной логики поиска gaps.

---

## 10. Поведение при ошибках

- Невалидный `tf` -> `status: error`.
- Невалидное окно -> `status: error`.
- Schema contract не `ok` -> `status: error`.
- Fetcher exception -> `status: error`, quarantine diagnostic.
- Fetcher вернул пусто на gap -> postflight определяет remaining gaps, итог обычно `incomplete`, diagnostic/quarantine обязательны.
- Postflight gaps remain -> `status: incomplete`, quarantine diagnostic.
- Invalid OHLC rows -> `status: invalid`.
- Missing expected latest candle (с `open_time_ms == expected_latest_open_ms`) в postflight range -> `status: incomplete`.

Ни один error path не должен писать sentinel свечи вроде `-1`.

---

## 11. Тесты

### 11.1 `tests/test_gaps.py`

Обязательные кейсы:

- `test_find_gaps_empty_timestamps_returns_full_window_gap`
- `test_find_gaps_complete_grid_returns_empty_list`
- `test_find_gaps_leading_gap`
- `test_find_gaps_middle_gap`
- `test_find_gaps_trailing_gap`
- `test_find_gaps_multiple_gaps`
- `test_find_gaps_collapses_adjacent_missing_timestamps`
- `test_find_gaps_ignores_duplicates`
- `test_find_gaps_accepts_unsorted_timestamps`
- `test_find_gaps_ignores_timestamps_outside_window`

Только обычный `pytest`. `hypothesis` не добавлять.

### 11.2 `tests/test_dim_repair.py`

Обязательные кейсы с fake Db/fetcher:

- `test_fix_candles_complete_window_does_not_fetch`
- `test_fix_candles_empty_db_repairs_full_window_gap`
- `test_fix_candles_repairs_one_middle_gap`
- `test_fix_candles_reports_incomplete_when_fetch_returns_empty`
- `test_fix_candles_reports_error_when_fetcher_raises`
- `test_fix_candles_reports_invalid_ohlc_without_mutating_rows`
- `test_fix_candles_reports_incomplete_when_postflight_gaps_remain`
- `test_fix_candles_is_not_recursive`
- `test_fix_candles_does_not_import_cli`

### 11.3 `tests/test_fix_cli.py`

Обязательные кейсы:

- `test_fix_cli_builds_full_historical_window_and_delegates_to_fix_candles`
- `test_fix_cli_prints_report_fields`
- `test_fix_cli_exits_zero_on_ok`
- `test_fix_cli_exits_nonzero_on_incomplete_invalid_or_error`
- `test_fix_cli_schema_mismatch_returns_error_without_fetch`
- `test_fix_cli_uses_effective_from_ms_when_db_has_rows`
- `test_fix_cli_discovers_first_available_candle_on_empty_db`

### 11.4 `tests/test_phase3_boundaries.py`

Boundary checks:

- `data_engine/indicators/` отсутствует.
- `data_engine/realtime/` отсутствует.
- `data_engine/adapters/` отсутствует.
- `data_engine/service/api.py` отсутствует.
- `data_engine/service/scheduler.py` отсутствует.
- `pyproject.toml` не содержит `pandas`, `numpy`, `vectorbt`, `fastapi`, `apscheduler`, `pyarrow`, `hypothesis`.

---

## 12. Acceptance-критерии

Phase 3 считается готовой, если:

- `python -m data_engine fix --symbol BTCUSDT --tf 1h` завершается с `status: ok` на рабочей БД после Phase 2 или на пустой новой БД.
- В checked historical window для `BTCUSDT/1h` `gaps_after == []`.
- OHLC validation возвращает `invalid_ohlc_rows == 0`.
- Freshness check в full historical CLI path зелёный: при переданном `expected_latest_open_ms` postflight подтверждает наличие свечи с этим `open_time_ms` внутри repaired window.
- `Db.range_get("BTCUSDT", "1h", clean_window)` отдаёт ASC-ряд без пропущенных expected timestamps.
- Никакие missing candles не представлены magic values.
- Все тесты Phase 1/2 продолжают проходить.
- Все новые тесты Phase 3 проходят.
- В репозитории не появились forbidden future layers/dependencies.
- CLI exit codes фиксированы: `ok -> 0`, `incomplete/invalid/error -> 1`.

---

## 13. Handoff в Phase 4

После Phase 3 Phase 4 может считать гарантированным для `BTCUSDT/1h`:

- свечи в выбранном clean historical window существуют на всей expected grid;
- `open_time_ms` идёт ASC через `Db.range_get`;
- gaps отсутствуют;
- OHLC валиден;
- последняя закрытая свеча загружена;
- в `candles` нет sentinel/magic rows.

Phase 4 поверх этого делает только:

```text
Db.range_get(BTCUSDT, 1h, clean_window)
↓
pandas/DataFrame
↓
vectorbt
↓
EMA/strategy прямо в research script
↓
metrics
```

Индикаторы в Phase 4 остаются локальными внутри research script. Backend indicators обсуждаются только после живого smoke `загрузили -> починили -> прогнали vectorbt`.

---

## 14. Что отложено после Phase 4

После Phase 4, когда будет живой smoke, можно отдельно решить:

- нужны ли backend indicators вообще;
- нужны ли они только для фронта или ещё для research/realtime;
- хранить ли их в БД;
- нужна ли им freshness/cache policy;
- нужен ли отдельный lightweight recalculation после candle repair.

Это не часть Phase 3 и не часть Phase 4.
