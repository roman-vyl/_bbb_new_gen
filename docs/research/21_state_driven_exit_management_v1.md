# Step 21 — State-Driven Exit Management v1 (managed runtime)

Date: 2026-06-08  
Status: **в работе** — OpenSpec change `trade-exit-management-runtime-v2` (Phases 1–2 реализованы; Phase 3 = execution integration — в спеке, код не начат)  
Связанные спеки: `openspec/specs/trade-exit-management-runtime/` (Step 20 foundation); активный change: `openspec/changes/trade-exit-management-runtime-v2/`

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
| Behavior-changing management | Provider + evaluators (Phases 1–2 ✅); execution integration (Phase 3 ⏳) |

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
entry pipeline (setup/blocker/trigger/direction) → entries / short_entries
  ↓
execution layer открывает позицию (lifecycle owner)
  ↓
initial SL / initial TP активны (exit_policy — аварийный контур)
  ↓
на каждом баре для открытой позиции:
  execution layer запрашивает exit_policy candidates + managed provider candidates (inherited snapshot)
  ↓
phase_rules (через provider, end-of-bar) → protected
  ↓
provider обновляет snapshot; stop_management rule effective с N+1 (delayed activation)
  ↓
на следующем баре inherited active_stop участвует в arbitration
  ↓
execution layer выбирает победителя и закрывает с exit_layer=exit_management
```

Аналогично для `runner` (v1 pack — минимальный; runner pack в Phase 7):

```text
phase/regime rules → runner
  ↓
другой набор management rules:
  - disable_initial_tp (suppress initial exit_policy TP в candidate view)
  - lock_profit_stop / break_even_stop (stop_management)
  - phase_runtime_exit (runtime_exits)
  ↓
будущий runner pack (Phase 7): EMA trail, structure stop, exhaustion exits
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
| `regime == runner` | `disable_initial_tp` (suppress initial exit_policy TP в candidate view) |
| `regime == exhaustion` | закрыть сделку (runtime exit) |

Это **реальные действия** — пересчёт `active_stop`, смена take profile, принудительный выход.

---

## Initial exits не уничтожаем

`exit_policy` остаётся базовым слоем:

```text
trade_management
├── exit_policy          # initial SL, initial TP, signal exits — аварийный контур
└── exit_management      # provider: фазы + managed stops/takes/exits для открытых позиций
```

| Слой | Роль |
|------|------|
| `exit_policy` | Декларативные exit-компоненты, скомпилированные в masks/levels до runtime |
| `exit_management` (diagnostic) | Только фазы и trace, без feedback |
| `exit_management` (managed) | `stop_management`, `take_management`, `runtime_exits` — поверх initial exits |

В начале сделки работает старый аварийный контур: **initial SL / initial TP** (из `exit_policy`).  
Когда сделка доказала силу, managed provider обновляет snapshot; execution layer применяет эффект с **следующего бара** (delayed activation):

- `protected` → `active_stop` = BE / lock profit (effective N+1);
- `runner` → `disable_initial_tp` suppress initial TP в candidate view; `active_stop` / runtime exits по правилам v1 pack (EMA trail — Phase 7).

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
| `take_management` | Take profile switching (`keep_initial`, `disable_initial_tp`; deprecated alias `disable_fixed_tp`) |
| `runtime_exits` | Phase-gated forced exits (`phase_runtime_exit`, …) |

`diagnostic_only` и `managed` **сосуществуют**: managed не ломает parity diagnostic path.  
В `mode: managed` при **пустых** `stop_management` / `take_management` / `runtime_exits` поведение **равно baseline** (Phase 1 guardrail).

---

## Execution ownership boundary

`exit_management` — **не** execution layer.

| Слой | Владелец | Ответственность |
|------|----------|-----------------|
| Entry pipeline | Без изменений | setup / blocker / trigger / direction → `entries` |
| Execution / backtest | Lifecycle owner | open, hold, close; arbitration; применяет close |
| `exit_policy` | Initial/fallback exits | SL/TP/signal; HTF profile selection |
| `exit_management` | Managed exit **provider** | state, snapshot, managed candidates, events |

Provider **не** открывает сделки, **не** читает entry logic, **не** заменяет `backtest.py`.

---

