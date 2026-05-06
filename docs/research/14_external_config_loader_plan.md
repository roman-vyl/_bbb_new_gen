# Step 14 — External Config Loader + Multi-instance Feed Plan

## 1. Контекст

После Step 12 (`component_builders`) и Step 13 (multi-instance компонентов) внутренняя модель `StrategySpec` стабилизирована, но запуск всё ещё опирается на ручную подачу параметров из кода.

Для следующего уровня research-нужен внешний способ задавать и массово прогонять strategy instances:

- конфиг живёт вне Python-кода запуска;
- один и тот же runner умеет обработать много инстансов за один запуск;
- каждый прогон остаётся воспроизводимым и диагностируемым.

---

## 2. Цель шага

Ввести минимальный production-like слой внешней конфигурации для research:

- загрузка instance config из файла(ов);
- строгая валидация;
- сборка `EmaPullbackStrategySpec` только через builder path;
- batch execution по множеству конфигов (multi-feed) с единым summary артефактом.

---

## 3. Scope (in)

- единый внешний контракт instance config для `ema_pullback`;
- loader для чтения:
  - одного файла конфигов;
  - директории с множеством config файлов;
- fail-fast validation по schema и бизнес-ограничениям;
- orchestration, которая запускает каждый валидный config как отдельный strategy instance run;
- batch result artifact (success/fail per config + агрегированный summary);
- deterministic mapping `external config -> config_id -> result`.

## 4. Non-goals (out)

- optimizer/grid/search по параметрам;
- автогенерация конфигов;
- UI/visual constructor;
- изменения `data_engine/`;
- plugin-архитектура источников конфигов (берём только файловую модель).

---

## 5. Вопрос «файл или папка»

Шаг фиксирует поддержку обоих вариантов подачи:

- `single file` — удобно для контролируемого batch-сценария;
- `config directory` — удобно для набора независимых конфигов.

MVP-правило:

- orchestrator принимает один `config_source`;
- если `config_source` файл:
  - поддерживается либо один объект, либо список объектов;
- если `config_source` директория:
  - читаются все подходящие config files в детерминированном порядке (например, лексикографически по имени);
- смешанный режим (одновременно file + dir в одном запуске) не обязателен.

---

## 6. Предлагаемый high-level контракт

### 6.1 External instance config (минимум)

Каждый конфиг описывает один запуск:

```text
family
variant(optional)
symbol
timeframe
date range
enabled_sides
anchor params
setup params
atr exit params
components(optional override, включая multi-instance role lists)
```

Принципы:

- обязательные поля явные и валидируются до build;
- неизвестные поля -> validation error;
- `components` (если передан) считается source of truth для component stack, как уже закреплено в builders/spec_instances.

### 6.2 Batch identity

Для каждого элемента batch фиксируются:

- `source_file`;
- `entry_index` (для list внутри файла);
- `external_config_id` (если есть во входе) или детерминированный derived id;
- итоговый `strategy_spec_config_id`.

---

## 7. Validation semantics

Loader обязан валидировать:

- структуру payload (тип полей, обязательность);
- допустимые значения (`enabled_sides`, таймфреймы, числовые диапазоны и т.п.);
- уникальность идентификаторов, критичных для Step 13 (`instance_id` в multi-instance списках ролей);
- дубликаты config entries в одном batch (по выбранному ключу идентичности).

Режим ошибок:

- синтаксическая/структурная ошибка файла -> file-level fail;
- невалидный entry внутри списка -> entry-level fail;
- batch продолжает обрабатывать остальные entries, формируя полный отчёт по статусам.

---

## 8. Execution orchestration

Pipeline на один config entry:

```text
raw payload
-> normalize
-> validate
-> build typed spec (component_builders/spec_instances path only)
-> run backtest (existing execution path)
-> collect per-instance artifact
```

Batch pipeline:

```text
discover config entries
-> for each entry run single-instance pipeline
-> aggregate status/metrics/errors
-> write batch summary artifact
```

Требование:

- orchestration слой не переписывает execution-логику стратегии;
- он только управляет множеством запусков и консолидацией результатов.

---

## 9. Артефакты результата

Добавить batch-level артефакт, содержащий минимум:

- `batch_run_id`, timestamp;
- source metadata (file/dir, counts);
- список entries:
  - identity fields;
  - status (`success`/`failed_validation`/`failed_runtime`);
  - result artifact reference (для success);
  - error payload (для failed);
- агрегированные counters (total/success/failed).

Цель: по одному артефакту видно, какие конфиги реально прогнаны и с каким итогом.

---

## 10. План внедрения (подшаги)

1. Зафиксировать schema внешнего instance config (минимальный обязательный набор).
2. Реализовать loader для `single file` (object/list).
3. Реализовать loader для `config directory` (deterministic file discovery).
4. Добавить слой normalize+validate с fail-fast на entry.
5. Подключить builder-only сборку `EmaPullbackStrategySpec` из validated payload.
6. Реализовать batch orchestration запуска entries через существующий runner.
7. Добавить batch summary artifact и smoke примеры.
8. Добавить тесты на file-mode, dir-mode, mixed valid/invalid entries, duplicate instance ids.

---

## 11. Критерии готовности (DoD)

- можно запустить прогон из одного файла конфигов;
- можно запустить прогон из директории конфигов;
- каждый конфиг проходит единый validate->build->run путь;
- ручная сборка spec в entrypoint отсутствует;
- batch summary artifact фиксирует итог по каждому config entry;
- поведение детерминировано при повторном запуске с тем же набором конфигов.

---

## 12. Основные риски и снижение

- риск: размытый контракт конфига  
  снижение: строгая schema + reject unknown fields.

- риск: расхождение идентичности между external config и internal config_id  
  снижение: явная mapping-таблица в batch artifact.

- риск: скрытые ошибки в batch (часть записей не прогнана)  
  снижение: обязательный per-entry status и aggregated counters.

- риск: scope creep в optimizer/grid  
  снижение: зафиксировать, что шаг про ingestion+orchestration, не про search.
