# Phase 2 — Historical Backfill (phase card / заглушка)

> Это **короткая phase card**, не детальное ТЗ. Превратить в детальное ТЗ — только когда стартует Phase 2 и Phase 1 закрыта тэгом `phase-1-done`.
>
> До тех пор: считать этот файл архитектурным ориентиром, не списком задач.

## Цель

`python -m data_engine backfill --symbol BTCUSDT --tf 1h` загружает всю историю Bybit от реального `launchTime` до текущего часа. Повторный запуск идемпотентен: тот же `actual_count`, никаких ошибок интеграции.

## Прикладной результат

Одна команда — вся история одной пары/TF в БД, без ручной работы и без мифических «5 лет назад».

## Зависимости

- Phase 1 (Settings, Db, CLI-точка входа).

## Предварительное направление

- `fetcher/base.py` — `IFetcher` Protocol (`fetch_candles`, `get_history_depth`).
- `fetcher/bybit_rest.py` — REST с чанкингом 200, ретраи через `tenacity`. Никакой DIM-логики внутри фетчера.
- `fetcher/depth_resolver.py` — `instruments-info.launchTime`, кеш в `meta`.
- `engine/time_grid.py` — `align_to_grid`, `tf_ms`, `next_close_ms`.
- `contracts/` — впервые появляются: `Candle`, `TimeWindow(start_ms, end_ms)` (frozen, инвариант `start_ms < end_ms`), `FetchRequest`. До Phase 2 их нет.
- **`Db` расширяется тремя методами одновременно** — `upsert(rows)`, `range_get(symbol, tf, window) -> list[Candle]`, `max_open_time_ms(symbol, tf) -> int | None`. Это явный приём: `range_get` нужен уже здесь (для self-проверки backfill-а — пересчитать ожидаемый/фактический count и убедиться, что нет наивных дыр) и потом переиспользуется в Phase 4 (research) и Phase 7 (read-only API). Делать `range_get` отдельной фазой не имеет смысла.
- `MetaStore`-функциональность пока живёт прямо в `Db` (метод `set_launch_time_ms(symbol, ts)`); отдельные классы `CandleStore/MetaStore/QuarantineStore` появятся, только если расщепление действительно понадобится (не раньше Phase 5).
- `service/cli.py::backfill` — наивный цикл `while window not done: fetch -> upsert`. Без gap-detection и без quarantine — это Phase 3.

## Открытые вопросы

- Какие TF поддерживаются на старте? Минимум `1h`; `1m`/`5m`/`1d` — достаточно ли «работает или нет», или нужны отдельные acceptance.
- Параметры ретраев (`tenacity`): количество попыток, exp backoff base. Решается при написании ТЗ.
- Поведение при разрыве в середине backfill-а: `Ctrl+C` → продолжаем с последнего успешного chunk-а или начинаем заново. Решается при написании ТЗ.

## Что не делать раньше Phase 2

- Никакого `engine/gaps.py` или `engine/dim.py` — это Phase 3.
- Никакого quarantine-флоу для неудачных чанков — это Phase 3.
- Никакого WS-клиента — это Phase 6.
- Никакого FastAPI/scheduler/parquet — это Phase 7/7/8.

## Что точно не трогать в Phase 2

- DDL `candles`, `schema_meta` и контракты Phase 1 фиксированы. Любые изменения схемы — отдельным явным решением, без скрытых правок в backfill-задаче.
- Не добавлять колонку «откуда пришла свеча» / «retry count» в `candles`. Если такие данные нужны — `meta` или `quarantine`.

---

> При старте Phase 2 этот файл расширяется до того же уровня детализации, что и `01_foundation.md`: Allowed/Forbidden files, тесты по именам, acceptance-чеклист, command-вывод. Не раньше.
