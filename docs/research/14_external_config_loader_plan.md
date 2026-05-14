# Step 14 — External Config Loader (Experiment Layer + Family Parser)

Статус: **implemented MVP**.

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

## 3. Реализованный Scope (in)

- минимальный generic experiment config loader для одного файла:
  - файл содержит один instance object; или
  - файл содержит bundle/list instances;
- поддерживаются JSON и YAML (`PyYAML` входит в `research` extra);
- shared validation envelope (`schema_version`, `experiment_id`, `family`, optional run-level `execution`, `instances`);
- dispatch по `family` к family-local parser;
- family-local parser для `ema_pullback`: `dict` одного instance -> typed `EmaPullbackStrategySpec`;
- fail-fast validation на файл/bundle в MVP;
- batch result artifact (per-instance success status + агрегированный summary), который формируется только после успешной валидации всего файла/bundle и запуска;
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

## 6. Финальный high-level контракт

### 6.0 Experiment envelope (generic layer)

Внешний файл описывает experiment-level контракт:

```text
schema_version
experiment_id
family
execution (run-level, optional)
instances[] (или single instance, нормализуемый к списку длины 1)
```

Принципы:

- generic loader валидирует envelope до dispatch;
- `schema_version` в MVP должен быть строго `1`;
- `family` определяет family parser;
- generic loader не импортирует strategy-specific `spec.py` и не вычисляет `strategy_spec_config_id` сам; это делает family-local adapter;
- unique `instance_id` проверяется на уровне bundle.

### 6.1 External instance config shape (MVP)

Каждый instance во внешнем файле обязан содержать:

```text
instance_id
variant (optional user label)
market
strategy.trade_sides
strategy.anchor_stack.source
strategy.anchor_stack.timeframe
strategy.anchor_stack.fast
strategy.anchor_stack.anchor
strategy.anchor_stack.slow
strategy.direction
strategy.setup
strategy.trigger
strategy.blockers[]
strategy.risk
strategy.exits[]
```

Принципы:

- обязательные поля явные и валидируются до build;
- component selectors используют поле `component_id` (не `component`);
- неизвестные поля валидируются в family-local parser;
- `instance_id` обязателен для каждого instance; `external_config_id` в MVP не используется.
- `variant` является человекочитаемым user label; если поле не задано, используется derived default из EMA periods.
- `execution` не является instance-level секцией; в MVP она живет только на run-level envelope.
- `strategy.trade_sides` поддерживает формы `["long"]`, `{enabled: ["long", "short"]}` и UI-friendly `{long: true, short: false}`.

Минимальный bundle example:

```yaml
schema_version: 1
experiment_id: ema_pullback_batch_001
family: ema_pullback
execution:
  init_cash: 10000
  fees: 0.0006
  slippage: 0.0001
instances:
  - instance_id: baseline_long
    variant: baseline_long
    market:
      symbol: BTCUSDT
      base_timeframe: 1h
    strategy:
      trade_sides:
        long: true
        short: false
      anchor_stack:
        source: close
        timeframe: base
        fast: 100
        anchor: 200
        slow: 1000
      direction:
        component_id: ema_anchor_stack_trend
      setup:
        component_id: pullback_to_anchor
        lookback: 3
      trigger:
        component_id: reclaim_anchor
      blockers:
        - instance_id: no_blockers
          component_id: no_blockers
      risk:
        component_id: no_risk_filter
      exits:
        - instance_id: atr_stop_loss
          component_id: atr_stop_loss
          distance:
            timeframe: base
            period: 14
            multiplier: 1.5
        - instance_id: atr_take_profit
          component_id: atr_take_profit
          distance:
            timeframe: base
            period: 14
            multiplier: 4.0
```

Альтернатива — константная дистанция в USD (для `BTCUSDT` те же единицы, что у цены в USDT):

```yaml
      exits:
        - instance_id: sl_usd
          component_id: constant_usd_stop_loss
          usd_distance: 500.0
        - instance_id: tp_usd
          component_id: constant_usd_take_profit
          usd_distance: 1200.0
```

### 6.2 Batch identity

Для каждого элемента batch фиксируются:

- `source_file`;
- `entry_index` (для list внутри файла);
- `family`;
- `instance_id` (обязательное поле входа);
- итоговый `strategy_spec_config_id`.

---

## 7. Validation semantics

Валидация разделена на два уровня.

### 7.1 Generic validation (experiment layer)

- наличие `schema_version`;
- `schema_version` равен `1` (число; другие версии, включая `"2"`, fail-fast);
- наличие `experiment_id`;
- наличие `family`;
- `execution` (если задан) содержит только run-level параметры `init_cash`, `fees`, `slippage`;
- `instances` имеет корректный тип (или single object корректно нормализуется в list);
- `instance_id` уникален внутри bundle;
- generic loader валидирует только envelope и структуру входа; family-specific поля не проверяются на этом слое.

### 7.2 Family-specific validation (`ema_pullback` layer)

