# Research Stage 3 — Strategy Config / Instance (детальное ТЗ)

> **Трек:** post-MVP research, Strategy Constructor — **шаг 3** после Stage 2 decomposition pipeline.  
> **Предпосылка:** в `research/strategies/ema_pullback/` уже есть family pipeline: `features / direction / blockers / setup / triggers / exits / risk / signals composer`.  
> **Статус документа:** спецификация для реализации в отдельной задаче; код в этом ТЗ не реализуется.

---

## 1. Цель этапа

### 1.1 Прикладная цель

Сделать каждый запуск strategy family **явно конфигурируемым, воспроизводимым и идентифицируемым** через стабильный `config_id`, чтобы:

- один и тот же набор параметров всегда давал один и тот же идентификатор;
- изменение значимого параметра приводило к новому `config_id`;
- в выводе запуска было видно, **что именно** запускалось (`family`, `variant`, `symbol`, `timeframe`, `config_id`).

### 1.2 Техническая цель

- формализовать immutable `StrategyConfig` для `ema_pullback`;
- ввести deterministic вычисление `config_id` из нормализованного содержимого config;
- ввести `StrategyInstance` как связку `config + config_id` без runtime-state;
- интегрировать `config`/`instance` в `run.py` без изменения торговой логики;
- сохранить существующий `status=ok` и finite metric guard;
- подготовить основу для Stage 4 manual variants (без реализации variants в Stage 3).

### 1.3 Явно не цель этапа

- менять правила входа/выхода, directional-логику, риск-логику как торговую математику;
- вводить registry/grid/optimizer/framework;
- переходить к внешним YAML/JSON конфигам;
- трогать `data_engine/`.

---

## 2. Scope и ограничения

### 2.1 In scope

1. Используется текущая family: `research/strategies/ema_pullback/`.
2. Добавляется и/или дорабатывается:
   - `research/strategies/ema_pullback/config.py`
   - опционально `research/strategies/ema_pullback/instance.py`
   - `research/strategies/ema_pullback/run.py`
   - тесты для config/config_id/instance/run compatibility
   - документация Stage 3.
3. Разрешены простые CLI overrides:
   - `--symbol`
   - `--tf`
   - `--db-path`
   - `--ema-fast`
   - `--ema-slow`
   - `--init-cash`
   - `--fees`
   - `--slippage`

### 2.2 Out of scope (Forbidden)

- `variants.py`
- `registry.py`
- component grid
- optimizer
- result table
- YAML/JSON config files
- общий `research/common` framework
- любые изменения в `data_engine/`
- backend indicators
- live trading

---

## 3. Deliverables (ожидаемые изменения)

| Файл | Назначение |
|------|------------|
| `research/strategies/ema_pullback/config.py` | Immutable config-контракт + deterministic `config_id`. |
| `research/strategies/ema_pullback/instance.py` (опц.) | `StrategyInstance` как контейнер `config + config_id`. |
| `research/strategies/ema_pullback/run.py` | Использование config/instance, печать контекста запуска с `config_id`. |
| `tests/...` | Покрытие стабильности `config_id`, контракта instance и работоспособности run/smoke. |
| `docs/research/03_strategy_config_instance.md` | Настоящее ТЗ. |

---

## 4. Контракт Strategy Config

### 4.1 Общие требования

- Конфигурация должна быть **immutable** (например `@dataclass(frozen=True)`).
- Конфигурация должна быть **явной**: все значимые параметры запуска в одном объекте.
- Конфигурация должна быть сериализуема в нормализованный вид для хеширования.
- Значения по умолчанию допускаются, но не должны прятать значимые параметры вне config.

### 4.2 Минимальный набор полей

Обязательные поля:

- `family`
- `variant`
- `symbol`
- `timeframe`
- `db_path` (optional)
- `ema_fast`
- `ema_slow`
- `init_cash`
- `fees`
- `slippage`

Рекомендуемые базовые инварианты:

- `family` фиксируется как `"ema_pullback"` (или валидируется как такое значение);
- `variant` — строка (на Stage 3 допускается один baseline variant);
- `ema_fast > 0`, `ema_slow > 0`, `ema_fast < ema_slow` (если этот инвариант уже ожидается логикой family);
- `init_cash > 0`;
- `fees >= 0`, `slippage >= 0`.

### 4.3 Поля периода (deferred)

Date range допускается только как **deferred design note**:

- можно оставить комментарий/TODO в `config.py`;
- не реализовывать сложный периодный DSL, timezone-логику и внешние профили периода;
- не блокировать Stage 3 из-за отсутствия range-конфигуратора.

---

## 5. Контракт deterministic `config_id`

### 5.1 Требования

- `config_id` deterministic.
- Считается из **нормализованного содержимого** config.
- Один и тот же config всегда даёт одинаковый id.
- Любое изменение значимого параметра меняет id.
- Формат short id: первые `10–12` символов от `sha1`/`sha256` (hex).

### 5.2 Нормализация (обязательная семантика)