## Phase 1 — Managed exit provider core

**Статус:** ✅ реализован (OpenSpec v2 Slice 2).

### Provider skeleton + replay

Phase 1 строит **managed exit provider** — типы, snapshot, uniform events, replay helper для тестов. Полный bar-by-bar path для open trade подключается в **Phase 3** через execution integration.

```text
Provider (exit_management):
  TradeRuntimeState, ActiveManagementSnapshot
  evaluate phase_rules, stop/take/runtime evaluators
  emit events; return managed candidates / next snapshot

Execution layer (backtest.py) — Phase 3:
  open from precomputed entries
  per bar: exit_policy candidates + provider.get_bar_open_candidates(inherited snapshot)
  arbitrate → close OR provider.update_end_of_bar_snapshot()
```

Без provider skeleton ADX/EMA/runner rules бессмысленны — им некуда влиять.

**Отличие от diagnostic-only:** managed mode **может** менять exit через execution integration (Phase 3); diagnostic-only — post-hoc trace без feedback.

Ключевые объекты (Phase 1):

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

- [x] provider skeleton и domain types (`ActiveManagementSnapshot`, `ExitCandidate`, `ManagedExitContext`);
- [x] replay helper проходит сделку bar-by-bar в изоляции;
- [x] все active layers существуют в snapshot;
- [x] uniform events (все 6 типов) по контракту;
- [x] **пустые management arrays → поведение равно baseline**;
- [ ] execution layer вызывает provider для open trades (Phase 3).

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

**Статус:** ✅ реализован (OpenSpec v2 Slice 3). Outcome-changing close — Phase 3.

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
| `take_profile_switch` | `keep_initial`, `disable_initial_tp` |

```json
{
  "rule_id": "disable_initial_tp_runner",
  "component_id": "take_profile_switch",
  "activate_when": { "phase_at_least": "runner" },
  "params": {
    "action": "disable_initial_tp"
  }
}
```

`disable_initial_tp` suppress initial `exit_policy` take-profit candidate в managed/execution candidate view only; **не** мутирует `exit_policy` config/masks. Deprecated parsing alias: `disable_fixed_tp` → `disable_initial_tp`.

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

- [x] каждый слой производит snapshot update / candidate / event в unit tests;
- [x] unit tests на stop / take / runtime_exit **отдельно**;
- [x] BE / take / runtime — evaluator isolation, без assertion на trade close (это Phase 3);
- [ ] outcome-changing close через execution layer (Phase 3).

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

## Phase 3 — Execution integration + managed exit provider

**Статус:** ⏳ в OpenSpec (Slice 4); код не начат.

Execution layer остаётся lifecycle owner. Provider отдаёт inherited candidates и end-of-bar snapshot; close применяет execution.

### Provider / execution interaction (normative)

Для открытой позиции на баре N:

**A.** Execution стартует с open position state, inherited snapshot (конец N−1), effective `exit_policy` candidates.

**B.** Execution вызывает `get_bar_open_candidates(...)` — только inherited: active stop, take profile effect, armed runtime exits.

**C.** Execution арбитрирует `exit_policy` + inherited managed candidates (`same_bar_policy: v1`); при winner — close.

**D.** Если позиция открыта — `update_end_of_bar_snapshot(...)`: MFE/MAE, `phase_rules`, next snapshot, events; snapshot effective с N+1.

**E.** State, вычисленный в конце бара N, **не** даёт close candidates на баре N (delayed activation).

### ExitCandidate → ExitArbitrator

Execution layer собирает `ExitCandidate[]` из `exit_policy` pipeline и provider. `ExitArbitrator` выбирает победителя; execution формирует trade output:

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

1. **initial stop loss** (`exit_policy`)
2. **managed active stop** (inherited snapshot only)
3. **initial take profit** (`exit_policy`, unless suppressed by inherited `disable_initial_tp`)
4. **runtime exit** (inherited armed state only)
5. **signal exit** (`exit_policy`)

Исключено из arbitration на баре N: stop/take/runtime arm, впервые появившиеся в snapshot после end-of-bar update на N.

Явно пометить в spec как **v1 policy** — OHLC intrabar path modeling — отдельный future change.

### Критерий готовности Phase 3

