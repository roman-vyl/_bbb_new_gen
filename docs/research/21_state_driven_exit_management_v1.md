# Step 21 — State-Driven Exit Management v1 (managed runtime)

Date: 2026-06-08  
Status: **план** — следующий OpenSpec change `state-driven-exit-management-v1`  
Связанные спеки: `openspec/specs/trade-exit-management-runtime/` (Step 20, diagnostic-only foundation)

> Master-plan research-документ для **behavior-changing** exit management: состояния сделки управляют active stops, take profile и runtime exits.  
> Step 20 дал приборную панель (phase diagnostics); Step 21 подключает руль, тормоза и газ.

---

## Зачем этот документ

Step 20 (`docs/research/20_trade_exit_management_runtime_v1.md`) закрыл diagnostic-only runtime:

- `phase_rules` переводят сделку в `proven` / `protected` / `runner` / `exhaustion`;
- reports и chart показывают, **когда** это произошло;
- trade count, PnL, PF и `exit_reason` **не меняются**.

Сейчас после перехода в `protected` ничего реально не происходит — сделка как шла по старому initial SL/TP, так и идёт. Лампочка «protected» загорелась, но управление к ней не подключено.

**Новая задача — не «ещё улучшить диагностику», а построить управляемый runtime**, который на основании состояния сделки включает/выключает active stops, take profile и runtime exits.

Продолжение направления из:

- `docs/research/20_trade_exit_management_runtime_v1.md` — diagnostic foundation, event model, Composer phase_rules;
- `docs/research/18_exit_management_combiner_start.md` — combiner внутри research execution;
- `docs/research/08_trade_management_sl_tp.md` — декларативный `exit_policy` (initial SL/TP, signal exits).

---

## Стартовые условия (что уже есть)

| Компонент | Статус |
|-----------|--------|
| `exit_management.mode: "diagnostic_only"` | Реализован, parity с baseline |
| `phase_rules` (MFE ATR / MFE pct / bars_in_trade) | Работают, монотонные переходы |
| `TradeRuntimeState`, `phase_changed`, `exit_executed` | Реализованы |
| Composer `PhaseRulesEditor` | Authoring phase_rules |
| Reports / chart markers | Показывают фазы и diagnostic exit events |
| `stop_management`, `runtime_exits` | Зарезервированы в контракте; parser отклоняет non-empty при `diagnostic_only` |
| Behavior-changing management | **Не реализован** |

OpenSpec reference после archive Step 20: `openspec/specs/trade-exit-management-runtime/`.

**Step 21 стартует от этого состояния** и добавляет `mode: "managed"`.

---

## Текущая vs целевая схема

### Сейчас (diagnostic-only)

```text
Сделка открылась
  ↓
runtime наблюдает за ней (post-hoc по entry_idx..exit_idx)
  ↓
phase_rules говорят: proven / protected / runner / exhaustion
  ↓
report показывает, когда это произошло
  ↓
выход — по старому exit_policy (initial SL/TP, signal exits)
```

### Цель (managed)

```text
Сделка открылась
  ↓
initial SL / initial TP активны (exit_policy — аварийный контур)
  ↓
phase_rules переводят сделку в protected
  ↓
runtime видит protected (bar-by-bar, внутри жизни сделки)
  ↓
активируется stop_management rule
  ↓
старый initial SL перестаёт быть главным защитным стопом
  ↓
каждый бар пересчитывается active_stop
  ↓
цена бьёт active_stop → сделка закрывается через exit_management
```

Аналогично для `runner`:

```text
phase/regime rules → runner
  ↓
другой набор management rules:
  - отключить фиксированный TP
  - включить EMA trailing stop
  - включить exit on exhaustion
  - более широкий safety TP
```

**Ключевой вопрос архитектуры:** когда сделка находится в таком-то состоянии, **какие правила управления стопом/тейком/выходом активны?**

---

## Два слоя: state rules отдельно, management rules отдельно

### 1. State / phase rules

Отвечают **только** на вопрос: *в каком состоянии находится сделка?*

Примеры условий (текущие и будущие):

| Условие | Пример перехода |
|---------|-----------------|
| MFE >= X ATR | → `protected` |
| ADX/DI impulse active | → `runner` |
| EMA stack collapse | → `exhaustion` |
| bars_in_trade > 100 | → `stale` |

**State rules не закрывают сделку и не двигают стоп.** Они только эмитят: «состояние изменилось» (`phase_changed`).

