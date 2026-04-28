# Phase 1 — Foundation (детальное ТЗ)

> Это **детальное** техзадание текущей фазы. Любые отсылки к будущим фазам — справочные, не руководство к действию. Запрет на упреждающую реализацию из Phase 2+ — жёсткий.
>
> Связанные документы:
> - `docs/00_master_plan.md` — мастер-план, принципы, DECIDED/OPEN/DEFERRED.
> - `docs/phases/02_historical_backfill.md` и далее — phase cards следующих фаз (читать только как ориентир).

---

## 1. Цель фазы

`python -m data_engine status` отвечает осмысленным выводом из реальной SQLite-БД, созданной с нуля по DDL из этой фазы.

**Прикладной смысл.** «Hello, world» для всей системы. После Phase 1 видно, что окружение настроено правильно, конфиг и БД работают, фундамент стоит.

**Что Phase 1 делает на уровне поведения:**
1. Инициализация БД (создаёт файл и таблицы, если их ещё нет).
2. Проверка схемы (без авто-починки).
3. Вывод состояния в человеко-читаемом виде.

Никаких полноценных store-классов, никаких contracts, никаких индикаторов — это всё появится позже.

---

## 2. Зависимости

Никаких. Это первая фаза. Проект создаётся с нуля в новом репозитории `data_engine/`. Никакой существующий код **не используется**.

---

## 3. Результат (deliverable)

Команда:

```
$ python -m data_engine status
db_path: ./market.sqlite
schema_version: 1
schema_meta: 1
candles: 0
meta: 0
quarantine: 0
contract: ok
```

Поведение:
- Если БД не существует — она создаётся при первом запуске; вывод тот же: `schema_meta = 1`, остальные counts = 0.
- Если БД уже есть — ничего не пересоздаётся; выводятся реальные counts.
- Если кто-то снаружи удалил/переименовал ожидаемую таблицу — `contract: schema_mismatch` (без авто-починки в этой команде).

---

## 4. Allowed files (что Phase 1 имеет право создать)

```
.
├── pyproject.toml
├── README.md                       # минимальный, 1 экран: что это, как запустить status
├── data_engine/
│   ├── __init__.py
│   ├── __main__.py                 # python -m data_engine ...
│   ├── config.py                   # Settings (pydantic-settings)
│   ├── store/
│   │   ├── __init__.py
│   │   ├── db.py                   # один тонкий класс Db: open(), apply_ddl(), health()
│   │   └── ddl.py                  # SQL для apply_ddl + список ожидаемых таблиц для health()
│   └── service/
│       ├── __init__.py
│       └── cli.py                  # Typer app с одной командой `status`
└── tests/
    ├── __init__.py
    ├── conftest.py
    ├── test_settings.py
    ├── test_db_init.py
    ├── test_db_health.py
    └── test_cli_status.py
```

Никаких других файлов. Никакого `engine/`, `fetcher/`, `indicators/`, `realtime/`, `adapters/`, никакого `contracts/`. Никаких отдельных классов `CandleStore`/`MetaStore`/`QuarantineStore` — они появятся в Phase 2/3, когда будут реальные операции записи и чтения.

---

## 5. Forbidden files / forbidden layers (жёстко в Phase 1)

В Phase 1 категорически нельзя создавать:

- `data_engine/contracts/` — `Candle`, `TimeWindow`, `Gap`, `FixReport` появляются в Phase 2+, когда у них есть реальные потребители.
- `data_engine/fetcher/**` — никаких REST/WS клиентов, ни заглушек, ни Protocol-ов «на будущее».
- `data_engine/engine/**` — нет `gaps`, `dim`, `quarantine.py` (модуля; **сама таблица `quarantine` есть в DDL**), `time_grid`, `schema_sync`.
- `data_engine/indicators/**` — никаких `IIndicatorBatch`/`IIndicatorStream`/`IndicatorRegistry`/`adapters/`. Даже пустых файлов.
- `data_engine/realtime/**` — никакого WS/manager-а/handlers/watchdog-а.
- `data_engine/adapters/**` — никакого `vectorbt.py`, никакого `parquet_exporter.py`.
- `data_engine/service/api.py` — FastAPI вообще не появляется в Phase 1.
- `data_engine/service/scheduler.py` — apscheduler вообще не появляется в Phase 1.
- Любая зависимость на `pybit`, `vectorbt`, `pandas-ta`, `ta-numba`, `streaming-indicators`, `talib`, `fastapi`, `apscheduler`, `pyarrow`, `numpy`, `pandas`, `tenacity` — **запрещено добавлять в `pyproject.toml`** в Phase 1. Эти зависимости появляются ровно в той фазе, где реально используются.