Нужно зафиксировать единый алгоритм:

1. Получить map значимых полей config.
2. Нормализовать `None`/числа/строки предсказуемо (без платформо-зависимого repr).
3. Канонически сериализовать (например JSON с `sort_keys=True`, компактными separators).
4. Посчитать hash.
5. Усечь до short id.

Важно:

- `config_id` не должен зависеть от порядка ключей в исходном dict;
- `config_id` не должен включать runtime-поля, время запуска, случайные значения;
- если в config есть поля, не влияющие на поведение прогона, нужно явно задокументировать, входят ли они в hash.

### 5.3 Значимые поля для Stage 3

По умолчанию в hash входят все минимальные поля из §4.2.  
Если какие-то поля сознательно исключаются, это должно быть явно объяснено в docstring/комментарии рядом с реализацией.

---

## 6. Контракт Strategy Instance

### 6.1 Смысл

`StrategyInstance` — объект идентичности запуска:

- связывает `config`;
- содержит derived `config_id`;
- служит явной точкой передачи контекста в `run.py`.

### 6.2 Форма

Допустимы оба варианта:

1. Отдельная immutable dataclass (`instance.py`).
2. Helper-функция/тип в `config.py`.

Выбор зависит от читаемости, но контракт обязателен.

### 6.3 Ограничения

- Не хранить mutable runtime state.
- Не хранить `vectorbt` portfolio внутри instance.
- Не добавлять в instance результаты бэктеста/метрики как внутреннее состояние.

---

## 7. Требования к `run.py`

`run.py` после Stage 3:

1. Использует `StrategyConfig` и `StrategyInstance` (или эквивалент helper).
2. Печатает как минимум:
   - `family`
   - `variant`
   - `config_id`
   - `symbol`
   - `timeframe`
3. Сохраняет текущий `status=ok` behavior.
4. Сохраняет finite metric guard.
5. Оставляет `vectorbt` только в runner-слое (как и сейчас по архитектуре family).
6. Не меняет торговую логику, сигналы и pipeline-компоненты.

---

## 8. CLI overrides (Stage 3)

### 8.1 Базовый вариант (предпочтительный)

Поддержать прямые overrides через аргументы:

- `--symbol`
- `--tf`
- `--db-path`
- `--ema-fast`
- `--ema-slow`
- `--init-cash`
- `--fees`
- `--slippage`

Семантика:

- сначала создаётся default config;
- затем применяются CLI overrides;
- затем рассчитывается `config_id` уже по финальному config.

### 8.2 Допустимая отсрочка

Если полный набор overrides раздувает объём Stage 3:

- разрешено сделать часть флагов optional внутри Stage 3;
- обязательно задокументировать, какие флаги реализованы сейчас, а какие отложены;
- не уходить во внешние config-файлы (YAML/JSON) ради компенсации.

---

## 9. Тест-план

Минимальные тесты:

1. `same config -> same config_id`.
2. Изменение `ema_fast` или `fees` -> `different config_id`.
3. `config_id` стабилен независимо от порядка ключей dict-представления.
4. `StrategyInstance` экспонирует `config_id`.
5. `run.py` по-прежнему работает.
6. `research/ema_smoke.py` по-прежнему работает.
7. Boundary: `data_engine` untouched, нет registry/grid/framework.

Рекомендации по уровням:

- unit: hash/normalization/config invariants;
- unit: instance contract;
- integration/smoke: `run.py`/`ema_smoke.py` статус и печать `config_id`;
- boundary guard: отсутствие запрещённых артефактов Stage 4+.

---

## 10. Acceptance criteria

Обязательные проверки:

1. `python -m pytest -q`
2. `python research/strategies/ema_pullback/run.py`  
   Ожидается: `status=ok` и напечатан `config_id`.
3. `python research/ema_smoke.py`  
   Ожидается: `status=ok`.
4. `git diff --stat data_engine/`  
   Ожидается: пусто.

Дополнительно:

- нет изменений торговой логики family;
- нет новых компонентных слоёв за пределами Stage 2;
- нет перехода к external config files.

---

## 11. Риски и анти-паттерны

Нужно явно избежать:

- `config_id` из `str(dict)` без канонической сортировки ключей;
- зависимость `config_id` от нестабильного float formatting;
- смешивание runtime-состояния и identity-состояния в одном объекте;
- «тихие» параметры в `run.py`, которые не входят в config, но влияют на поведение;
- скрытое изменение strategy logic под видом config refactor.

---

## 12. Результат Stage 3 в контексте Stage 4

После выполнения Stage 3 система должна быть готова к Stage 4 manual variants:

- есть стабильный identity layer (`config_id`);
- запуск стратегии воспроизводим по явному config;
- параметры baseline можно безопасно менять без переписывания стратегии;
- сравнение ручных вариантов становится операционно возможным.

При этом Stage 4 сущности (`variants.py`, registry, grid, optimizer) остаются вне текущего этапа.

---

## Implementation summary
Status: pending