Сейчас реализован простейший вариант: MFE ATR threshold → phase transition.  
Позже — component catalog (`component_id` + `params`), но **сначала** нужен runtime, куда это состояние влияет (см. Phase 6).

### 2. Management rules

Отвечают на другой вопрос: *что делать, когда состояние стало таким?*

| activate_when | Действие |
|---------------|----------|
| `phase >= protected` | поставить BE stop |
| `phase >= protected` | lock +0.5 ATR profit |
| `regime == runner` | включить EMA trailing stop |
| `regime == runner` | отключить fixed TP |
| `regime == exhaustion` | закрыть сделку (runtime exit) |

Это **реальные действия** — пересчёт `active_stop`, смена take profile, принудительный выход.

---

## Initial exits не уничтожаем

`exit_policy` остаётся базовым слоем:

```text
trade_management
├── exit_policy          # initial SL, safety TP, signal exits — аварийный контур
└── exit_management      # runtime: фазы + managed stops/takes/exits поверх
```

| Слой | Роль |
|------|------|
| `exit_policy` | Декларативные exit-компоненты, скомпилированные в masks/levels до runtime |
| `exit_management` (diagnostic) | Только фазы и trace, без feedback |
| `exit_management` (managed) | `stop_management`, `take_management`, `runtime_exits` — поверх initial exits |

В начале сделки работает старый аварийный контур: **initial SL / safety TP**.  
Когда сделка доказала силу, управление перехватывает новый слой:

- `protected` → `active_stop` = BE / lock profit;
- `runner` → `active_stop` = trailing / EMA / structure stop; fixed TP отключён или сдвинут.

Initial exits **не удаляются** — они остаются fallback и участвуют в exit arbitration (см. ниже).

---

## Product contract (managed mode)

Новый режим в существующем `exit_management`:

```json
{
  "exit_management": {
    "mode": "managed",
    "phase_rules": [],
    "stop_management": [],
    "take_management": [],
    "runtime_exits": []
  }
}
```

| Поле | Назначение |
|------|------------|
| `mode` | `"diagnostic_only"` (Step 20) или `"managed"` (Step 21) |
| `phase_rules` | State transitions — без изменений семантики v1 |
| `stop_management` | Behavior-changing active stop rules |
| `take_management` | Take profile switching (`keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr`, …) |
| `runtime_exits` | Phase-gated forced exits (`phase_runtime_exit`, …) |

`diagnostic_only` и `managed` **сосуществуют**: managed не ломает parity diagnostic path.  
В `mode: managed` при **пустых** `stop_management` / `take_management` / `runtime_exits` поведение **равно baseline** (Phase 1 guardrail).

---

## Phase 1 — Managed Runtime Core

### Bar-by-bar loop

Главный скелет managed runtime — доменный loop **внутри жизни открытой сделки**, не post-hoc replay:

```text
Открылась сделка
  ↓
на каждом баре (entry bar .. close):
  1. обновить TradeRuntimeState (best/worst, MFE/MAE, bars_in_trade)
  2. оценить phase_rules → возможный phase_changed
  3. определить активные management rules для текущей фазы/regime
  4. пересчитать active_stop и active_take profile
  5. проверить stop hit (managed active_stop)
  6. проверить runtime_exits
  7. exit arbitration — выбрать, чем закрыть сделку на этом баре
  8. записать event trace
```

Без этого скелета ADX/EMA/runner rules бессмысленны — им некуда влиять.

**Отличие от diagnostic-only:** managed runtime участвует в **фактическом** выборе exit bar/price/reason; diagnostic-only идёт после закрытия по существующему path.

Ключевые объекты (Phase 1 — Managed Runtime Core):

```text
TradeRuntimeState
  phase, MFE/MAE, bars_in_trade — как в Step 20

ActiveManagementSnapshot
  active_stop_price, active_stop_rule_id, active_stop_component_id
  active_take_profile, active_take_rule_id
  active_runtime_exit_rules[]

ExitCandidate
  layer, rule_id, component_id, price, bar, reason

ExitArbitrator
  same-bar priority policy → winning ExitCandidate

ManagedExitContext
  bar OHLC, ATR refs, feature columns для trailing/EMA rules
```

**Принцип «вся труба, не все торговые гипотезы»:** Phases 1–5 строят архитектурные интерфейсы **всех** active layers, uniform event/report contract и **по одному простому компоненту на слой**. Не ADX + EMA trail + exhaustion + Composer сразу — а полный pipeline без привязки к конкретной торговой идее.

