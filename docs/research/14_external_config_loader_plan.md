# Step 14 — External Config Loader (Experiment Layer + Family Parser)

## 1. Контекст

После Step 12 (`component_builders`) и Step 13 (multi-instance компонентов) внутренняя модель `StrategySpec` стабилизирована, но запуск всё ещё опирается на ручную подачу параметров из кода.

Для следующего уровня research-нужен внешний способ задавать и массово прогонять strategy instances:

- конфиг живёт вне Python-кода запуска;
- один и тот же runner умеет обработать много инстансов за один запуск;
- каждый прогон остаётся воспроизводимым и диагностируемым.

---

## 2. Цель шага

Ввести минимальный production-like слой внешней конфигурации для research с разделением двух уровней:

- **Experiment layer (generic)**:
  - чтение одного external config file (single instance или bundle/list instances);
  - общая envelope-валидация;
  - dispatch по `family`;
- **Strategy-family layer (`ema_pullback`)**:
  - преобразование одного instance dict -> `EmaPullbackStrategySpec` через builder path;
  - family-specific fail-fast validation.

---

## 3. Scope (in)

- минимальный generic experiment config loader для одного файла:
  - файл содержит один instance object; или
  - файл содержит bundle/list instances;
- shared validation envelope (`schema_version`, `experiment_id`/`run_name`, `family`, `instances`);
- dispatch по `family` к family-local parser;
- family-local parser для `ema_pullback`: `dict` одного instance -> typed `EmaPullbackStrategySpec`;
- fail-fast validation на файл/bundle в MVP;
- batch result artifact (per-instance status + агрегированный summary);
- deterministic mapping `external config -> strategy_spec_config_id -> result`.

## 4. Non-goals (out)

- optimizer/grid/search по параметрам;
- автогенерация конфигов;
- UI/visual constructor;
- изменения `data_engine/`;
- plugin-архитектура источников конфигов (берём только файловую модель);
- размещение file/batch/grid/orchestration логики внутри `research/strategies/ema_pullback`.

---

## 5. MVP ingestion model (single config file)

MVP фиксирует только один источник:

- orchestrator принимает один `config_source_file`;
- поддерживается два допустимых payload shape:
  - один instance object;
  - bundle/list instances в одном файле;
- directory feed и multi-file discovery не входят в DoD этого шага;
- весь file-level ingestion/dispatch живёт в experiment layer, не в strategy family.

---

## 6. Предлагаемый high-level контракт

### 6.0 Experiment envelope (generic layer)

Внешний файл описывает experiment-level контракт:

```text
schema_version
experiment_id or run_name
family
instances[] (или single instance, нормализуемый к списку длины 1)
```

Принципы:

- generic loader валидирует envelope до dispatch;
- `family` определяет family parser;
- unique `instance_id` проверяется на уровне bundle.

### 6.1 External instance config shape (MVP)

Каждый instance во внешнем файле обязан содержать:

```text
schema_version
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
- `family`;
- `external_config_id`/`instance_id` (обязательное поле входа);
- итоговый `strategy_spec_config_id`.

---

## 7. Validation semantics

Валидация разделена на два уровня.

### 7.1 Generic validation (experiment layer)

- наличие `schema_version`;
- наличие `experiment_id`/`run_name`;
- наличие `family`;
- `instances` имеет корректный тип (или single object корректно нормализуется в list);
- `instance_id` уникален внутри bundle;
- общие поля (`market`, `execution`) имеют корректный тип.

### 7.2 Family-specific validation (`ema_pullback` layer)

- допустимость `trigger` для `ema_pullback`;
- допустимость `blockers[]` для `ema_pullback`;
- допустимость `exits[]` для `ema_pullback`;
- наличие и корректность family-specific параметров (например RSI там, где требуется);
- `anchor_stack` содержит обязательные роли (`fast`, `anchor`, `slow`);
- `component_builders` собирают typed spec;
- `spec.py` (`__post_init__`) выполняет финальную fail-fast typed validation.

Режим ошибок:

- синтаксическая/структурная ошибка файла -> file-level fail;
- невалидный entry внутри списка -> file-level fail для всего bundle;
- partial execution (mixed valid/invalid entries) в MVP не допускается.

---

## 8. Execution orchestration

Pipeline на один config entry:

```text
raw payload
-> experiment-layer normalize + envelope validate
-> family dispatch
-> family-specific validate
-> build typed spec (component_builders/spec_instances path only)
-> run backtest (existing execution path)
-> collect per-instance artifact
```

Batch pipeline (experiment layer):

```text
discover config entries
-> envelope validate (file-level)
-> for each entry run single-instance pipeline
-> aggregate status/metrics/errors
-> write batch summary artifact
```

Требование:

- experiment orchestration слой не переписывает execution-логику стратегии;
- strategy family (`ema_pullback`) не отвечает за file discovery, batch lifecycle, grid/optimization и cross-family comparison;
- experiment layer управляет запуском множества entries и консолидацией результатов.

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

## 10. План внедрения (Step 14A / Step 14B)

### 10.1 Step 14A — family-local parser (`ema_pullback`)

1. Ввести `instance_loader.py` в `research/strategies/ema_pullback/`.
2. Реализовать контракт: один instance `dict` -> `EmaPullbackStrategySpec`.
3. Подключить `component_builders/spec_instances` как единственный путь сборки.
4. Зафиксировать family-specific validation и fail-fast ошибки.

### 10.2 Step 14B — minimal generic experiment loader (single file)

1. Ввести `research/experiments/config_loader.py` (минимальный generic loader).
2. Реализовать чтение одного config file (single object или list/bundle).
3. Реализовать shared envelope validation (`schema_version`, `experiment_id`/`run_name`, `family`, `instances`).
4. Реализовать family dispatch (`ema_pullback` -> `instance_loader.py`).
5. Возвращать список typed specs и metadata для batch report.
6. Добавить smoke-тесты на single-object, list/bundle, fail-fast и duplicate `instance_id`.

### Follow-up (вне MVP шага)

- loader для `config directory` (deterministic file discovery);
- multi-file ingestion policies (включая возможный mixed mode);
- `research/experiments/runner.py` как расширенный batch lifecycle manager;
- grid generation / optimization;
- cross-family comparison и experiment-level benchmarking;
- расширенные сценарии partial processing, если понадобятся отдельно.

---

## 11. Критерии готовности (DoD)

- можно загрузить и прогнать один файл с одним instance;
- можно загрузить и прогнать один файл со списком instances;
- общий experiment loader валидирует envelope и dispatch-ит по `family`;
- `ema_pullback` получает только один instance dict и преобразует его в `EmaPullbackStrategySpec`;
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
  снижение: зафиксировать, что Step 14B ограничен single-file loader + dispatch без optimizer/grid.

- риск: смешение orchestration и strategy-family логики  
  снижение: жёстко разделить generic experiment layer и family-local parser boundary.

---

## 13. Рекомендуемая минимальная структура папок

```text
research/
  experiments/
    config_loader.py      # generic single-file loader + envelope validation + dispatch

  strategies/
    ema_pullback/
      instance_loader.py  # one instance dict -> EmaPullbackStrategySpec
      component_builders.py
      spec_instances.py
```
