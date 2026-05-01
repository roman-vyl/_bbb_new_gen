# Data Engine v2 — Master Plan

> Стратегическая карта проекта. Документ стабильный, меняется только при пересмотре общего направления — не при работе над конкретной фазой.

---

## Как читать этот документ

Документ разбит на три части:

- **Часть A — для владельца проекта.** Цель, что строим / не строим, что получишь к концу каждой фазы простыми словами, MVP. Без технических терминов.
- **Часть B — архитектурные решения.** Принципы, DECIDED / OPEN / DEFERRED, roadmap фаз в формате phase cards. Здесь живёт «куда мы идём и почему».
- **Часть C — техническая часть для Cursor.** Блок-схема зависимостей, правила перехода между фазами, структура документации.

Уровни документации в проекте:
- `00_master_plan.md` — этот файл, стабильный.
- `docs/phases/0N_*.md` — детальное ТЗ для фазы, которую **реализуем или явно планируем**; остальные фазы — короткие phase cards (см. актуальный `04_research_smoke.md` для MVP smoke).
- `docs/adr/ADR-NNN-*.md` — спорные технические решения. ADR пишется **перед** нужной фазой, не «когда-нибудь».

---

# Часть A — для владельца проекта

## A1. Цель проекта (человеческим языком)

Программа-«движок данных», которая сама грузит свечи Bybit, проверяет, что в данных нет дыр, чинит их и гарантирует **чистые свечи** с предсказуемым контрактом. Бэктесты и research идут через `vectorbt` и **расчёты в `research/`** (локальные индикаторы в скриптах/семействах стратегий). Отдельный **backend indicator layer в core** (индикаторы в SQLite, единый batch/stream-контракт в движке) возможен позже, но **не является обязательным следующим шагом** после MVP — решение откладывается до отдельного decision gate.

**Зачем:** чтобы любая торговая логика сверху всегда могла опираться на свежие и проверенные **свечи**, без неожиданных «дыр» и без ручной возни; глубина индикаторного слоя в core определяется отдельно, когда появится ясная потребность.

## A2. Что строим / что не строим

**Строим:**
- слой **свечей** с гарантированным контрактом «нет дыр, нет magic-значений»; принцип **раздельного** хранения свечей и индикаторов в БД заложен на будущее, но **реализация** indicator storage в core — только после отдельного решения;
- backfill истории и (на горизонте фаз) realtime-обновление свечей;
- read-only HTTP-API и CLI для управляющих действий (по roadmap фаз);
- research и бэктесты на `vectorbt` с **research-local** расчётами индикаторов; post-MVP активный трек — **Strategy Constructor** в `research/` (см. `docs/research/strategy_constructor_master_plan.md`), а не автоматический старт indicator framework в `data_engine/`.

**Не строим в этом проекте:**
- торговую логику, риск-менеджмент, ордер-роутинг — это потом, поверх этого слоя;
- веб-интерфейс / визуализацию — пока только CLI и HTTP-API; фронт строится позже отдельным проектом;
- мульти-биржу — пока только Bybit, но интерфейсы заложены под будущую подмену.

## A3. Что получишь к концу каждой фазы — простыми словами