### Критерий готовности Phase 1

- runtime проходит сделку bar-by-bar;
- все active layers (`stop_management`, `take_management`, `runtime_exits`) существуют в коде и snapshot;
- uniform events (все 6 типов) эмитятся по контракту;
- **пустые management arrays → поведение равно baseline**.

---

## Uniform event model (Phase 1)

Единый набор событий для **всех** managed layers — с первого дня:

| event_type | Когда |
|------------|-------|
| `phase_changed` | Phase rule сменил фазу |
| `active_stop_updated` | Stop management обновил `active_stop` |
| `active_take_updated` | Take management сменил take profile |
| `runtime_exit_triggered` | Runtime exit rule сработал (signal, до arbitration) |
| `exit_rule_triggered` | Winning exit candidate после arbitration |
| `exit_executed` | Сделка закрыта; `exit_layer`, `rule_id`, `component_id` |

---

## Phase 2 — Active management components v1

Минимальный **component pack** для всех active layers — не «только BE», иначе report/API/frontend придётся доращивать кусками под каждый новый слой.

### stop_management

| component_id | Назначение в v1 pack |
|--------------|----------------------|
| `break_even_stop` | BE после `phase_at_least: protected` |
| `lock_profit_stop` | Minimal working: entry ± `lock_atr`×ATR, side-aware, tighten-only |

Пример `break_even_stop`:

```json
{
  "rule_id": "be_after_protected",
  "component_id": "break_even_stop",
  "activate_when": { "phase_at_least": "protected" },
  "params": {
    "buffer_type": "atr",
    "buffer_atr": 0.2,
    "atr_period": 14
  }
}
```

### take_management

| component_id | actions в v1 pack |
|--------------|-------------------|
| `take_profile_switch` | `keep_initial`, `disable_fixed_tp`, `extend_safety_tp_atr` |

```json
{
  "rule_id": "disable_fixed_tp_runner",
  "component_id": "take_profile_switch",
  "activate_when": { "phase_at_least": "runner" },
  "params": {
    "action": "disable_fixed_tp",
    "safety_tp_atr": 40
  }
}
```

### runtime_exits

| component_id | Назначение в v1 pack |
|--------------|----------------------|
| `phase_runtime_exit` | Phase-gated exit at bar close (`params.exit_price: "close"`); без pattern triggers в v2 |

```json
{
  "rule_id": "exit_on_exhaustion",
  "component_id": "phase_runtime_exit",
  "activate_when": { "phase_at_least": "exhaustion" },
  "params": { "exit_price": "close" }
}
```

### Критерий готовности Phase 2

- каждый слой (`stop_management`, `take_management`, `runtime_exits`) **реально влияет** на выход сделки;
- unit tests на stop / take / runtime_exit **отдельно**;
- BE case — reference integration, не единственный scope Phase 2.

### Связь с legacy `break_even_stop`

Legacy shape в `exit_management.always_on/profiles/rules` остаётся deprecated compatibility (Step 20).  
Новый managed `break_even_stop` — **другой контракт**: `activate_when.phase_at_least`, uniform events, `exit_layer` attribution. Не смешивать semantics.

Пример end-to-end trace (BE stop path):

```text
phase_changed:           initial_risk → protected
active_stop_updated:     rule=be_after_protected, component=break_even_stop, price=100.0
exit_rule_triggered:     rule=be_after_protected, reason=active_stop_hit
exit_executed:           exit_layer=exit_management, component_id=break_even_stop
```

---

## Phase 3 — Arbitration + managed trade output

Фиксируем, как все кандидаты конкурируют на одном баре:

- initial SL (`exit_policy`);
- managed active stop;
- initial TP / managed TP profile;
- runtime exit (`phase_runtime_exit`);
- old signal exits (`exit_policy`).

### ExitCandidate → ExitArbitrator

На баре собирается список `ExitCandidate[]`. Arbitrator выбирает победителя по `same_bar_policy` и формирует единый managed trade output:

| Поле | Назначение |
|------|------------|
| `exit_layer` | `exit_policy` \| `exit_management` |
| `exit_rule_id` | Победившее правило |
| `exit_component_id` | Компонент слоя |
| `exit_price` | Цена выхода |
| `exit_bar` | Bar index |
| `losing_candidates` | Optional — проигравшие кандидаты на том же баре |
| `same_bar_policy` | Версия политики (`v1`, …) |

### v1 same_bar_policy (консервативная)

