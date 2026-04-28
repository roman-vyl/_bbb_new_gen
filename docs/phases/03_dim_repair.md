# Phase 3 — DIM Repair (phase card / заглушка)

> Короткая phase card. Расширить до детального ТЗ — только когда стартует Phase 3.

## Цель

`python -m data_engine fix --symbol BTCUSDT --tf 1h` приводит БД к контракту `gaps_after = []`, даже если внутри есть дыры или БД пустая.

## Прикладной результат

Авто-«ремонтник» данных: какой бы ни была БД (пустая, дырявая, с вырезанным диапазоном) — одна команда лечит её до состояния «всё на месте, OHLC валиден, свежесть в норме». Magic-значения `-1` в БД больше не появляются.

## Зависимости

- Phase 1 (Settings, Store).
- Phase 2 (`IFetcher`, `time_grid`, `Store.upsert`).

## Предварительное направление

- `engine/gaps.py` — `find_gaps_linear(timestamps, tf_ms, window) -> list[Gap]`. **Единственная** реализация поиска дыр в проекте. Покрывается property-based тестами (hypothesis).
- `engine/quarantine.py` — `QuarantineStore.put(reason, payload)`.
- `engine/dim.py::fix_candles(symbol, tf, window)` — двухфазный (preflight → fix → postflight), без рекурсии:
  - preflight: `find_gaps_linear` + `validate_window_aligned`.
  - fix: для каждой `Gap` — `IFetcher.fetch_candles(window=gap)` + upsert одной транзакцией; на N неудачных ретраях — батч в `quarantine`, продолжаем.
  - postflight: `find_gaps_linear` снова + OHLC-валидация одним SQL (`high>=low`, цены>0, volume>=0) + freshness check.
- `service/cli.py::fix --symbol [--tf] [--from] [--to]`.

## Открытые вопросы

- Формат отчёта `FixReport` (JSON в `reports/fix_*.json`?) — что туда попадает: окно, список дыр, что закрылось, что в quarantine.
- Параметры freshness check (что считать «слишком старой» БД).
- Нужен ли `--dry-run` режим в Phase 3 или достаточно postflight-а.

## Что не делать раньше Phase 3

- Никакого indicator-слоя, даже интерфейсов — это Phase 5.
- Никакого WS/realtime — это Phase 6.
- Никакого scheduler-а / FastAPI / parquet — это Phase 7/7/8.

## Что точно не трогать в Phase 3

- Не создавать второй алгоритм поиска дыр «для realtime». Один `find_gaps_linear`, и точка.
- Не вводить magic-значения для «недостающей» свечи. Если свечу не получили — она просто отсутствует в `candles`; диагностика идёт в `quarantine`.
- Не делать `fix_candles` рекурсивным («после fix снова нашли дыры — снова fix»). Двухфазно. Если postflight нашёл новые дыры — это failed fix, репорт в `quarantine` и наружу.

---

> При старте Phase 3 этот файл расширяется до детального ТЗ. Не раньше.