- **Phase 1 — Foundation.** Пустой проект уже запускается одной командой и показывает состояние своей БД.
- **Phase 2 — Historical Backfill.** Одна команда грузит всю историю Bybit для одной пары и одного таймфрейма.
- **Phase 3 — DIM Repair.** Одна команда чинит любые дыры в данных до состояния «всё на месте».
- **Phase 4 — Simple Research Smoke.** На этих данных работает первый бэктест в `vectorbt`. **Это конец MVP.**
- **Post-MVP Research Track — Strategy Constructor.** После MVP **активная** линия развития — конструктор стратегий и семейства в **`research/`**, не в `data_engine/`: пайплайн «свечи из БД → фичи/сигналы в research → `vectorbt`», без требования ввести backend indicators в core. Ориентиры: `docs/research/strategy_constructor_master_plan.md`, `docs/research/01_strategy_family_skeleton.md`.
- **Phase 5 — Backend Indicator Framework (decision gate, не автоматический следующий шаг).** Стартует **только** если отдельно принято решение, что индикаторы должны жить в движке и в БД. Если да — появляется единый контракт, статус готовности значений, batch/stream и т.д. Если нет — фаза остаётся отложенной; Strategy Constructor и локальные расчёты в `research/` продолжают быть допустимым основным путём.
- **Phase 6 — Realtime.** Движок работает в realtime: новые свечи обновляются сами; обрыв сети ничего не теряет. Обновление **индикаторов** в realtime в полном объёме привязано к **опциональной** Phase 5; до decision gate фокус — надёжные свечи и research-пайплайн.
- **Phase 7 — API & Multi-Symbol.** Несколько пар одновременно, есть HTTP-API на чтение, ежедневная авто-проверка вчерашних суток.
- **Phase 8 — Exports & Polish.** Добавлены Parquet-снимки для тяжёлых research-задач; проверено сутками непрерывной работы.

## A4. MVP Data Engine

**MVP = Phase 1 + Phase 2 + Phase 3 + Phase 4.**

Первая большая победа проекта:
- запустили новый проект (Phase 1);
- загрузили `BTCUSDT 1h` всю историю (Phase 2);
- проверили и починили дыры (Phase 3);
- запустили первый бэктест на чистых свечах (Phase 4).

MVP acceptance — `BTCUSDT 1h`. После MVP, но до multi-symbol rollout, прогоняем дополнительные smoke checks на `BTCUSDT 5m` и `BTCUSDT 1d`. `BTCUSDT 1m` отложен до явного отдельного решения.

**До MVP запрещено:**
- realtime / WebSocket;
- scheduler (apscheduler);
- multi-symbol rollout;
- Parquet export;
- FastAPI service;
- сложный indicator framework — индикаторы в Phase 4 живут одной строчкой `pd.ewm` внутри research-скрипта;
- production polish (CI, mypy-perfect, 7-дневный run).

Зачем такое жёсткое ограничение: чтобы в фундамент Phase 1–3 случайно не вшилась конкретная библиотека индикаторов / WebSocket-клиент / схема Parquet, которую потом пришлось бы выдирать.

## A5. Стэк по фазам (а не «всё сразу»)

| Когда добавляется | Что добавляется |
|---|---|
| **Phase 1 core** | Python 3.11+, SQLite (WAL), Typer CLI, `pydantic`/`pydantic-settings`, `pytest` |
| **Phase 2 backfill** | `pybit`, `tenacity` |
| **Phase 4 research** | `pandas`, `numpy`, `vectorbt` — как research-extras, не как core dependencies |
| **Post-MVP Strategy Constructor** | те же research-extras и код в `research/` (без новых core-deps «под индикаторы движка»); см. `docs/research/strategy_constructor_master_plan.md` |
| **Backend indicators (Phase 5, если gate открыт)** | выбранный indicator backend (ADR-001) + reference baseline; **не** добавляется «само собой» после MVP |
| **Realtime (Phase 6)** | WebSocket-клиент Bybit (через `pybit` или аналог) |
| **Service (Phase 7)** | `FastAPI` (read-only), `apscheduler` |
| **Export (Phase 8)** | `pyarrow` / Parquet |

Правило: **никакая зависимость не появляется в `pyproject.toml` раньше своей фазы**, даже «на всякий случай». Это часть acceptance каждой фазы.

---

# Часть B — архитектурные решения

## B1. Ключевые принципы (короткая аксиоматика)

