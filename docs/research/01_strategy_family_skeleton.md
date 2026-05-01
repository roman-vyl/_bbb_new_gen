# Research Stage 1 — Strategy Family Skeleton (детальное ТЗ)

> **Трек:** post-MVP research, Strategy Constructor — **шаг 1** из `docs/strategy_constructor_master_plan.md` (§5 «Step 1 — Strategy Family Skeleton»).  
> **Статус документа:** спецификация для реализации; код по этому ТЗ пишется в отдельной задаче.

---

## 1. Цель этапа

**Прикладная цель:** вынести логику smoke-бэктеста из монолитного `research/ema_smoke.py` / `research/ema_smoke_helpers.py` в **первую изолированную strategy family** с предсказуемой структурой модулей, сохранив поведение конвейера «SQLite → свечи → индикаторы в research → `vectorbt` → метрики в stdout».

**Техническая цель:** зафиксировать **шаблон каталога** `research/strategies/<family>/` и разделение ответственности **`features` → `signals` → `run`**, при этом заложить в **`config.py`** форму данных, которую на следующих этапах можно эволюционировать до полноценного `StrategyConfig` (family / variant / instance) **без** переписывания ядра стратегии.

**Не цель этапа:** улучшать торговую логику, вводить ATR/направленность как новую математику, registry компонентов, component grid, optimizer, общий Strategy Constructor framework, запись результатов в БД, новые API в `data_engine/`.

---

## 2. Границы scope (явные запреты)

В рамках реализации по этому ТЗ **запрещено**:

| Запрет | Комментарий |
|--------|-------------|
| Изменения в `data_engine/` | Ни кода, ни контрактов store, ни DDL под research. Чтение данных только через **существующие** публичные API (как в Phase 4 smoke). |
| Registry стратегий или компонентов | Нет `STRATEGY_REGISTRY`, нет `DIRECTION_REGISTRY` и т.п. |
| Component grid / перебор комбинаций | Один прогон — одна конфигурация. |
| Optimizer | Нет подбора параметров, нет optuna и аналогов. |
| Общий framework «Strategy Constructor» | Нет общего базового класса стратегии, нет универсального runner’а вне family (кроме стандартного `if __name__ == "__main__"` в `run.py`). |
| Несколько variants в коде | Один логический variant, один объект конфигурации по умолчанию. Имена `variant` в конфиге могут быть **зарезервированы** полем/константой для будущего использования. |

**Разрешено:** новые файлы под `research/strategies/`, точечные правки `research/ema_smoke.py` и/или `research/ema_smoke_helpers.py` **только если** это устраняет дублирование с family (см. §10). Правки `pyproject.toml`, `tests/` — если нужны для пакетирования и тестов (см. §8).

---

## 3. Имя family и смысл «скелета»

**Каталог family:** `research/strategies/ema_atr_directional/`.

- Имя отражает **целевое** семейство из мастер-плана (тренд/направление + ATR-контекст).  
- На **Stage 1** допускается и **ожидается**, что **реализованная** логика совпадает с текущим Phase 4 smoke: **EMA crossover** (иллюстративная стратегия), без обязательной реализации ATR-фильтров и «directional» правил.  
- Явно задокументировать в docstring пакета/модуля family: *«Stage 1: skeleton + EMA crossover parity with `ema_smoke`; ATR/directional blocks — future stages.»*

Таким образом, этап про **организацию кода и контракт конфига**, а не про новую альфу.

---

## 4. Deliverables (файлы)

Все пути — от корня репозитория.

| Файл | Назначение |
|------|------------|
| `research/strategies/__init__.py` | Делает `research.strategies` обычным пакетом (может быть пустым или с кратким описанием). |
| `research/strategies/ema_atr_directional/__init__.py` | Пакет family; экспорт не обязателен. |
| `research/strategies/ema_atr_directional/config.py` | Единственный «источник правды» для параметров прогона и стратегии на этом этапе. |
| `research/strategies/ema_atr_directional/features.py` | Чистые функции: из OHLCV/DataFrame строят признаки (индикаторы), **без** `vectorbt`. |
| `research/strategies/ema_atr_directional/signals.py` | Чистые функции: из фич строят boolean Series входа/выхода, **без** `vectorbt`. |
| `research/strategies/ema_atr_directional/run.py` | CLI/entrypoint: БД → свечи → features → signals → портфель → stdout. |

