# Step 13 — Multi-instance Same Component Plan

## 1. Контекст

На текущем этапе `StrategySpec` в большинстве ролей фактически ориентирован на single-instance компонент: одна роль -> один component id (+ params).

Для исследовательских сценариев этого уже недостаточно:

- в `blockers` часто нужно объединять несколько фильтров одного типа с разными окнами/порогами;
- в `exits` нужны несколько правил одного семейства (например, разные ATR-множители);
- в `risk` могут понадобиться каскадные ограничения одной и той же логики с разными параметрами.

Нужна модель, где один и тот же `component_id` можно использовать несколько раз в одной роли, но как разные экземпляры.

---

## 2. Цель шага

Ввести поддержку нескольких экземпляров одного компонента с разными параметрами в рамках одного `StrategySpec`, сохранив:

- детерминированный порядок исполнения;
- воспроизводимость отчётов;
- обратную совместимость с текущими single-instance конфигами.

---

## 3. Scope (in)

- `StrategySpec`/builder contracts для multi-instance представления компонентных ролей;
- явный `instance_id` для каждого экземпляра компонента;
- execution orchestration для последовательного/предсказуемого применения instances;
- включение `instance_id` в debug counters и structured results;
- миграционный слой для старого single-instance формата.

## 4. Non-goals (out)

- optimizer/grid-перебор;
- внешний файловый config/CLI;
- изменение `data_engine/`;
- plugin/autodiscovery компонентов;
- frontend visual constructor.

---

## 5. Предлагаемый контракт (high-level)

### 5.1 Instance shape

Каждый экземпляр компонента описывается как:

```text
role + component_id + instance_id + params + enabled(optional)
```

Принципы:

- `component_id` отвечает за тип логики;
- `instance_id` отвечает за уникальность конкретной инстанциации внутри strategy instance;
- `params` может отличаться между экземплярами при одинаковом `component_id`.

### 5.2 Уникальность

- `instance_id` уникален в пределах соответствующей роли;
- дубликаты `instance_id` в одной роли — validation error;
- при отсутствии `instance_id` builder может авто-генерировать детерминированный alias, но предпочтителен явный id.

### 5.3 Backward compatibility

- старый single-instance формат автоматически компилируется в список из одного instance;
- runtime и reporting работают только с нормализованным list-представлением.

---

## 6. Execution semantics

Для каждой роли фиксируется:

- порядок применения экземпляров (в порядке списка после нормализации);
- правила агрегации (например, для blockers: deny при срабатывании любого блокера; для exits: first-hit или приоритетный порядок по spec);
- единый интерфейс вызова component runtime с контекстом стороны сделки (long/short сохраняется из Step 12).

Важно: семантика агрегации документируется отдельно по ролям и должна быть одинаковой между backtest runs.

---

## 7. Reporting / Diagnostics

Structured results и debug-метрики должны включать:

- `component_id`;
- `instance_id`;
- role;
- агрегированные и per-instance counters (где применимо).

Минимальная цель: по отчету однозначно восстановить, какой именно экземпляр компонента дал вклад в решение.

---

## 8. План внедрения (подшаги)

1. Нормализовать spec contracts в builder-слое на list-of-instances representation.
2. Добавить validation (`instance_id`, дубликаты, обязательные поля).
3. Обновить execution orchestration для обработки списка instances по ролям.
4. Прокинуть `instance_id` в diagnostics/result artifact.
5. Добавить migration adapter для legacy single-instance конфигов.
6. Подготовить 2-3 smoke strategy instances, где один `component_id` используется несколько раз с разными params.

---

## 9. Критерии готовности (DoD)

- один `StrategySpec` поддерживает >=2 экземпляров одного `component_id` в минимум одной роли;
- отчёт и debug clearly различают instances по `instance_id`;
- старый single-instance spec продолжает выполняться без изменений пользовательского API;
- поведение детерминировано между повторными запусками на одинаковых данных.

---

## 10. Риски

- неявная/нестабильная семантика агрегации между ролями;
- путаница между `component_id` и `instance_id` в отчётах;
- скрытая несовместимость с уже существующими spec_instances.

Снижение рисков:

- явная нормализация в builder;
- строгая validation;
- обязательные smoke regression сценарии для legacy и multi-instance кейсов.