- **Один источник правды на конфиг.** Все модули принимают зависимости через конструктор/функцию, а не читают конфиг глобально.
- **Один путь к БД.** `Settings.db_path`. Всё остальное — ошибка интеграции.
- **Один алгоритм поиска дыр.** Появится в Phase 3 как единственная реализация, переиспользуется в DIM и в watchdog realtime.
- **Одно временное представление.** `open_time_ms` (см. DECIDED).
- **Одно направление зависимостей слоёв** (см. блок-схему в части C). Никаких импортов снизу вверх.
- **DIM не звонит сам себе.** `fix_candles` строго двухфазен (preflight → fix → postflight), без рекурсии. Аналогичная дисциплина для **`fix_indicators`** — только если и когда появится индикаторный слой в core (сейчас не обязательный контур).
- **Запись в БД — только через `engine` (DIM) и, в будущих фазах, `realtime` (handlers).** API — read-only.
- **Backend indicator layer (если когда-либо вводится).** Изоляция конкретных библиотек в адаптерах, контракт через интерфейсы — **направление на будущее**, не зафиксированное архитектурное обязательство до decision gate (см. ADR-001/002 **только при планировании Phase 5**).
- **Одна фаза = одна рабочая вертикаль = git tag «работает end-to-end».** Между фазами можно остановиться без обещаний «когда-нибудь свяжем».

## B2. Принятые решения (DECIDED)

> Эти решения уже встроены в архитектурный фундамент и в Phase 1. Менять — только через явный пересмотр мастер-плана.

- **SQLite + WAL** как основное хранилище (`journal_mode=WAL`, `busy_timeout=30000`, `synchronous=NORMAL`).
- **`open_time_ms` (INTEGER, миллисекунды UTC)** — единственная временная колонка во всей системе. Имя `open_time_ms`, не `timestamp`. Bybit отдаёт миллисекунды; конверсия в секунды — лишний шаг и шанс на off-by-one. В будущем (тики) секунд недостаточно — менять схему позже = миграция большой БД.
- **Свечи и индикаторы концептуально раздельны.** Если позже вводится хранение индикаторов в БД — они не сливаются со свечами в одну «универсальную» таблицу; точная схема и статус-модель — **OPEN** (ADR-002 **только если** открывают Phase 5). До этого индикаторы в бэктестах остаются в `research/`.
- **CLI — единственный путь для управляющих действий.** `backfill`, `fix`, `run` — это команды Typer-CLI, а не HTTP-эндпоинты.
- **FastAPI — строго read-only.** Mutating endpoints запрещены архитектурно. `POST/PUT/DELETE/PATCH` → 405. Ручная починка — `engine fix` в CLI; регулярная — apscheduler.
- **Один фетчер = один протокол.** `IFetcher` Protocol; конкретные реализации (`BybitREST`, `BybitWS`) — за интерфейсом.

## B3. Открытые решения (OPEN)

> Будут закрыты spike-исследованием или ADR **перед** нужной фазой. Сейчас фиксируем как направление и ограничения, не как реализацию.

**Текущий post-MVP фокус (не OPEN в смысле «не решено», а активный трек):** **Strategy Constructor** — развитие `research/` (семейства стратегий, декомпозиция пайплайна, `vectorbt`), **вне** `data_engine/`. Это не требует предварительного backend indicator layer.

| ID | Тема | Когда решаем |
|----|------|--------------|
| ADR-001 | Конкретная библиотека индикаторов для **core** (`pandas-ta` / `ta-numba` / `streaming-indicators` / `TA-Lib` + `pandas_baseline` всегда). | **Только если** принято начинать Phase 5 (backend indicators) |
| ADR-002 | Точная схема таблицы `indicators` (multi-parameter / multi-output, статус-модель, политика warmup). | **Только если** принято начинать Phase 5 |
| ADR-003 | Realtime indicator state: хранить сериализуемый `state` или восстанавливать seed из истории. | **Только если** в Phase 6 в scope входит индикаторный realtime из core; иначе откладывается вместе с Phase 5 |
| ADR-004 | Parquet export/read model: партиционирование, частота снимков, контракт с `vbt.ParquetData`. | Перед Phase 8 |

## B4. Отложенные решения (DEFERRED)

> Не делаем до отдельного сигнала боли. Только направление, никаких файлов и тестов до фазы.

