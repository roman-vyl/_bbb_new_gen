# Step 15 — OHLC-aware Vectorbt Execution (Family Runner)

Связанный мастер-план: [`strategy_constructor_master_plan.md`](strategy_constructor_master_plan.md) (Step 15).  
Следующий смежный шаг: [`16_exit_reason_attribution_plan.md`](16_exit_reason_attribution_plan.md) (Step 16 — атрибуция `exit_reason` должна использовать те же OHLC, что и портфель).

---

## 1. Контекст

Сейчас family execution (`ema_pullback`, `run_strategy_spec`) может вызывать `vectorbt.Portfolio.from_signals` только с рядом **`close`**. В vectorbt при этом `open` / `high` / `low` по умолчанию выводятся из `close` (см. документацию `Portfolio.from_signals`: `nan` → замена на `close` / min-max из open и close).

Стопы (`sl_stop` / `tp_stop`) в движке оцениваются по **внутрибарному** диапазону (`open`, `high`, `low`). При close-only входе тени свечей не участвуют в симуляции так, как на реальных OHLC из Data Engine — расхождение с интуицией трейдера и с последующей **атрибуцией** выходов (Step 16), если она читает реальные high/low, а портфель — нет.

---

## 2. Цель шага

Перевести vectorbt execution с **close-only** на **OHLC-aware**: передавать в `Portfolio.from_signals` те же `open`, `high`, `low`, что уже есть в обогащённом фрейме после feature layer, **без** изменения семантики стратегии (логика сигналов/выходов в spec не меняется) и **без** изменения внешнего **config-контракта** (`StrategySpec`, YAML envelope, parsers).

---

## 3. Тип изменения — execution semantics

Step 15 — это **не** смена контракта стратегии и **не** косметика:

- **`StrategySpec` / config / parsers** — **не меняются**; внешний experiment config loader — **не трогаем**.
- Меняется только **семантика исполнения** в vectorbt: стопы видят реальный OHLC бара, поэтому **результаты backtest** (число сделок, точки выхода, equity, метрики) **могут измениться** относительно прежнего close-only режима — ожидаемо и допустимо.

Step 16 (exit_reason attribution) выполнять **уже поверх** этого OHLC-aware исполнения, с теми же рядами OHLC, что и портфель.

---

## 4. Scope (in)

- `research/strategies/ema_pullback/execution/backtest.py` (или единственная точка вызова `from_signals` для family): прокинуть `open=`, `high=`, `low=` из `enriched` рядом с `close`.
- **Fail-fast:** если в `enriched` отсутствуют колонки `open` / `high` / `low` (или они не приводимы к числовому ряду для vectorbt) — явная ошибка с понятным сообщением, **без** подстановки нулей и без молчаливого fallback на синтетический OHLC.
- Family README или короткая заметка: возможный **дрейф** equity / списка сделок относительно прошлого close-only прогона.

## 5. Non-goals (out)

В рамках Step 15 **не** менять:

- **order price policy** для `from_signals` (какие цены используются для исполнения сигнальных ордеров — оставить как сейчас, обычно опора на `close` и текущие аргументы вызова);
- **signal logic** (entries / exits / short_entries / short_exits и сбор сигналов);
- **features** (расчёт и план колонок);
- **exits** (`build_exit_outputs_from_spec`, агрегация `sl_stop`/`tp_stop`, boolean exits);
- **external config loader** и experiment layer;
- **`data_engine/`**.

Только прокидывание OHLC в vectorbt и тесты/док вокруг этого.

---

## 6. Обязательные тесты

1. **Targeted wiring test** (под `@pytest.mark.optional_vectorbt` или с моком `Portfolio.from_signals`): проверить, что `run_strategy_spec` при вызове передаёт в `Portfolio.from_signals` аргументы **`open`**, **`high`**, **`low`** вместе с **`close`** (те же объекты/серии по ссылке или по индексу и именам колонок, что пришли из `enriched` — формулировка теста должна быть устойчивой к рефактору, но однозначно ловить регресс «снова только close»).

2. **Fail-fast test:** фрейм без одной из колонок `open` / `high` / `low` после этапа, от которого зависит `enriched` в том же пути, что реальный раннер — `run_strategy_spec` должен завершаться ошибкой с ясным текстом (без падения глубоко внутри vectorbt с неочевидным trace).

3. Обновить существующие тесты / ожидаемые значения метрик или числа сделок там, где они жёстко зашиты под close-only baseline.

---

## 7. Поведение vectorbt (напоминание)

`open` / `high` / `low` в `from_signals` используются **только** для стоп-сигналов; **order price policy** для обычных сигналов в этом шаге **не меняем** (см. §5). После шага симуляция стопов становится сопоставима с реальным диапазоном бара.

---

## 8. Acceptance

- `pytest` зелёный; тесты из §6 присутствуют и проходят.
- Один явный прогон `ema_pullback` на известном датасете: при необходимости зафиксировать в коммите/заметке смену baseline относительно close-only.

---

## 9. Связанные файлы

- [`research/strategies/ema_pullback/execution/backtest.py`](../../research/strategies/ema_pullback/execution/backtest.py) — вызов `Portfolio.from_signals`.
- Обогащённый OHLCV после [`add_feature_columns_from_plan`](../../research/strategies/ema_pullback/features/calculations.py) / `run_strategy_spec`.