- [ ] execution layer открывает из precomputed entries; provider не решает entry;
- [ ] provider не импортирует setup/blocker/trigger/direction;
- [ ] на баре несколько bar-open-active кандидатов → стабильный победитель;
- [ ] delayed activation: BE на N+1, не на N;
- [ ] `disable_initial_tp` suppress TP в candidate view only; `exit_policy` unchanged;
- [ ] результат объясним (`exit_layer`, `losing_candidates`, `same_bar_policy`);
- [ ] `diagnostic_only` и empty-array parity без регрессии.

---

## Phase 4 — Unified report / API / frontend contract

**Статус:** ⏳ OpenSpec Slices 5–8.

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
| `take_disabled_then_won` / `take_disabled_then_lost` | эффект `disable_initial_tp` |
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
| `take_management` | `disable_initial_tp` + runner-specific take profiles (Phase 7) |
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
| **1 — Provider core** ✅ | `mode: managed`, provider skeleton, `ActiveManagementSnapshot`, uniform events | Replay + types; **empty arrays = baseline** |
| **2 — Component Pack v1** ✅ | `break_even_stop`, `lock_profit_stop`, `take_profile_switch` (`disable_initial_tp`), `phase_runtime_exit` | Evaluators → snapshot/candidates/events; unit tests per layer |
| **3 — Execution integration** ⏳ | Provider interface + execution wiring, `ExitArbitrator`, delayed activation | Execution owns lifecycle; provider supplies candidates; outcome change via arbitration |
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
| `disable_initial_tp` | Suppress initial `exit_policy` take-profit candidate в managed/execution candidate view only; не мутирует `exit_policy` |

Deprecated parsing alias: `disable_fixed_tp` → `disable_initial_tp`.

```json
{
  "rule_id": "disable_initial_tp_runner",
  "component_id": "take_profile_switch",
  "activate_when": { "phase_at_least": "runner" },
  "params": {
    "action": "disable_initial_tp"
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
entry pipeline            — owner входа; exit_management не читает setup/blocker/trigger
execution layer           — lifecycle owner (open/hold/close); один trade path
exit_management           — provider для open trades; не simulation engine
diagnostic_only parity    — сохраняется для mode=diagnostic_only
exit_policy               — initial SL/TP/signal; HTF profile selection
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
  managed exit provider (state, snapshot, events; replay helper)

research/strategies/ema_pullback/execution/managed_components/
  stop / take / runtime_exit evaluators (Phase 2)

research/strategies/ema_pullback/execution/exit_arbitration.py  (Phase 3)
  same-bar priority; used by execution layer

research/strategies/ema_pullback/execution/backtest.py
  execution integration: open/close lifecycle + provider calls (Phase 3)

research/strategies/ema_pullback/execution/results.py
  managed events, exit_layer, comparison fields

frontend/src/features/composer/
  managed mode + management editors (Phase 8)

frontend/src/features/reports/TradeManagementDiagnosticsPanel.tsx
  unified managed layers breakdown (Phase 4)
```

---

## OpenSpec workflow

1. **Propose / apply** — активный change: `openspec/changes/trade-exit-management-runtime-v2/` (provider + execution integration, uniform events/report).
2. **Apply** — Phases 1–2 done; Phase 3 (execution integration) next; Phases 4–5 report/comparison; Phases 6–8 отдельно.
3. **Archive** — merge behavioral spec для `mode: managed`, provider contract, execution integration, unified report.

---

## Связь с Step 20

| Step 20 (закрыт) | Step 21 (этот план) |
|------------------|---------------------|
| `diagnostic_only` | `managed` |
| post-hoc phase replay | provider + execution integration (bar-by-bar для open trades) |
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

### Phase 3 — execution integration

```bash
python -m pytest tests/test_exit_arbitration.py \
  tests/test_managed_execution_integration.py -q
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
- Phases 1–5 строят **всю трубу**: provider core, component pack, execution integration, unified report, generic comparison;
- **execution layer** владеет lifecycle; **exit_management** — provider для open trades;
- Phases 6–8 — богаче state (component catalog), runner pack, Composer;
- не «BE only», а **архитектура всех active layers** + по одному простому компоненту на слой.

OpenSpec: **`state-driven-exit-management-v1`**.