- **Parquet export** — только в Phase 8, и только если research реально упирается в скорость SQLite.
- **Multi-symbol rollout** — Phase 7 (≥3 пары одновременно). Ранние фазы пишут generic-кодом, но запускаются на одной паре.
- **Scheduler (apscheduler daily integrity)** — Phase 7. До этого — только ручной `engine fix`.
- **Полноценный `vectorbt`-адаптер в core** — при необходимости позже; сейчас бэктесты и Strategy Constructor живут в `research/`.
- **Indicator registry, batch/stream интерфейсы, адаптеры под конкретные indicator-библиотеки в `data_engine/indicators/`** — до явного decision gate Phase 5; параллельно допустимы локальные формулы и модули в `research/`.
- **Production CI / 7-дневный stability run** — Phase 8.
- **Веб-фронт** — не в этом проекте.
- **Мульти-биржа** — только Bybit; интерфейс `IFetcher` оставляет дверь открытой.

## B5. Roadmap фаз (phase cards)

> Подробное ТЗ — для активной/планируемой фазы (сейчас: `docs/phases/04_research_smoke.md` для Phase 4; ранее Phase 1 — `01_foundation.md`).
> Остальные фазы — короткие **phase cards**: цель, прикладной результат, зависимости, открытые вопросы, явные «не делать раньше». Это ориентир, чтобы Phase 1–3 не построились так, что потом realtime/API и **опциональный** индикаторный слой в core оказались бы невозможными.
>
> Уровень детализации по горизонту:
> - Phase 1 — детальное ТЗ (`01_foundation.md`).
> - Phase 2–3 — см. `docs/phases/02_historical_backfill.md`, `docs/phases/03_dim_repair.md`.
> - Phase 4 — детальное ТЗ (`04_research_smoke.md`).
> - Phase 5–8 — phase cards с прикладным результатом, зависимостями, открытыми вопросами, явными ограничениями. Без списков файлов и имён тестов (кроме отдельного детального ТЗ при старте фазы).

### Phase 1 — Foundation
- **Цель.** Новый проект запускается с нуля, создаёт правильную SQLite-БД и умеет показать её состояние одной командой `python -m data_engine status`.
- **Прикладной результат.** «Hello, world» для всей системы: видно, что окружение настроено правильно и фундамент стоит.
- **Зависимости.** Никаких; первая фаза.
- **Что точно не делать в Phase 1.** Fetcher, DIM, indicators (даже интерфейсы), realtime, FastAPI, vectorbt-адаптер, Parquet, apscheduler, отдельные `CandleStore/MetaStore/QuarantineStore`-классы.
- **Подробное ТЗ.** `docs/phases/01_foundation.md`.

### Phase 2 — Historical Backfill
- **Цель.** `python -m data_engine backfill --symbol BTCUSDT --tf 1h` загружает всю историю от реального `launchTime` Bybit; повторный запуск идемпотентен.
- **Прикладной результат.** Одна команда — вся история одной пары/TF в БД, без ручной работы.
- **Зависимости.** Phase 1.
- **Что появляется (общими словами).** `IFetcher` Protocol; REST-имплементация с чанкингом и ретраями; resolver `launchTime`; `time_grid` (`align_to_grid`, `tf_ms`). Контракт `Store`-а расширяется парой методов: `upsert(rows)` и `range_get(symbol, tf, window)` — оба нужны уже здесь (upsert для backfill, range_get для self-проверки и для будущего research; делать `range_get` отдельной фазой не имеет смысла).
- **Что не делать раньше.** DIM, gap-fill, indicators, WS, FastAPI, scheduler.

### Phase 3 — DIM Repair
- **Цель.** `python -m data_engine fix --symbol BTCUSDT --tf 1h` приводит БД к контракту «дыр нет, OHLC валиден, свежесть в норме», даже если внутри есть дыры или БД пустая.
- **Прикладной результат.** Авто-«ремонтник» данных. Magic-значения `-1` в БД больше не появляются.
- **Зависимости.** Phase 2.
- **Что появляется (общими словами).** Единственный алгоритм поиска дыр; quarantine-флоу; двухфазный `fix_candles` (preflight → fix → postflight) с OHLC-валидацией и freshness check.
- **Что не делать раньше.** Indicators, realtime, scheduler, FastAPI.