Приоритет (от высшего к низшему):

1. **initial stop loss**
2. **managed active stop**
3. **initial take profit / managed take / safety take**
4. **runtime exit**
5. **signal exit** (`exit_policy`)

Явно пометить в spec как **v1 policy** — допускается пересмотр в v2 с OHLC path modeling.

### Критерий готовности Phase 3

- на одном баре может быть несколько кандидатов;
- arbitrator **стабильно** выбирает победителя;
- результат **объясним** в report (`exit_layer`, `losing_candidates`, `same_bar_policy`).

---

## Phase 4 — Unified report / API / frontend contract

Не BE-report, а **общий** contract для всех managed layers. Любой будущий component автоматически виден через `rule_id` / `component_id` / layer breakdown — не расширять report под каждый компонент отдельно.

### Per trade

```text
phase_at_exit
active_stop_at_exit
active_take_at_exit
exit_layer
exit_rule_id
exit_component_id
managed_events[]
```

### Variant metrics

```text
exit_layer_breakdown
stop_management_breakdown    # by rule_id / component_id
take_management_breakdown
runtime_exit_breakdown
baseline_vs_managed_summary  # placeholder fields; filled in Phase 5
```

`report_schema_version` — уточнить в OpenSpec (вероятно остаётся 6 с optional managed fields).

### Критерий готовности Phase 4

- Workbench/API читают managed exits для **любого** component pack v1 слоя;
- breakdown по `component_id` работает без спец-кода под `break_even_stop`.

---

## Phase 5 — Comparison tooling

Универсальное сравнение baseline vs managed — не только «BE helped»:

| Метрика | Назначение |
|---------|------------|
| baseline vs managed | trade count, net PnL, PF, win rate |
| `saved_by_managed_stop` | SL → managed stop / small win |
| `hurt_by_managed_stop` | ранний managed stop vs baseline TP |
| `take_disabled_then_won` / `take_disabled_then_lost` | эффект `disable_fixed_tp` |
| `runtime_exit_helped` / `runtime_exit_hurt` | эффект `phase_runtime_exit` |
| `exit_layer_transition_matrix` | от baseline exit к managed exit |

BE-specific labels (`be_helped`, `be_hurt`) — **производные** от generic breakdown, не отдельная report schema.

---

## Phase 6 — Component-based state rules

Когда active stop runtime работает, имеет смысл обогащать **state** rules, не смешивая с management.

### Сейчас

```json
{
  "type": "mfe_atr",
  "threshold": 6.0,
  "atr": { "timeframe": "base", "period": 14 }
}
```

### Цель

```json
{
  "component_id": "adx_di_impulse",
  "params": {
    "timeframe": "base",
    "period": 14,
    "min_adx": 25,
    "di_side_required": true
  }
}
```

### Component catalog (state conditions)

| component_id | Назначение |
|--------------|------------|
| `mfe_atr_threshold` | MFE в ATR (миграция текущего `mfe_atr`) |
| `mfe_pct_threshold` | MFE в процентах |
| `bars_in_trade` | Возраст сделки |
| `adx_di_impulse` | ADX/DI импульс (`docs/research/19_trend_strength_episode_blocker.md`) |
| `ema_stack_expansion` | Структура тренда intact |
| `ema_stack_collapse` | Структура сломана |
| `price_structure` | Swing/structure условия |
| `volume_impulse` | Volume spike / impulse |
| `exhaustion_pattern` | Паттерн истощения |

State components **не** двигают стоп — только меняют фазу/regime. Management rules подписываются на фазу.

---

## Phase 7 — Runner management pack

Настоящая торговая логика — **после** runtime core, component pack, arbitration и unified report.

Runner — не «цена прошла 15 ATR», а составное состояние:

```text
protected reached
AND ADX/DI impulse active
AND EMA structure intact
AND no exhaustion
```

Компоненты runner pack (не в Phase 2 stub):

| Область | Компоненты |
|---------|------------|
| State | ADX/DI impulse, EMA stack intact/collapse |
| `stop_management` | EMA trail, structure stop |
| `take_management` | take profile switch (runner profile) |
| `runtime_exits` | exit on exhaustion |

Когда runner активен, типичный management profile:

| Правило | Действие |
|---------|----------|
| `stop_management` | `active_stop` = EMA trail / structure stop |
| `take_management` | fixed TP disabled или safety TP дальше |
| `runtime_exits` | exit on exhaustion / structure loss |

---

## Phase 8 — Composer authoring