Если возникает соблазн «давайте на всякий случай положим пустой `engine/__init__.py`, потом пригодится» — это нарушение Phase 1. Не пригодится: `engine/` появится в Phase 3 целиком и сам, когда станет понятно, что туда класть.

---

## 6. Зависимости (`pyproject.toml`)

Минимальный набор, никаких больше:

- `pydantic` (>=2)
- `pydantic-settings`
- `typer`
- `pytest` (dev)

```toml
[project]
name = "data_engine"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2",
  "pydantic-settings",
  "typer",
]

[project.optional-dependencies]
dev = ["pytest"]

[project.scripts]
# опционально: engine = "data_engine.service.cli:app"
```

Любая попытка добавить лишнюю зависимость в Phase 1 — нарушение фазы.

---

## 7. Контракты Phase 1

### 7.1 `Settings` (`data_engine/config.py`)

- `class Settings(BaseSettings)` на `pydantic-settings`.
- Поля минимально необходимые для status:
  - `db_path: Path = Path("./market.sqlite")`
  - `log_level: str = "INFO"`
- Поведение: `Settings()` валидируется; невалидный `log_level` → `ValidationError`. Глобальный singleton **не делать** — `Settings` создаётся в точке входа CLI и пробрасывается в `Db` через конструктор.
- Никаких других полей в Phase 1. `symbols`, `tfs`, `indicators`, `bybit_*` — это будущие фазы.

### 7.2 `Db` (`data_engine/store/db.py`)

В Phase 1 — **один тонкий класс**, безо всяких `CandleStore`/`MetaStore`/`QuarantineStore`. Ожидаемая поверхность:

```python
class Db:
    def __init__(self, db_path: Path) -> None: ...
    # Открывает соединение, применяет PRAGMA. DDL НЕ применяется здесь.

    def apply_ddl(self) -> None: ...
    # Идемпотентно создаёт все недостающие ожидаемые таблицы (см. 7.4).
    # Вызывается явно — например, из CLI status или из тестов.

    def health(self) -> dict: ...
    # Только читает БД, ничего не создаёт и ничего не правит.
```

Поведение `__init__`:
- открывает `sqlite3.connect(db_path)`;
- применяет PRAGMA: `journal_mode=WAL`, `busy_timeout=30000`, `synchronous=NORMAL`;
- **не применяет DDL** автоматически.

Поведение `apply_ddl()`:
- идемпотентно создаёт все ожидаемые таблицы (`CREATE TABLE IF NOT EXISTS ...`).

Поведение `health()`:
- **никаких CREATE/ALTER**.
- считает количество строк в каждой ожидаемой таблице через простой `SELECT COUNT(*)` — но только если таблица существует. Если хотя бы одна ожидаемая таблица отсутствует → `contract = "schema_mismatch"`, counts по пропавшим таблицам не выводятся.
- возвращает словарь:

  ```python
  {
    "db_path": str,
    "schema_version": 1,           # читается из schema_meta, см. 7.4
    "schema_meta": int,
    "candles": int,
    "meta": int,
    "quarantine": int,
    "contract": "ok" | "schema_mismatch",
  }
  ```

В Phase 1 **не появляются** методы `range_get`, `upsert`, `max_open_time_ms`. Это контракты Phase 2/3, когда у них будут реальные потребители.

### 7.3 CLI (`data_engine/service/cli.py` + `data_engine/__main__.py`)

- Typer-app `app`, одна команда `status`:
  ```python
  @app.command()
  def status(db_path: Optional[Path] = None) -> None: ...
  ```
- Поведение `status`:
  1. собирает `Settings()`; если `db_path` передан флагом — переопределяет;
  2. создаёт `Db(settings.db_path)` (это **открывает** БД);
  3. вызывает `db.apply_ddl()` — это автосоздание ожидаемых таблиц при первом запуске;
  4. вызывает `db.health()` и печатает результат человеко-читаемо в формате из секции 3.
- `__main__.py`: `from .service.cli import app; app()`.