### Phase 4 — Simple Research Smoke (финал MVP)
- **Цель.** На очищенных свечах работает первый бэктест в `vectorbt`. Данные доезжают до стратегии без NaN; печатаются метрики (Sharpe, PF, max_dd и т.п. по ТЗ).
- **Прикладной результат.** Первая «большая победа» проекта: загрузили историю → починили дыры → прогнали бэктест.
- **Зависимости.** Phase 3 (чистая БД свечей).
- **Что появляется (общими словами).** `research/ema_smoke.py` (совместимый entrypoint) и пайплайн в `research/strategies/ema_pullback/` + тесты smoke-хелперов и границ фазы; команды `python research/ema_smoke.py` и `python research/strategies/ema_pullback/run.py`. Скрипт читает свечи через `range_get`, считает EMA локально в research (`pd.ewm(..., adjust=False)`), стратегия — EMA crossover, `vectorbt` для портфеля и метрик, печать метрик в stdout. `pandas`/`numpy`/`vectorbt` — optional research extras. Результаты бэктеста в SQLite не пишутся. Полный Strategy Constructor — post-MVP трек после MVP, не обязательный scope Phase 4.
- **Что не делать раньше.** Полноценный indicator framework (`IIndicatorBatch`, registry, adapters/), запись индикаторов или метрик бэктеста в SQLite, ADR-001 spike как обязательное продолжение. Индикаторный слой в core — только после **отдельного решения** после Phase 4 (см. gate ниже).
- **Подробное ТЗ.** `docs/phases/04_research_smoke.md`.

### Post-MVP Research Track — Strategy Constructor
- **Цель.** Развивать research-слой для стратегий и бэктестов на чистых свечах из БД: семейства в `research/strategies/`, пайплайн фич/сигналов, `vectorbt`, метрики — **вне** `data_engine/`.
- **Прикладной результат.** Воспроизводимые прогоны стратегий и задел под constructor без обязательного backend indicator layer.
- **Зависимости.** Закрытый MVP (Phase 4); чтение свечей через существующие контракты store/`range_get`.
- **Ориентиры.** `docs/research/strategy_constructor_master_plan.md`, `docs/research/01_strategy_family_skeleton.md`.
- **Что не смешивать.** Торговая логика, registry оптимизаторов и т.п. остаются в `research/`; core не расширяется под индикаторы без отдельного Phase 5 gate.

### Phase 5 — Backend Indicator Framework (decision gate)
- **Цель.** **Только если** принято решение вводить backend indicators: проект добавляет индикаторный слой в core для тех индикаторов, которые должны жить в движке и БД. До этого решения **основной** путь развития после MVP — Strategy Constructor и локальные расчёты в `research/`, без обязательной реализации Phase 5.
- **Прикладной результат.** Research, бэктест и (позже) realtime могут использовать один и тот же источник индикаторов из БД, с понятной семантикой «это значение можно использовать в стратегии».
- **Зависимости.** Закрытый MVP (Phase 4) **и** явное решение, что backend indicators нужны.
- **Decision gates.** ADR-001 (выбор библиотеки индикаторов), ADR-002 (схема таблицы `indicators`) — **только если** Phase 5 стартует; оба ADR закрываются **до** реализации indicator framework.
- **Что не делать раньше.** В Phase 1–4 не появляются: модуль `data_engine/indicators/`, таблица `indicators` в БД, зависимости под конкретные indicator-библиотеки. Никаких ema-specific хардкодов в DIM или research.
- **Ключевые открытые вопросы.** Какую библиотеку выбрать; как хранить multi-parameter и multi-output индикаторы; как формализовать warmup и готовность значений. Конкретные имена файлов, формулы warmup, тестовые tolerance — это уровень детального ТЗ Phase 5, не мастер-плана.