Composer **после** runtime core — иначе UI снова начнёт диктовать архитектуру:

- `mode: managed` toggle;
- state rule component selector (Phase 6 components);
- `stop_management` editor;
- `take_management` editor;
- `runtime_exits` editor;
- activation conditions editor (`activate_when`).

---

## Master-plan (8 phases)

OpenSpec change: **`state-driven-exit-management-v1`**

| Phase | Содержание | Критерий готовности |
|-------|------------|---------------------|
| **1 — Managed Runtime Core** | `mode: managed`, bar-by-bar loop, `ActiveManagementSnapshot`, `ExitCandidate`, `ExitArbitrator`, uniform events (все 6 типов) | Runtime проходит сделку bar-by-bar; все active layers существуют; **пустые management arrays = baseline** |
| **2 — Component Pack v1** | `break_even_stop`, `lock_profit_stop` (working); `take_profile_switch`; `phase_runtime_exit` | Каждый слой влияет на выход; unit tests per layer |
| **3 — Arbitration + output** | same-bar policy, `exit_layer` / `losing_candidates`, managed trade close | Несколько кандидатов на баре → стабильный победитель; объяснимый report |
| **4 — Unified report/API/frontend** | generic per-trade + variant breakdowns по layer/component | Новый component виден без расширения schema |
| **5 — Comparison tooling** | generic baseline vs managed, transition matrix | BE labels как производные |
| **6 — Component-based state rules** | condition component registry, MFE ATR → component, ADX/DI impulse | State через `component_id` + `params` |
| **7 — Runner management pack** | ADX/DI, EMA trail, exhaustion exits, take switch | Runner path end-to-end |
| **8 — Composer authoring** | managed mode + editors для всех management arrays | Full product authoring |

**Порядок принципиален:** Phases 1–5 — **вся труба** (интерфейсы, events, report, comparison). Phases 6–7 — богаче state и торговые гипотезы. Phase 8 — UI в конце.

**Не путать:** «слой целиком» ≠ «все торговые компоненты сразу». Цель Phases 1–5 — архитектура всех слоёв + по одному простому компоненту на слой + единый contract + comparison.

---

## Stop management contract (sketch)

```json
{
  "rule_id": "lock_profit_after_protected",
  "component_id": "lock_profit_stop",
  "activate_when": {
    "phase_at_least": "protected"
  },
  "params": {
    "lock_atr": 0.5,
    "atr_period": 14
  }
}
```

```json
{
  "rule_id": "ema_trail_runner",
  "component_id": "ema_trailing_stop",
  "activate_when": {
    "phase_at_least": "runner"
  },
  "params": {
    "ema_period": 20,
    "timeframe": "base",
    "offset_atr": 0.5
  }
}
```

`activate_when` в v1: `phase_at_least` (ordered phase enum). Позже: `regime`, `all_of` / `any_of` condition components.

При нескольких активных stop rules — политика merge (tightest protective stop для long) — зафиксировать в OpenSpec design.

---

## Take management contract (Phase 2)

`take_profile_switch` — actions в v1 pack:

| `action` | Поведение |
|----------|-----------|
| `keep_initial` | Без изменений (no-op, для тестов pipeline) |
| `disable_fixed_tp` | Отключить fixed TP; optional wider safety TP |
| `extend_safety_tp_atr` | Сдвинуть safety TP дальше |

```json
{
  "rule_id": "extend_safety_tp_runner",
  "component_id": "take_profile_switch",
  "activate_when": { "phase_at_least": "runner" },
  "params": {
    "action": "extend_safety_tp_atr",
    "safety_tp_atr": 40
  }
}
```

---

## Runtime exits contract (sketch)

```json
{
  "rule_id": "exit_on_exhaustion",
  "component_id": "phase_runtime_exit",
  "activate_when": { "phase_at_least": "exhaustion" },
  "params": { "exit_price": "close" }
}
```

v2: без `trigger` / `exhaustion_pattern` — pattern catalog future. Закрытие через `runtime_exits` участвует в exit arbitration с приоритетом ниже managed stop (v1 policy).

---

## Guardrails

```text
data_engine/              — candles pipeline only; без изменений
research execution        — один trade path; managed — расширение, не второй portfolio
diagnostic_only parity    — сохраняется для mode=diagnostic_only
exit_policy               — остаётся источником initial SL/TP/signal exits
report_schema_version     — backward compatible optional fields
legacy break_even_stop    — deprecated; не смешивать с managed contract
```

