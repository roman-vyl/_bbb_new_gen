# Step 20 — Trade Exit Management Runtime v1 (diagnostic-only)

Date: 2026-06-07  
Status: **закрыт для архива** OpenSpec change `trade-exit-management-runtime-v1`  
Связанные спеки (после archive): `openspec/specs/trade-exit-management-runtime/`, дельты к `ema-pullback-report-diagnostics`, `exit-management-combiner`

> Итоговый research-документ по diagnostic-only runtime внутри `trade_management.exit_management`.  
> Behavior-changing stop management и runtime exits **не входят** в v1 — только контракт, диагностика и Composer authoring.

---

## Зачем этот документ

До Step 20 `trade_management.exit_policy` описывал **какие** статические и сигнальные выходы существуют, но не давал first-class модель фазы открытой сделки, MFE/MAE по ходу жизни сделки и слойной атрибуции выхода. Исследовать runner/protection было сложно: изменение PF не показывало, дошла ли сделка до `proven`, `protected` или `runner`.

Step 20 вводит **stateful runtime controller** рядом с `exit_policy`, без второго trade path и без изменения исполнения в режиме `diagnostic_only`.

Продолжение направления из:

- `docs/research/18_exit_management_combiner_start.md` — combiner внутри research execution, не в vectorbt callbacks;
- `docs/research/08_trade_management_sl_tp.md` — декларативные SL/TP в `exit_policy`;
- `docs/research/16_exit_reason_attribution.md` — атрибуция выходов.

---

## Итоговая архитектура

```text
trade_management
├── exit_policy          # декларативные exits (ATR SL/TP, signal exits, profiles)
└── exit_management      # runtime: фазы, trace, позже — stop_management / runtime_exits
```

| Слой | Ответственность |
|------|-----------------|
| `exit_policy` | Какие exit-компоненты и profile buckets скомпилированы в masks/levels |
| `exit_management` (v1) | Состояние открытой сделки, phase rules, события, отчётная диагностика |
| `exit_management` (будущее) | `stop_management`, `runtime_exits` — behavior-changing, отдельные slices |

**Жёсткое правило v1:** `mode: "diagnostic_only"` не меняет exit masks, stop prices, vectorbt exits, trade count, PnL, PF, exit reasons. Runtime идёт **после** факта закрытия сделки по окну `entry_idx..exit_idx` из существующих trade records.

---

## Product contract (authoring target)

Новый product-facing контракт `exit_management`:

```json
{
  "mode": "diagnostic_only",
  "phase_rules": [],
  "stop_management": [],
  "runtime_exits": []
}
```

### `phase_rules[]`

Каждое правило:

```json
{
  "rule_id": "to_proven_at_1atr",
  "to_phase": "proven",
  "condition": {
    "type": "mfe_atr",
    "threshold": 1.0,
    "atr": { "timeframe": "base", "period": 14 }
  }
}
```

Поддерживаемые `condition.type` в v1:

| type | threshold | доп. поля |
|------|-----------|-----------|
| `mfe_atr` | MFE в кратных ATR | `atr.timeframe`, `atr.period` |
| `mfe_pct` | decimal ratio (0.02 = 2% MFE) | — |
| `bars_in_trade` | целое ≥ 1 | — |

Целевые фазы (`to_phase`): `proven`, `protected`, `runner`, `exhaustion`.  
Старт каждой сделки: `initial_risk`. Переходы **монотонны** по порядку правил.

### Зарезервировано, но пусто в v1

- `stop_management` — real BE, trailing, partial (не реализовано);
- `runtime_exits` — EMA/RSI/context-loss exits (не реализовано).

Parser **отклоняет** non-empty `stop_management` / `runtime_exits` при `diagnostic_only`.

### Default preset (Composer)

Три правила ATR: proven @ 1.0, protected @ 1.5, runner @ 2.5 (base/14).

---

## Diagnostic runtime — поведение

### TradeRuntimeState (на закрытую сделку)

Для каждой закрытой сделки runtime обновляет по барам `entry_idx..exit_idx`:

- side-aware `best_price` / `worst_price`;
- MFE/MAE price и percent;
- inclusive `bars_in_trade` (entry bar = 1);
- текущая фаза и max phase reached;
- события `phase_changed`, `exit_executed`.

### События (variant-level)

В full report: `variant.trade_management_events[]` — упорядочены по bar index и порядку создания.

В v1 эмитятся: `phase_changed`, `exit_executed`.  
**Не эмитятся:** `active_stop_updated`, `exit_rule_triggered` (зарезервированы под будущие slices).

### Parity

Конфиг **без** `exit_management` и тот же конфиг с `diagnostic_only` + `phase_rules` дают:

- одинаковый trade count;
- net PnL, PF;
- тот же `exit_reason` breakdown.

Diagnostic добавляет только optional report fields.

---

## Report schema (v6, optional fields)

`report_schema_version` остаётся **6**. Старые отчёты v3–v6 грузятся без миграции.

### Full report

| Поле | Уровень | Назначение |
|------|---------|------------|
| `trade_management` | `trade_records[]` (closed) | per-trade diagnostics: phases, MFE/MAE, events summary |
| `trade_management_events` | variant | bar-indexed event stream |
| `metrics.trade_management_summary` | variant | агрегаты: phase buckets, transitions, exit-layer breakdown |

### Compact summary

- `trade_management_events` **исключены** (тяжёлый массив);
- `metrics.trade_management_summary` **сохраняется**.

---

## Что реализовано (slices)

