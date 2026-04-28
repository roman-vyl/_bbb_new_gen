# Data Engine

Минимальный фундамент проекта с историческим backfill из Phase 2.

Что умеет сейчас:
- создать SQLite базу с базовой схемой;
- проверить контракт схемы;
- показать состояние базы командой `status`;
- загрузить исторические свечи Bybit linear командой `backfill`.
- починить свечные дыры в historical window командой `fix`.

## Быстрый старт

```bash
pip install -e .[dev]
python -m data_engine status
```

Пример вывода:

```text
db_path: ./market.sqlite
schema_version: 1
schema_meta: 1
candles: 0
meta: 0
quarantine: 0
contract: ok
```

## Historical Backfill

Manual smoke для Phase 2:

```bash
python -m data_engine backfill --symbol BTCUSDT --tf 1h
```

Команда грузит закрытые свечи Bybit `linear` от `launchTime` инструмента до последней полностью закрытой свечи выбранного таймфрейма.

## DIM Repair (Phase 3)

```bash
python -m data_engine fix --symbol BTCUSDT --tf 1h
```

CLI-обертка строит historical window и делегирует ремонт в `fix_candles(...)`, включая preflight/postflight проверку gaps, read-only OHLC validation и freshness check последней закрытой свечи.