Managed mode **намеренно** меняет trade count / PnL / exit reasons — это feature, не regression. Сравнение только через explicit baseline vs managed experiment design.

---

## Ключевые файлы (ожидаемые точки изменения)

```text
research/strategies/ema_pullback/spec.py
  ExitManagementSpec — mode managed, stop_management, take_management validation

research/strategies/ema_pullback/execution/trade_runtime.py
  bar-by-bar managed loop (расширение diagnostic runtime)

research/strategies/ema_pullback/execution/exit_arbitration.py  (new)
  same-bar priority, exit_layer selection

research/strategies/ema_pullback/execution/backtest.py
  wire managed runtime into execution (не только post-close diagnostics)

research/strategies/ema_pullback/execution/results.py
  managed events, exit_layer, comparison fields

frontend/src/features/composer/
  managed mode + management editors (Phase 8)

frontend/src/features/reports/TradeManagementDiagnosticsPanel.tsx
  unified managed layers breakdown (Phase 4)
```

---

## OpenSpec workflow

1. **`/opsx:propose "state-driven-exit-management-v1"`** — proposal, design (loop, arbitration, uniform events/report), delta spec к `trade-exit-management-runtime`, tasks по Phases 1–5.
2. **Apply** — Phase 1 → 5 последовательно (pipe first); Phases 6–8 отдельными changes или continuation.
3. **Archive** — merge behavioral spec для `mode: managed`, всех management layers, arbitration, unified report.

Change folder (после propose): `openspec/changes/state-driven-exit-management-v1/`.

---

## Связь с Step 20

| Step 20 (закрыт) | Step 21 (этот план) |
|------------------|---------------------|
| `diagnostic_only` | `managed` |
| post-hoc phase replay | bar-by-bar feedback |
| `phase_changed`, `exit_executed` (attribution старого exit) | + uniform events: `active_stop_updated`, `active_take_updated`, `runtime_exit_triggered`, `exit_rule_triggered` |
| parity guardrail | empty management arrays = baseline; comparison tooling (Phase 5) |
| `stop_management` rejected if non-empty | все management arrays реализованы (Phase 2 pack) |
| Chart: phase markers | unified managed overlays (Phase 4) |

Step 20 остаётся обязательным фундаментом. **Не** расширять diagnostic-only parity tests managed behavior — отдельные test suites.

---

## Как проверить

### Phase 1 — empty arrays = baseline

```bash
python -m pytest tests/test_trade_runtime_managed_core.py -q
```

Ожидание: `mode: managed` с пустыми `stop_management` / `take_management` / `runtime_exits` — parity с baseline.

### Phase 2 — per-layer unit tests

```bash
python -m pytest tests/test_managed_stop_components.py \
  tests/test_managed_take_components.py \
  tests/test_managed_runtime_exit_components.py -q
```

### Phase 3 — arbitration

```bash
python -m pytest tests/test_exit_arbitration.py -q
```

### Phase 4 — unified report

```bash
python -m pytest tests/test_managed_report_contract.py -q
cd frontend && npm test -- src/features/reports
```

### Phase 5 — comparison

Два run: baseline vs managed component pack — diff по `exit_layer_breakdown`, `baseline_vs_managed_summary`.

### Parity (diagnostic unchanged)

```bash
python -m pytest tests/test_trade_runtime_diagnostics.py -q
```

---

## Отложено (вне первого archive)

1. **Phase 6** — component-based state rules и condition component registry.
2. **Phase 7** — runner management pack (ADX/DI, EMA trail, exhaustion).
3. **Phase 8** — Composer authoring для managed mode.
4. **OHLC intrabar priority v2** — уточнение порядка SL vs TP внутри бара.
5. **Partial take / scale-out** — отдельный change.
6. **Chart active stop line** — optional overlay после Phase 4 contract.

Каждый пункт — явный slice с tasks и acceptance criteria.

---

## Резюме

Step 21 переводит exit management из **приборной панели** в **систему управления**:

- **state rules** определяют фазу; **management rules** — stops/takes/runtime exits;
- **initial exit_policy** остаётся аварийным контуром;
- Phases 1–5 строят **всю трубу**: runtime core, component pack по слою, arbitration, unified report, generic comparison;
- Phases 6–8 — богаче state (component catalog), runner pack, Composer;
- не «BE only», а **архитектура всех active layers** + по одному простому компоненту на слой.

OpenSpec: **`state-driven-exit-management-v1`**.
