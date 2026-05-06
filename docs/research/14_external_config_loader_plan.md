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

- загрузка instance config из одного config file (single object или bundle/list instances);
- строгая валидация;
- сборка `EmaPullbackStrategySpec` только через builder path;
- batch execution по instances из одного файла с единым summary артефактом.

---

## 3. Scope (in)

- единый внешний контракт instance config для `ema_pullback`;
- loader для чтения одного config file:
  - файл содержит один instance object; или
  - файл содержит bundle/list instances;
- fail-fast validation по schema и бизнес-ограничениям;
- orchestration, которая запускает instances только после полной успешной валидации файла/bundle;
- batch result artifact (success/fail per config + агрегированный summary);
- deterministic mapping `external config -> config_id -> result`.

## 4. Non-goals (out)

- optimizer/grid/search по параметрам;
- автогенерация конфигов;
- UI/visual constructor;
- изменения `data_engine/`;
- plugin-архитектура источников конфигов (берём только файловую модель).

---

## 5. MVP ingestion model (single config file)

MVP фиксирует только один источник:

- orchestrator принимает один `config_source_file`;
- поддерживается два допустимых payload shape:
  - один instance object;
  - bundle/list instances в одном файле;
- directory feed и multi-file discovery не входят в DoD этого шага.

---

## 6. Предлагаемый high-level контракт

### 6.1 External instance config shape (MVP)

Каждый instance во внешнем файле обязан содержать:

```text
schema_version
family
instance_id (обязательный; может называться external_config_id в совместимой форме)
variant
market
execution
strategy.trade_sides
anchor_stack
direction
setup
trigger
blockers[]
risk
exits[]
```

Принципы:

- обязательные поля явные и валидируются до build;
- неизвестные поля -> validation error;
- `instance_id/external_config_id` обязателен для каждого instance (derived id во внешнем формате не используется).

### 6.2 Batch identity

Для каждого элемента batch фиксируются:

- `source_file`;
- `entry_index` (для list внутри файла);
- `external_config_id`/`instance_id` (обязательное поле входа);
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
- невалидный entry внутри списка -> file-level fail для всего bundle;
- partial execution (mixed valid/invalid entries) в MVP не допускается.

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

1. Зафиксировать schema внешнего instance config (конкретный MVP shape).
2. Реализовать loader для `single file` (object/list).
3. Добавить слой normalize+validate с fail-fast на весь file/bundle.
4. Подключить builder-only сборку `EmaPullbackStrategySpec` из validated payload.
5. Реализовать batch orchestration запуска всех entries файла через существующий runner.
6. Добавить batch summary artifact и smoke примеры.
7. Добавить тесты на single-object file mode, list/bundle mode, fail-fast поведения, duplicate instance ids.

### Follow-up (вне MVP шага)

- loader для `config directory` (deterministic file discovery);
- multi-file ingestion policies (включая возможный mixed mode);
- расширенные сценарии partial processing, если понадобятся отдельно.

---

## 11. Критерии готовности (DoD)

- можно загрузить и прогнать один файл с одним instance;
- можно загрузить и прогнать один файл со списком instances;
- все instances в файле валидируются до запуска, затем проходят единый validate->build->run путь;
- один batch report содержит результаты по всем variants из файла;
- ручная сборка spec в entrypoint отсутствует;
- batch summary artifact фиксирует итог по каждому config entry;
- directory feed не обязателен для завершения шага;
- поведение детерминировано при повторном запуске с тем же config file.

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
