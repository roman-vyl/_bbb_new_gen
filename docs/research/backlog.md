# Бэклог (research)

## Технический долг перед серьёзными MTF-экспериментами

### 2. ATR / RSI / features на lower timeframe

Сейчас опасное место:

- `base_timeframe = 1h`
- feature timeframe = 15m / 5m

Из 1h свечей нельзя честно получить 15m или 5m. Higher timeframe через resample можно:

- 1h → 4h — ок
- 1h → 1d — ок

А lower timeframe надо либо:

- **а)** временно запретить fail-fast  
  либо:
- **б)** делать настоящий MTF data loading

**Минимальный безопасный TODO:** запретить lower-timeframe features до появления MTF loader.

---

## Мелкие хвосты / решения

### 3. Политика no-exit mode

Надо решить, что делать с конфигом вида:

```yaml
exits: []
```

или:

```yaml
exits:
  - instance_id: no_signal_exit
    component_id: no_signal_exit
```

Сейчас это потенциально может означать «позиция висит до конца истории». Нужно либо запретить во внешнем config, либо явно ввести `no_exit_mode`.

**Предпочтение:** запретить пока.

### 4. Усилить OHLC validation

Step 15 принят, но можно косметически усилить:

- `open` / `high` / `low` должны быть finite
- не только not NaN, но и не `inf` / `-inf`

Не срочно.

### 5. Fixed USD exits — доп. negative test

Фиксированный стоп/тейк в USD принят. Неблокирующий тест на потом:

- external config: `usd_distance <= 0` → validation error