### Phase 6 — Realtime
- **Цель.** Движок работает в realtime: новые **свечи** обновляются сами; обрыв сети ничего не теряет. Синхронное обновление **индикаторов в БД** в полном объёме — в связке с **опциональной** Phase 5; до открытия gate детали индикаторного realtime остаются в OPEN.
- **Прикладной результат.** Процесс можно оставить запущенным, не заглядывать в БД и быть уверенным, что данные не разъезжаются.
- **Зависимости.** По свечам — закрытый контур backfill + DIM (Phase 2–4). Полная картина «свечи + backend indicators в realtime» — поверх Phase 5, если она запущена.
- **Decision gates.** ADR-003 (realtime indicator state) — **если** в realtime входит индикаторный контур из core; иначе откладывается вместе с Phase 5.
- **Что не делать раньше.** Никакого `realtime/`, никакого WS-клиента, никакого CLI `run` до Phase 6. Multi-symbol параллелизм — Phase 7.
- **Ключевые открытые вопросы.** Надёжный поток **свечей** (catch-up, обрывы WS); при наличии индикаторного контура в core — как seed-ить indicator-стрим, хранить ли state между запусками. Конкретные пороги latency, watchdog-интервалы — уровень детального ТЗ Phase 6, не мастер-плана.

### Phase 7 — API & Multi-Symbol
- **Цель.** HTTP-API на чтение, авто-проверка вчерашних суток ежедневно, несколько пар одновременно в realtime.
- **Прикладной результат.** Фронт/research/curl читают данные по документированному контракту; оператор не дёргает БД руками каждое утро; одна машина обслуживает несколько пар.
- **Зависимости.** Phase 6.
- **Decision gates.** Нет жёстких ADR; конкретный JSON-контракт API фиксируется детальным ТЗ перед стартом фазы.
- **Что не делать раньше.** FastAPI, apscheduler, multi-symbol manager — всё только после Phase 6.
- **Ключевые открытые вопросы.** Точный JSON-контракт; нужна ли минимальная авторизация; стоит ли дробить фазу на несколько шагов (детали и точная декомпозиция — в `docs/phases/07_api.md`).

### Phase 8 — Exports & Polish
- **Цель.** Снимки данных для тяжёлой research-работы вне SQLite + production polish.
- **Прикладной результат.** Финиш слоя данных: можно строить торговые стратегии, не оглядываясь на надёжность данных.
- **Зависимости.** Phase 7.
- **Decision gates.** ADR-004 (Parquet export/read model).
- **Что не делать раньше.** `pyarrow`/Parquet, CI-pipeline, production-полировки — всё после Phase 7.
- **Ключевые открытые вопросы.** Структура дерева экспорта и его связь с `vectorbt`/`vectorbt-pro`; частота снимков; как работать с warmup/error-рядами индикаторов в Parquet. Конкретные пути, компрессия, длительность stability-run-а — уровень детального ТЗ Phase 8.

---

# Часть C — техническая часть для Cursor

## C1. Блок-схема системы (направление зависимостей)

```mermaid
flowchart LR
    cfg[config Settings] --> ctr[contracts Candle TimeWindow Gap FixReport]
    ctr --> store[store SQLite]
    ctr --> fetcher[fetcher REST WS]
    fetcher --> engine[engine DIM gaps quarantine]
    store --> engine
    engine --> indicators[indicators IBatch IStream Registry adapters]
    store --> indicators
    indicators --> realtime[realtime manager handlers watchdog]
    fetcher --> realtime
    engine --> realtime
    store --> service[service FastAPI read-only CLI scheduler]
    engine --> service
    store --> adapters[adapters vectorbt parquet]
```

> **Примечание.** Диаграммы отражают **возможную полную** систему (включая будущие слои индикаторов в core, realtime и API). **Сейчас после MVP** активный трек — **Strategy Constructor** в `research/` на чистых свечах и локальных расчётах; обязательный следующий слой «indicators в data_engine» из диаграммы **не** подразумевается.
>
> *Full-system diagram includes possible future indicator/realtime/API layers; current post-MVP active track is research Strategy Constructor.*

Запрещённые рёбра: `store -> fetcher`, `engine -> service`, `realtime -> service`, любые круговые импорты между слоями.

Поток данных в проде (актуально с Phase 6):