В Phase 1 **больше никаких команд** (`backfill`, `fix`, `run`, `serve`, `export-parquet` — всё это будущие фазы и в Phase 1 не существует).

### 7.4 DDL (`data_engine/store/ddl.py`)

Содержит SQL-строки и список ожидаемых таблиц. В Phase 1 есть минимальная таблица версии схемы: без Alembic, YAML и migration framework, только `schema_meta(key, value)` и строка `schema_version = 1`.

Создаются ровно четыре таблицы и один индекс:

```sql
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candles (
  symbol        TEXT    NOT NULL,
  timeframe     TEXT    NOT NULL,
  open_time_ms  INTEGER NOT NULL,
  open          REAL    NOT NULL,
  high          REAL    NOT NULL,
  low           REAL    NOT NULL,
  close         REAL    NOT NULL,
  volume        REAL    NOT NULL,
  PRIMARY KEY (symbol, timeframe, open_time_ms)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup
  ON candles(symbol, timeframe, open_time_ms);

CREATE TABLE IF NOT EXISTS meta (
  symbol         TEXT PRIMARY KEY,
  launch_time_ms INTEGER,
  fetched_at_ms  INTEGER
);

CREATE TABLE IF NOT EXISTS quarantine (
  id            INTEGER PRIMARY KEY,
  symbol        TEXT,
  timeframe     TEXT,
  start_ms      INTEGER,
  end_ms        INTEGER,
  reason        TEXT,
  payload       TEXT,
  created_at_ms INTEGER
);
```

После создания таблиц `apply_ddl()` идемпотентно гарантирует наличие версии схемы:

```sql
INSERT OR IGNORE INTO schema_meta(key, value)
  VALUES ('schema_version', '1');
```

Список ожидаемых таблиц для `health()` — Python-константа в том же модуле:
```python
EXPECTED_TABLES = ("schema_meta", "candles", "meta", "quarantine")
```

`health()` читает `schema_version` из `schema_meta`. Если таблица `schema_meta` или ключ `schema_version` отсутствуют — это `contract = "schema_mismatch"`, без авто-починки внутри `health()`.

Почему таблицы `indicators` нет в Phase 1:
- Точная схема `indicators` — открытое решение (см. ADR-002 в `docs/adr/`, OPEN).
- В Phase 1 `indicators` не используется ни одним кодом, и держать заглушку с не-финальной схемой — это техдолг с первого коммита.
- Таблица будет добавлена в Phase 5 после ADR-002.

---

## 8. Тесты (Phase 1)

### 8.1 `tests/test_settings.py`
- `Settings()` собирается с дефолтами; `db_path` — `Path`.
- Невалидный `log_level` (например, `"NOTALEVEL"`) → `ValidationError`.
- Переопределение через переменные окружения работает (например, `DATA_ENGINE_DB_PATH=...`).

### 8.2 `tests/test_db_init.py`
- На временной директории: `Db(tmp / "x.sqlite").apply_ddl()` создаёт файл и **только** четыре ожидаемых таблицы (`schema_meta`, `candles`, `meta`, `quarantine`) + индекс `idx_candles_lookup`. Никаких лишних application-таблиц.
- В `schema_meta` есть строка `schema_version = 1`.
- Повторный вызов `apply_ddl()` на том же файле не падает (идемпотентность).
- `PRAGMA journal_mode` после `__init__` возвращает `'wal'`.

### 8.3 `tests/test_db_health.py`
- На пустой БД (после `apply_ddl()`): `health()` возвращает все ключи из 7.2 и `contract == "ok"`, `schema_version == 1`, `schema_meta == 1`, `candles == meta == quarantine == 0`.
- **Сценарий schema_mismatch (без авто-починки):**
  1. создаём `Db(tmp_db).apply_ddl()` — таблицы есть;
  2. **отдельным** `sqlite3.connect(tmp_db)` выполняем `DROP TABLE meta`;
  3. создаём **новый** `Db(tmp_db)` (без вызова `apply_ddl()`!) и вызываем `health()`;
  4. ожидаем `health()["contract"] == "schema_mismatch"`.
  
  Этот тест явно проверяет, что **`health()` не пересоздаёт пропавшую таблицу** — иначе schema_mismatch никогда нельзя было бы увидеть.

### 8.4 `tests/test_cli_status.py`
- `CliRunner` (Typer/click) — запуск `status --db-path <tmp>` на новом файле:
  - команда сама создаёт БД (`apply_ddl()` срабатывает внутри `status`),
  - печатает все строки из формата секции 3 (substring-match),
  - exit code 0.