**Запрещённый deliverable:** отдельный `registry.py`, `optimizer.py`, `framework.py` внутри family на этом этапе.

---

## 5. Контракт модулей

### 5.1 `config.py`

- Один тип конфигурации (например `EmaAtrDirectionalConfig` или нейтральное `StrategyRunConfig`), описывающий **как минимум**:
  - идентификаторы прогона: `family` (строка, константа `"ema_atr_directional"`), `variant` (строка, напр. `"ema_crossover_baseline"`) — для будущего `config_id`;
  - рынок: `symbol`, `timeframe` (строки, те же конвенции, что в Phase 4, напр. `BTCUSDT`, `1h`);
  - путь к БД: опциональный override; если `None` — как в smoke, через `Settings().db_path`;
  - параметры фич: периоды EMA (`fast`, `slow`), согласованные с именами колонок в `features.py`;
  - при необходимости: заглушки под будущие поля (`fees`, `slippage`, `date_range`) — **опционально**, не обязаны использоваться в Stage 1, но тип/комментарий фиксирует путь к `StrategyConfig`.
- Рекомендация: использовать **`pydantic.BaseModel`** (уже в зависимостях проекта) или `@dataclass(frozen=True)` — выбрать один стиль и придерживаться его в family.
- Экспорт **одной** «дефолтной» конфигурации для CLI (например `DEFAULT_CONFIG` или функция `default_config() -> ...`), чтобы `run.py` не содержал магических чисел.

### 5.2 `features.py`

- Вход: `pd.DataFrame` с колонками OHLCV в том виде, который получается после преобразования списка `Candle` (как сейчас в `candles_to_ohlcv_dataframe`).
- Обязательная функция (имена могут быть уточнены при реализации, но роль должна совпадать):
  - построение EMA на `close` с `ewm(span=..., adjust=False).mean()`;
  - имена колонок предсказуемы и согласованы с `config` (например `ema_{fast}`, `ema_{slow}`).
- Допускается вынести **`candles_to_ohlcv_dataframe`** сюда или в небольшой `research/strategies/_io.py` **только для research** — если это уменьшает дублирование; **не** переносить в `data_engine/`.
- Запрет: импорт `vectorbt` в этом модуле.

### 5.3 `signals.py`

- Вход: DataFrame с колонками фич + те же индексы, что у цены.
- Логика на Stage 1: **то же семантическое правило**, что `ema_crossover_signals` в `ema_smoke_helpers`: пересечение вверх — вход, вниз — выход; использовать `shift(1)` так, чтобы **первая строка не давала сигнал** (как в существующих тестах).
- Выход: `tuple[pd.Series, pd.Series]` — `(entries, exits)`, dtype boolean, выровнены по индексу.
- Запрет: импорт `vectorbt`.

### 5.4 `run.py`

- Должен быть исполняемым так же, как `research/ema_smoke.py`: при запуске из корня репозитория корректно резолвится импорт пакета `research` (при необходимости — тот же приём с `sys.path` и `_ROOT = Path(__file__).resolve().parents[N]`, где `N` учитывает глубину вложенности).
- Шаги **в явном порядке**:
  1. Разбор аргументов CLI (минимум: `--symbol`, `--tf`, `--db-path`; дефолты согласовать с `config` или переопределять поля конфига после парса).
  2. `Settings`, при необходимости override `db_path`.
  3. `Db`, `health()["contract"] == "ok"` — иначе завершение с ненулевым кодом и понятным сообщением.
  4. `min_open_time_ms` / `max_open_time_ms`, `TimeWindow`, `range_get` — как в smoke; валидация минимального числа свечей.
  5. Конвертация в DataFrame → `features` → `signals`.
  6. Проверки: нет NaN в `close`, нет NaN в используемых EMA на всём ряду прогона (те же инварианты, что smoke).
  7. `vectorbt.Portfolio.from_signals` с **`freq`** по маппингу timeframe → pandas offset (логика как `pd_freq_alias` в `ema_smoke.py`).
  8. Печать метрик и **статуса** (см. §7).
- Зависимость `vectorbt` — только здесь (и в opt-тестах), с тем же пользовательским сообщением при отсутствии extra, что в `ema_smoke.py`.

---

## 6. Вывод в stdout и «status ok»