```mermaid
flowchart TD
    bybitREST[Bybit REST] --> dim[DIM fix_candles]
    bybitWS[Bybit WS] --> mgr[realtime Manager]
    dim --> store[(SQLite candles)]
    mgr --> store
    mgr --> indH[IndicatorHandler IStream via Registry]
    dim --> indB[fix_indicators IBatch via Registry]
    indH --> indStore[(SQLite indicators)]
    indB --> indStore
    store --> api[FastAPI read-only]
    indStore --> api
    api --> ui[Frontend]
    store --> vbt[adapters vectorbt]
    indStore --> vbt
    vbt --> research[research notebooks]
```

> Это **картина системы целиком**. Узлы `fix_indicators` / `IndicatorHandler` / `SQLite indicators` относятся к **опциональному** backend indicator layer (Phase 5); до decision gate realtime и research опираются на **свечи** и локальные расчёты в `research/`. В каждой конкретной фазе существуют только те узлы, которые уже введены — не «все сразу».

## C2. Правила перехода между фазами

Между фазами — git tag `phase-N-done`. Перейти к фазе N+1 разрешается, только если:

1. **Acceptance-критерии фазы N выполнены и автоматизированы** — либо чек в pytest/CI, либо документированный manual smoke с записанным результатом.
2. **Нет артефактов «временно положил руками»** — миграционные хаки, hard-coded пути, закомментированные тесты, TODO без owner-а.
3. **Diff фазы читается за один присест.** Если PR > 800 строк нового кода — фаза слишком крупная, разбиваем (см. право дробления Phase 7).
4. **Decision gate закрыт.** Если у фазы есть ADR-зависимость (ADR-001/002 **только если** принято начинать Phase 5; ADR-003 для Phase 6 — когда в scope входит индикаторный realtime из core; ADR-004 для Phase 8), соответствующий ADR должен быть написан и принят **до** старта реализации фазы. Post-MVP работа в `research/` (Strategy Constructor) **не** требует ADR-001/002 по умолчанию.
5. **Никаких импортов из будущих фаз.** Фаза N не должна импортировать модули из слоёв, которые ещё не существуют, и не должна «на всякий случай» добавлять заглушки.
6. **Никаких лишних зависимостей в `pyproject.toml`.** Каждая фаза добавляет ровно те, что заявлены в A5.

Это и есть защита от расползания: на каждом тэге система запускается на чистой машине и делает одно конкретное полезное действие.

## C3. Документы и где они живут

```
docs/
  00_master_plan.md                         # этот файл; стабильный
  research/
    strategy_constructor_master_plan.md     # post-MVP направление research-слоя
    01_strategy_family_skeleton.md          # Stage 1 family skeleton (research/)
  phases/
    01_foundation.md                        # детальное ТЗ Phase 1
    02_historical_backfill.md               # phase card / заглушка
    03_dim_repair.md                        # phase card / заглушка
    04_research_smoke.md                    # детальное ТЗ Phase 4 (MVP smoke)
    05_indicators.md                        # phase card / заглушка + ADR-001/002 gate
    06_realtime.md                          # phase card / заглушка + ADR-003 gate
    07_api.md                               # phase card / заглушка (с правом дробления 7A/7B/7C)
    08_exports_polish.md                    # phase card / заглушка + ADR-004 gate
  adr/
    ADR-001-indicator-backend.md            # future gate, если стартует Phase 5
    ADR-002-indicator-storage-shape.md      # future gate, если стартует Phase 5
    ADR-003-realtime-indicator-state.md     # future gate, если Phase 6 включает backend indicators
    ADR-004-parquet-export-model.md         # OPEN
```

Правило обновления:
- `00_master_plan.md` — стабилен. Меняется при пересмотре направления, не при работе над фазой.
- `docs/phases/0N_*.md` — заглушка превращается в детальное ТЗ **только когда стартует фаза N**, и не раньше.
- `docs/adr/ADR-NNN-*.md` — пишется перед стартом фазы, у которой стоит соответствующий decision gate (ADR-001/002/003 — только когда реально планируется backend indicators / их realtime; не требуются для работы в `research/`).