Никаких тестов на fetcher/dim/indicators/realtime/api в Phase 1.

---

## 9. Acceptance-критерии Phase 1

Все пункты — обязательны.

1. **Установка с нуля.** На чистой машине `pip install -e .` отрабатывает без ошибок и без ручных шагов.
2. **`status` отрабатывает за <2 секунды.** `python -m data_engine status` на новой БД печатает блок из секции 3, exit code 0.
3. **DDL соответствует.** В созданной БД присутствуют ровно application-таблицы `schema_meta`, `candles`, `meta`, `quarantine` (и больше никаких). В `schema_meta` есть `schema_version = 1`. У `candles` PK `(symbol, timeframe, open_time_ms)`; индекс `idx_candles_lookup` существует; `journal_mode=WAL` активен.
4. **Разделение `apply_ddl()` и `health()` соблюдено.** `health()` ничего не создаёт. Тест из 8.3 (drop таблицы после init) видит `contract == "schema_mismatch"`.
5. **Тесты зелёные.** `pytest -q` — все четыре файла тестов проходят на чистой копии.
6. **Изоляция от будущих фаз.** В дереве проекта нет `data_engine/contracts/`, `data_engine/fetcher/`, `data_engine/engine/`, `data_engine/indicators/`, `data_engine/realtime/`, `data_engine/adapters/`, `data_engine/service/api.py`, `data_engine/service/scheduler.py`. (Проверяется ревью + автотестом, который ищет эти пути.)
7. **Никаких лишних зависимостей.** В `pyproject.toml` ровно те зависимости, что перечислены в секции 6. Никаких `pybit`, `vectorbt`, `fastapi`, `pandas`, `numpy`, `pyarrow`, `pandas-ta`, `ta-numba`, `streaming-indicators`, `talib`, `apscheduler`, `tenacity`.
8. **Никаких magic-значений.** В коде Phase 1 не появляются `-1`/`0` как «ну тут пока пусто», и в БД ничего такого тоже не пишется.
9. **Документ Phase 1 закрыт.** Этот файл и его acceptance — финальные для Phase 1; правка acceptance задним числом запрещена.

---

## 10. Out of scope (явно — это **не** Phase 1)

Список того, что точно **не** делается в Phase 1, даже если кажется, что «ну ещё одну строчку, и сразу пригодится».

- Контракты `Candle`/`TimeWindow`/`Gap`/`FixReport` — Phase 2+.
- Отдельные классы `CandleStore`/`MetaStore`/`QuarantineStore` — Phase 2+.
- Методы `Db.upsert(...)`, `Db.range_get(...)`, `Db.max_open_time_ms(...)` — Phase 2.
- Fetcher (`IFetcher`, `BybitREST`, `BybitWS`, `depth_resolver`).
- DIM (`gaps.find_gaps_linear`, `dim.fix_candles`, `dim.fix_indicators`, OHLC-валидация).
- Indicator-слой: `IIndicatorBatch`, `IIndicatorStream`, `IndicatorSpec`, `IndicatorRegistry`, `pandas_baseline`, любые adapters, ADR-001 spike. **Также: никакой таблицы `indicators` в БД Phase 1.**
- Realtime: WS-клиент, manager, handlers, watchdog, CLI `run`.
- FastAPI: ни `service/api.py`, ни роутов, ни snapshot-тестов JSON-контракта.
- Scheduler: apscheduler, daily integrity job.
- Adapters: `vectorbt.py`, `parquet_exporter.py`, любые экспорты.
- Multi-symbol: Phase 1 — про один пустой проект, а не про список пар.
- CI: ruff/mypy/pytest-on-PR — Phase 8.
- Docs: `docs/api.md`, README уровня production — позже. В Phase 1 README — на 1 экран: «что это, как запустить status».

---

## 11. Команда «фаза готова»

```
git tag phase-1-done
```

Можно ставить только после того, как:
- секция 9 (acceptance) выполнена целиком,
- секции 5 и 10 (forbidden / out of scope) не нарушены,
- diff Phase 1 на ревью читается за один присест (ориентир — заметно меньше 800 строк нового кода).

После этого можно открывать `docs/phases/02_historical_backfill.md` и превращать его phase card в детальное ТЗ Phase 2 — но не раньше.
