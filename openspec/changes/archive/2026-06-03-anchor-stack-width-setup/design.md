## Context

`ema_pullback` already composes multiple setup instances via `setup_runtime.py` (AND across `local_setup_allowed` and context gates). Direction uses `strategy.anchor_stack` EMAs; `ema_bounce_counter_setup` plans its own fast/anchor/slow periods in params, while width setup must **reuse** the strategy-level anchor stack only. Feature planning already materializes `strategy.anchor_stack` EMAs globally and supports `kind: atr` (`atr_close_{timeframe}_{period}`). Signal trace maps setup components to trace callables and `build_component_events` for chart markers (see `ema_bounce_counter_setup` emitter pattern).

## Goals / Non-Goals

**Goals:**

- Opt-in setup component `anchor_stack_width_setup` checking current and recent stack width vs ATR.
- Side-neutral width via `abs(fast - slow)`; direction layer unchanged.
- Feature-planned EMA (from anchor_stack) + ATR; trace, counters, catalog, Composer, chart events.
- Backward compatibility for configs without this setup.

**Non-Goals:**

- Touch/bounce/price-vs-anchor logic; changes to other setups, triggers, exits, blockers.
- HTF ATR; per-setup EMA period params; inline indicator math.
- `data_engine/`; optimizer; ADX subchart; new chart framework.

## Decisions

### 1. Params model: `AnchorStackWidthSetupSpec`

Frozen dataclass in `spec.py` with fields: `atr_timeframe`, `atr_period`, `min_current_width_atr`, `min_recent_width_atr`, `width_lookback_bars`. Validation: `atr_timeframe == "base"` (MVP hard reject otherwise); `atr_period`, `min_current_width_atr`, `min_recent_width_atr`, `width_lookback_bars` each `> 0`. No cross-check between `min_recent_width_atr` and `min_current_width_atr`.

`component_id` constant: `anchor_stack_width_setup`. Only valid under `strategy.setups[]` / `SetupRuleSpec`.

### 2. Feature planning: anchor stack + ATR column map

Extend `_add_setup_features` (or sibling helper) for `AnchorStackWidthSetupSpec`:

- Map `fast` / `anchor` / `slow` to existing `_ema_feature_id` from `spec.anchor_stack` (same as direction), stored in `setup_columns_by_instance_id[instance_id]`.
- Plan `PlannedFeature(kind="atr", timeframe=params.atr_timeframe, period=params.atr_period)` and map `atr` column id via `_atr_feature_id`.
- Do **not** duplicate EMA periods in setup params (contrast with `ema_bounce_counter_setup`).

`setup_runtime` / trace resolve columns via `plan.setup_columns_for(instance_id)` plus global anchor column names from plan if needed.

### 3. Runtime functions in `components/setup.py`

- `anchor_stack_width_setup_trace(df, fast_col, anchor_col, slow_col, atr_col, *, params...) -> dict[str, pd.Series]`
- `anchor_stack_width_setup(...) -> pd.Series` returns trace `setup_allowed` (boolean, index-aligned).

**Formulas:**

```text
width = abs(fast_ema - slow_ema)
width_atr = width / atr
current_width_atr = width_atr on bar t

# MVP: inclusive rolling window (current bar included)
window(t) = [t - width_lookback_bars + 1, t]
recent_max_width_atr(t) = max(width_atr[i] for i in window(t))

# NOT in MVP: past-only window [t - lookback, t - 1]
# NOT in MVP: require recent_max_width_atr > current_width_atr
```

Use pandas `rolling(width_lookback_bars, min_periods=width_lookback_bars).max()` on `width_atr` aligned so bar `t` sees the inclusive window above.

**Blocked reasons** (string per bar when not allowed):

| Condition | `blocked_reason` |
|-----------|------------------|
| NaN/missing EMA or ATR or insufficient warmup | `indicator_not_ready` |
| `current_width_atr < min_current_width_atr` | `current_width_too_narrow` |
| `recent_max_width_atr < min_recent_width_atr` | `recent_width_never_expanded` |

When allowed, `setup_allowed=True`, `blocked_reason` empty/null. Trace keys per product brief: `setup_allowed`, `blocked_reason`, `current_width_atr`, `recent_max_width_atr`, `width_lookback_bars`, `min_current_width_atr`, `min_recent_width_atr`, `current_width_ok`, `recent_width_ok`, `fast_ema`, `anchor_ema`, `slow_ema`, `atr_value`.