- допустимость `trigger` для `ema_pullback`;
- допустимость `blockers[]` для `ema_pullback`;
- допустимость `exits[]` для `ema_pullback`;
- наличие и корректность family-specific параметров (например RSI там, где требуется);
- `anchor_stack` содержит обязательные роли (`fast`, `anchor`, `slow`) и поддерживает явные `source`/`timeframe`;
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
-> family dispatch + validate/build all entries
-> run all validated entries
-> aggregate success statuses/metrics
-> write batch summary artifact
```

Требование:

- experiment orchestration слой не переписывает execution-логику стратегии;
- strategy family (`ema_pullback`) не отвечает за file discovery, batch lifecycle, grid/optimization и cross-family comparison;
- experiment layer управляет запуском множества entries и консолидацией результатов.
- минимальный callable path реализован через `run_strategy_specs_from_config(config_file, db_path=...)`;
- CLI family-local (`run.py`): обязательный `--config` (путь к experiment YAML/JSON) и опциональный `--db-path`; market и `execution.*` задаются только в файле конфигурации.

---

## 9. Артефакты результата

MVP добавляет `batch_metadata` в research JSON payload только после успешной валидации и запуска bundle.

Содержимое:

- source metadata (`source_file`, `entries_count`);
- `schema_version`, `experiment_id`, `family`;
- run-level `execution`, если задан;
- `validation_phase_status` (`passed`) для явного фиксирования, что bundle дошел до исполнения;
- список entries:
  - identity fields;
  - status (`success`) только для entries, которые прошли валидацию и были запущены;
  - итоговый `strategy_spec_config_id`;
- агрегированные counters (total/success/failed, где `failed=0` для опубликованного MVP batch artifact).

Guardrail:

- если file/bundle validation не пройдена, execution не стартует вообще;
- в этом случае partial per-entry failed statuses в MVP не формируются.

Цель: по одному артефакту видно, какие конфиги реально прогнаны и с каким итогом.

---

## 10. Что реализовано (Step 14A / Step 14B)

### 10.1 Step 14A — family-local parser (`ema_pullback`)

1. Введён `research/strategies/ema_pullback/instance_loader.py`.
2. Реализован контракт: один instance `dict` -> `EmaPullbackStrategySpec`.
3. Подключён путь сборки через `component_builders/spec_instances`.
4. Зафиксированы family-specific validation и fail-fast ошибки.
5. `variant` стал optional user label; при отсутствии используется derived default.
6. `anchor_stack.source/timeframe`, RSI blocker/exit timeframe и ATR exit timeframe поддерживаются во внешнем config.

### 10.2 Step 14B — minimal generic experiment loader (single file)

1. Введён `research/experiments/config_loader.py`.
2. Реализовано чтение одного config file (single object или list/bundle), JSON/YAML.
3. Реализована shared envelope validation (`schema_version`, `experiment_id`, `family`, optional `execution`, `instances`).
4. Реализован family dispatch (`ema_pullback` -> `instance_loader.py`) без direct import из `ema_pullback.spec`.
5. Возвращаются typed specs и metadata для batch report.
6. Добавлены smoke/contract tests на single-object, list/bundle, fail-fast, duplicate `instance_id`, unknown fields, unsupported family, YAML dependency contract, run-level execution и trade_sides forms.

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
- batch summary artifact фиксирует success итог по каждому config entry только после успешной валидации всего файла/bundle;
- directory feed не обязателен для завершения шага;
- поведение детерминировано при повторном запуске с тем же config file.

Текущая проверка реализации:

```text
python -m pytest
204 passed
```

---

## 12. Основные риски и снижение

- риск: размытый контракт конфига  
  снижение: строгая schema + reject unknown fields на соответствующем слое (envelope в generic loader, family-specific поля в parser).

- риск: протекание generic loader в strategy-family слой  
  снижение: generic loader вызывает family-local adapter и не импортирует `ema_pullback.spec`.

- риск: расхождение идентичности между external config и internal config_id  
  снижение: `variant` является user label, а semantic identity фиксируется через `strategy_spec_config_id` в batch metadata.

- риск: скрытые ошибки в batch (часть записей не прогнана)  
  снижение: fail-fast до запуска; per-entry success statuses и aggregated counters только для успешно валидированного и запущенного bundle.

- риск: scope creep в optimizer/grid  
  снижение: зафиксировать, что Step 14B ограничен single-file loader + dispatch без optimizer/grid.

- риск: смешение orchestration и strategy-family логики  
  снижение: жёстко разделить generic experiment layer и family-local parser boundary.

---

## 13. Рекомендуемая минимальная структура папок

```text
research/
  experiments/
    __init__.py
    config_loader.py      # generic single-file loader + envelope validation + dispatch

  strategies/
    ema_pullback/
      instance_loader.py  # one instance dict -> EmaPullbackStrategySpec + config_id adapter
      component_builders.py
      spec_instances.py
```