| Slice | OpenSpec § | Содержание |
|-------|------------|------------|
| 1 | §1 | Dataclasses, parser, validation `diagnostic_only` |
| 2A | §2A | Audit execution paths, parity fixture до runtime |
| 2 | §2 | `trade_runtime.py`, phase evaluation, no feedback в exits |
| 3, 3A | §3 | Report serialization, compact summary |
| 4 | §4 | Unit/parity/compatibility tests |
| 5 | §5 | `research_api` read-only types и endpoints |
| 6 | §6 | Legacy BE убран из product/catalog; parser compatibility сохранён |
| 8A | §7.1–7.2, 7.4 | Frontend report panels, types, selected-trade block |
| 8B | §7.3a | Chart phase/exit markers, legend toggles |
| 9 | §6 | Legacy cleanup audit |
| 10 | §8 | Composer `PhaseRulesEditor`, validation, save/load |
| 10B | §9 | Legacy quarantine escape — explicit replacement buttons |

Детальный чеклист: `openspec/changes/trade-exit-management-runtime-v1/tasks.md`.

---

## Workbench / Composer

### Reports

- `TradeManagementDiagnosticsPanel` — phase breakdown, runner capture, protected summary, exit-layer;
- compact `/summary` через BFF;
- старые отчёты без полей — секции скрыты, без crash.

### Chart (частично)

- **Сделано (7.3a):** маркеры `phase_changed` / `exit_executed`, toggles Phases/Exits, filter по selected trade.
- **Отложено:** MFE peak marker (7.3b), active stop line (7.3c, blocked), dedicated exit-layer labels (7.3d).

Rollout: `openspec/changes/trade-exit-management-runtime-v1/frontend-chart-overlays.md`.

### Composer authoring

- Blank draft: product contract (`diagnostic_only`, пустые lists).
- `PhaseRulesEditor`: add/remove/edit/reorder, default preset, client validation.
- Loaded legacy `break_even_stop` shape: warning + quarantine; **нет** add/remove legacy rules.
- Escape hatch: **Remove legacy rules…** / **Replace with default diagnostic phases** — explicit destructive replacement в draft (до Save).
- Catalog **не** показывает `break_even_stop`.

Ключевые файлы frontend:

```text
frontend/src/features/composer/composerPhaseRulesEditor.ts
frontend/src/features/composer/PhaseRulesEditor.tsx
frontend/src/features/composer/ExitManagementProductPanel.tsx
frontend/src/features/reports/TradeManagementDiagnosticsPanel.tsx
frontend/src/features/chart/tradeManagementChartEvents.ts
```

---

## Legacy `break_even_stop` — статус после v1

| Аспект | Статус |
|--------|--------|
| Parser / старые configs | Загружаются; managed combiner path для legacy rules |
| Product / Composer / catalog | **Не** authoring target; deprecated warning |
| Diagnostic runtime v1 | **Не читает** legacy rules как phase/stop inputs |
| Reports с historical `break_even` | Read-only display сохранён |

Аудит: `openspec/changes/trade-exit-management-runtime-v1/legacy-be-cleanup-audit.md`.

---

## Ключевые файлы backend

```text
research/strategies/ema_pullback/spec.py
  ExitManagementSpec, PhaseRuleSpec, validation

research/strategies/ema_pullback/execution/trade_runtime.py
  TradeRuntimeState, phase rules, events

research/strategies/ema_pullback/execution/backtest.py
  diagnostic-only hook (no second trade path)

research/strategies/ema_pullback/execution/results.py
  report serialization

research/strategies/ema_pullback/execution/exit_management.py
  legacy managed combiner (BE v1) — unchanged semantics
```

---

## Guardrails (не тронуто)

```text
data_engine/          — candles pipeline only
execution parity      — diagnostic_only не меняет trades/PnL/PF
report_schema_version — остаётся 6
```

---

## Отложено (вне scope архива v1)

Не входит в закрытие `trade-exit-management-runtime-v1`:

1. **Chart 7.3b–7.3d** — MFE peak, active stop line, exit-layer overlay.
2. **Real `stop_management`** — BE, trailing, partial TP с feedback в execution.
3. **`runtime_exits`** — phase-gated EMA/RSI/context exits.
4. **События** `active_stop_updated`, `exit_rule_triggered` — после behavior-changing runtime.

Каждый пункт — отдельный OpenSpec change / slice с явным подтверждением.

---

## Как проверить

### Backend guardrail

```bash
python -m pytest tests/test_exit_management_contracts.py \
  tests/test_trade_runtime_diagnostics.py \
  tests/test_exit_management.py \
  tests/test_exit_management_extended.py -q
```

### Frontend

```bash
cd frontend
npm test -- src/features/composer
npm test
npm run build
```

### Smoke (local fixture, gitignored path)

```bash
python research/strategies/ema_pullback/run.py \
  --config research/experiments/configs/fixtures/smoke_runtime_diag_p8a_relaxed_w9_r10_wlb20_ulb75_ab8_sl4_safetytp40_control_no_signal_exit.json
```

Ожидание: full report содержит `trade_management_events`, `trade_records[].trade_management`, `metrics.trade_management_summary`; parity с baseline без phase_rules.

---

## OpenSpec и архив

Change: `openspec/changes/trade-exit-management-runtime-v1/`

После `/opsx:archive` поведенческий reference:

- `openspec/specs/trade-exit-management-runtime/`
- дельты в `ema-pullback-report-diagnostics`, `exit-management-combiner`

Proposal / design / tasks остаются в change folder как история реализации.

---

## Связь с master plan

Step 20 закрывает **diagnostic foundation** для trade-management runtime в research layer. Следующие шаги Strategy Constructor (если понадобятся) — не продолжение этого change, а новые changes:

- behavior-changing protection/runner mechanics;
- chart overlays 7.3b–7.3d;
- batch analytics по `trade_management_summary`.

До явного подтверждения **не** переходить к real BE / trailing / runtime exits поверх этого фундамента.