Register in `components/registry.py` with `role="setup"`.

### 4. Setup runtime dispatch

Add branches in `setup_runtime.run_setup_mask` and `run_setup_trace` mirroring bounce-counter pattern: pass resolved column names and spec params; no `side`-specific width formula.

Multi-setup AND: no change to combiner—new instance participates like existing setups.

### 5. Signal trace and counters

- Map `ANCHOR_STACK_WIDTH_SETUP_COMPONENT` in `signal_trace.py` trace registry.
- Expose setup internals under `setup_internals[instance_id]` (same shape family as other setups).
- Add `build_anchor_stack_width_setup_counters(trace)` (or extend existing setup counter builder): `allowed_count`, `blocked_count`, `blocked_reason_breakdown`.

### 6. Component events (chart) — allowed episodes only

Implement in `build_component_events` (mirror RSI/bounce **run detection**: find contiguous `setup_allowed` True runs, emit one start + one end per run).

| Transition | `event_type` | `label` |
|------------|--------------|---------|
| `false → true` | `span_start` | `Width ok` |
| `true → false` | `span_end` | `Width end` |

- Shared `span_id` per episode via `_span_id(instance_id, side, span_start_time)`.
- **No** per-bar markers; 300 allowed bars → exactly 2 events.
- **No** blocked-span or blocked-point events.

**`span_start` tooltip** (multiline string or formatter input):

```text
Anchor stack width setup

current_width_atr: …
recent_max_width_atr: …
min_current_width_atr: …
min_recent_width_atr: …
width_lookback_bars: …
fast_ema: …
anchor_ema: …
slow_ema: …
atr_value: …
```

**`span_end` tooltip** — values from **last allowed bar** (`t-1` when transition at `t`):

```text
Anchor stack width ended

last_current_width_atr: …
last_recent_max_width_atr: …
blocked_reason: current_width_too_narrow | recent_width_never_expanded | indicator_not_ready
```

Duplicate key fields in `metadata` for optional frontend formatter. Frontend: reuse setup span styling; dedicated formatter optional.

**Chart acceptance:** episodes on transitions only; setup role toggle; tooltips with width fields; no viewport/subchart/runtime changes.

**HTF regression:** This change does not alter `htf_context` overlay planning; still run HTF overlay smoke task when touching `signal_trace.py` (per `openspec/config.yaml`).

### 7. Config loader and catalog

- `instance_loader.py`: parse nested `params` for `anchor_stack_width_setup`; include params in config identity.
- `component_builders.py`: optional builder helper + spec factory for tests/YAML.
- `research_api/services/component_catalog.py`: `role: setup`, param fields (`atr_timeframe` select enum `["base"]`, numeric fields for periods/thresholds/lookback), description/help per user brief.

### 8. Tests (locations)

| Area | File(s) |
|------|---------|
| Spec validation | `tests/test_external_config_loader.py`, dedicated setup test module |
| Feature plan ATR | extend `tests/test_ema_pullback_setup_stack.py` or new width setup tests |
| Runtime/trace/counters | new `tests/test_anchor_stack_width_setup.py` |
| Multi-setup AND | compose with `untouched_anchor_setup` or `ema_bounce_counter_setup` |
| API catalog | existing research_api catalog tests |
| Frontend | `composerSetupComponent.test.tsx`, `chartComponentEvents.test.ts` or dedicated presentation test |

## Risks / Trade-offs

- **[Risk] Warmup bars block early history** → Expected; `indicator_not_ready` documented; tests use sufficient seed bars.
- **[Risk] Chart clutter** → Emit transitions only (allowed spans); no per-bar blocked events; setup layer toggle unchanged.
- **[Risk] Accidental HTF overlay regression when editing signal_trace** → Include HTF verification task in `tasks.md`.

## Migration Plan

1. Ship backend + catalog + tests first.
2. Enable in experiment YAML / Composer on draft configs only.
3. No migration for existing saved configs—they omit the new setup instance by default.
4. Rollback: remove setup instance from config; no schema version bump required.

## Open Questions

- None blocking MVP. Optional follow-up: closed-trade entry snapshot of width fields in report diagnostics if `ema-pullback-report-diagnostics` already has a generic setup-entry hook.
