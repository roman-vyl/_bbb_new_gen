# Data Engine Phase 5 — Multi-timeframe Data Availability

## Цель

Сделать поддержку нескольких таймфреймов официальной частью Data Engine.

Data Engine должен стабильно готовить clean candles не только для `1h`, но и для whitelisted набора таймфреймов.

Пример целевого набора Phase 5:

```text
5m
15m
1h
4h
1d
```

Главная граница:

```text
Data Engine готовит clean candles по symbol/timeframe.
Research-layer сам решает, как использовать разные таймфреймы.
```

---

## Что делаем

### 1. Единый whitelist таймфреймов

Зафиксировать один источник правды для supported timeframes:

```text
SUPPORTED_TIMEFRAMES = 5m, 15m, 1h, 4h, 1d
```

Нужны общие функции/контракты:

```text
validate_timeframe(tf)
timeframe_ms(tf)
bybit_interval(tf)
```

Bybit interval mapping:

```text
5m  -> 5
15m -> 15
1h  -> 60
4h  -> 240
1d  -> D
```

Не должно быть нескольких независимых словарей таймфреймов в разных слоях.

---

### 2. CLI validation

Команды Data Engine должны принимать только whitelisted TF.

Минимально проверить:

```text
backfill --tf
fix --tf
status --tf, если применимо
```

Unsupported timeframe должен падать с понятной ошибкой.

---

### 3. Backfill по разным TF

Backfill должен работать для каждого whitelisted timeframe:

```bash
python -m data_engine backfill --symbol BTCUSDT --tf 5m
python -m data_engine backfill --symbol BTCUSDT --tf 15m
python -m data_engine backfill --symbol BTCUSDT --tf 1h
python -m data_engine backfill --symbol BTCUSDT --tf 4h
python -m data_engine backfill --symbol BTCUSDT --tf 1d
```

В acceptance не обязательно гонять полный исторический backfill для всех TF.  
В тестах использовать fake fetcher/client.

---

### 4. DIM / gap repair по TF

DIM должен работать отдельно для каждой пары:

```text
symbol + timeframe
```

Gap repair для `BTCUSDT 5m` не должен трогать `BTCUSDT 1h`.

---

### 5. Storage separation

DB уже должна хранить свечи с ключом:

```text
symbol + timeframe + open_time_ms
```

Phase 5 должен тестами подтвердить, что один и тот же symbol на разных TF не смешивается.

Пример:

```text
BTCUSDT 5m
BTCUSDT 1h
```

должны иметь независимые candle ranges/counts.

---

### 6. Status / visibility

Нужен минимальный read-only способ увидеть состояние по `symbol/timeframe`.

Например:

```bash
python -m data_engine status --symbol BTCUSDT --tf 1h
python -m data_engine status --symbol BTCUSDT --tf 5m
```

Если старый общий `status` уже есть — не ломать его.

---

### 7. Research loader contract

Research-layer должен иметь возможность запросить clean candles для нужного TF:

```text
load/range_get(symbol, timeframe, ...)
```

Phase 5 не добавляет multi-timeframe strategy logic.  
Он только гарантирует, что данные по разным TF можно получить отдельно и корректно.

---

## Что не делаем в Phase 5

```text
strategy logic
HTF/LTF feature alignment
RSI/EMA indicators backend
vectorbt logic
frontend
optimizer/grid
realtime
scheduler
live trading
```

---

## Тесты

Минимальные тесты Phase 5:

```text
supported timeframe whitelist
unsupported timeframe fails clearly
bybit interval mapping
timeframe_ms mapping
DB separates same symbol across TF
backfill works with non-1h TF on fake fetcher
DIM/fix or gap planning works with non-1h TF
status/backfill old behavior not broken
```

---

## Acceptance commands

```bash
python -m pytest -q
python -m data_engine status
git diff --stat data_engine/
git status -sb
```

Полный historical backfill для всех TF не является обязательным acceptance, если он занимает слишком много времени.

---

## Критерий готовности

Phase 5 готова, если:

```text
1. Есть единый whitelist supported TF.
2. Backfill принимает whitelisted TF.
3. Unsupported TF отклоняется.
4. DB не смешивает разные TF.
5. DIM/gap repair работает по symbol/timeframe.
6. Status показывает состояние по symbol/timeframe или не ломает старый status.
7. Research может запросить clean candles нужного TF.
8. Все тесты проходят.
9. Research strategy logic не менялась.
```
