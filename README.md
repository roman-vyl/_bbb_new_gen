# Data Engine

Минимальный фундамент проекта на Phase 1.

Что умеет сейчас:
- создать SQLite базу с базовой схемой;
- проверить контракт схемы;
- показать состояние базы командой `status`.

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