Минимальный набор строк (можно дополнять, но нельзя убирать смысл):

- Строка с контекстом: symbol, tf, число свечей, при желании — `family` и `variant` из конфига.
- Метрики (как минимум те же три, что в smoke):
  - Sharpe (freq-aware);
  - `profit_factor` с `pf.trades`;
  - `max_drawdown`.
- Финальная строка, по которой автоматизация и человек однозначно видят успех, например:
  - `status=ok`

При ошибках контракта БД, отсутствии данных, NaN — **не** печатать `status=ok`; код выхода ≠ 0.

---

## 7. Acceptance criteria

| Критерий | Проверка |
|----------|----------|
| Запуск из корня репозитория | `python research/strategies/ema_atr_directional/run.py` завершается с кодом 0 на валидной БД MVP (данные для `BTCUSDT` / `1h` или то, что переопределено флагами). |
| Метрики и статус | В stdout присутствуют численные метрики (не NaN) и маркер успеха согласно §6. |
| Тесты | `pytest` зелёный в конфигурации проекта (включая маркер `optional_vectorbt`, если он используется для интеграционного теста портфеля). |
| Data engine | Нет изменений в дереве `data_engine/`. |
| Ограничения Stage 1 | Нет registry, grid, optimizer, общего constructor framework в новом коде. |

---

## 8. Тестирование

- **Unit-тесты** (без `vectorbt`): импорты из `research.strategies.ema_atr_directional.features` и `.signals`; сценарии аналогичны `tests/test_ema_smoke_helpers.py` (длина OHLCV, типы сигналов, отсутствие NaN в EMA на синтетике, первая строка без сигнала).
- **Интеграция (опционально):** маркер `optional_vectorbt`, минимальный портфель из синтетических свечей — по аналогии с существующим тестом.
- **Регрессия политики Phase 4:** `tests/test_phase4_boundaries.py` по-прежнему запрещает `vectorbt` внутри `data_engine/` и лишние пути; после изменений дерево `data_engine/` не трогаем.
- Решение по **миграции** `tests/test_ema_smoke_helpers.py`: либо перенаправить импорты на новые модули family и оставить файл как тест совместимости, либо переименовать/дублировать тесты под family — зафиксировать в PR так, чтобы не было двух расходящихся реализаций одной и той же математики.

---

## 9. Зависимости и окружение

- Без новых обязательных зависимостей сверх текущих: `pandas` / `numpy` / `vectorbt` остаются в extra `research` (`pyproject.toml`).
- Переменные окружения и `Settings`: тот же контракт, что у CLI движка (`DATA_ENGINE_DB_PATH` и пр., см. `data_engine.config.Settings`).

---

## 10. Отношение к `research/ema_smoke.py`

Цели:

- **Не плодить** две независимые реализации EMA crossover.
- Сохранить **обратную совместимость** команды Phase 4: `python research/ema_smoke.py` желательно оставить рабочей до явного решения удалить её.

Рекомендуемая политика (выбрать одну при реализации и отразить в коммите):

1. **Предпочтительно:** `ema_smoke.py` становится тонкой обёрткой: импортирует `run.main` или общие хелперы из `ema_atr_directional`, либо делегирует в тот же pipeline.  
2. **Допустимо:** `ema_smoke_helpers.py` реэкспортирует функции из family для старых импортов, пока тесты не переключены.

Запрещено по смыслу этапа: оставить в family одну реализацию, а в `ema_smoke_helpers` другую с расходящейся семантикой.

---

## 11. Чеклист перед merge

- [ ] `research/strategies/ema_atr_directional/{config,features,signals,run}.py` присутствуют.
- [ ] `python research/strategies/ema_atr_directional/run.py` → метрики + `status=ok`.
- [ ] `pytest` green.
- [ ] `git diff --stat data_engine/` пустой.
- [ ] Нет новых модулей registry/optimizer/framework.
- [ ] Документация в коде family объясняет, что ATR/directional — следующие этапы.

---

## 12. Следующие этапы (вне scope данной задачи)

- Декомпозиция pipeline на direction / blockers / setup / trigger / exit / risk (`docs/strategy_constructor_master_plan.md`, Step 2).
- Полноценный `StrategyConfig` с `config_id`, несколько variants, сравнительные отчёты (Step 3–4).

Данное ТЗ **не** требует реализации этих шагов.
