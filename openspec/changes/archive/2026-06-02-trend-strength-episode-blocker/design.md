## Context

`ema_pullback` composes entries as `direction AND setup AND trigger AND blockers AND risk`. Existing blockers (`no_blockers`, `counter_candle_blocker`, `rsi_lookback_extreme_blocker`) return boolean masks; `rsi_lookback_extreme_blocker` also exposes `*_trace` helpers with an `allowed` series plus internals for signal trace. Indicators (EMA, ATR, RSI) are planned in `features/plan.py` and computed in `features/calculations.py` before components run. **ADX/DMI does not exist in research today.**

The product spec is in [`docs/research/19_trend_strength_episode_blocker.md`](../../../docs/research/19_trend_strength_episode_blocker.md). Core idea: allow pullback entries when a **recent** side-aware ADX peak proves impulse, not when ADX is high on the entry bar.

Likely touched modules:

- `research/strategies/ema_pullback/spec.py` — blocker params validation
- `research/strategies/ema_pullback/component_builders.py` — `blocker_trend_strength_episode(...)`
- `research/strategies/ema_pullback/features/plan.py` — plan ADX/DMI features
- `research/strategies/ema_pullback/features/calculations.py` — Wilder ADX/+DI/-DI
- `research/strategies/ema_pullback/components/blockers.py` — runtime + trace
- `research/strategies/ema_pullback/components/registry.py`
- `research/strategies/ema_pullback/execution/signals.py` — column bindings into blocker calls
- `research/strategies/ema_pullback/execution/signal_trace.py` — trace payload
- `research/experiments/config_loader.py` — parse/validate external YAML params
- Report/trade-record enrichment (optional slice)
- `research_api` catalog mirror (if applicable)

## Goals / Non-Goals

**Goals:**

- Register `trend_strength_episode_blocker` under `role: blockers` only.
- MVP on `timeframe: base` with params from the research doc (defaults: `adx_period=14`, `min_adx_peak=25`, `peak_lookback_bars=60`, `max_bars_since_peak=40`, `min_current_adx=12`, DI flags as documented).
- Side-aware peak search in the last `peak_lookback_bars` bars (most recent qualifying peak wins).
- Mirror long/short logic from the research doc for peak DI alignment, opposite flip margin, and EMA-stack direction when enabled.
- Return `allowed` boolean mask; trace returns full diagnostics including `blocked_reason` enum strings.
- Aggregate run-level **component counters** with `allowed_count`, `blocked_count`, and `blocked_reason_breakdown` for sweep forensics.
- Opt-in only: specs without this component behave identically.

**Non-Goals:**

- No `data_engine/` or live trading changes.
- No exit_policy / exit_management / break_even_stop changes.
- No HTF / multi-timeframe ADX/DMI implementation in MVP (see **HTF ADX v2 contract** below).
- No frontend ADX calculation or Chart-specific rendering in this change.
- No optimizer/grid runner beyond documenting suggested sweep values in research doc.

## Decisions

### Decision: compute ADX/DMI in `features/calculations.py`, not inside the blocker

Add planned feature kind `adx_dmi` (or three linked columns under one plan entry) with column naming convention e.g. `adx_{timeframe}_{period}`, `di_plus_{timeframe}_{period}`, `di_minus_{timeframe}_{period}`. Use Wilder smoothing consistent with standard ADX(14) definitions (same style as existing `_rsi_rolling_mean` / `_atr_rolling_mean` helpers).

**Rationale:** matches layer guardrails—components consume prepared columns only.

**Alternative:** inline ADX in blocker. Rejected—duplicates feature planning and breaks trace reproducibility.

### Decision: extend `BlockerRuleSpec` with optional trend-strength params

Add a frozen `TrendStrengthEpisodeBlockerParams` dataclass (or equivalent fields on `BlockerRuleSpec`) validated when `component_id == "trend_strength_episode_blocker"`. Required fields: `timeframe`, `adx_period`, `min_adx_peak`, `peak_lookback_bars`, `max_bars_since_peak`, `min_current_adx`, `require_di_alignment_on_peak`, `block_on_opposite_di_flip`, `opposite_di_margin`. Reject non-`base` timeframe in MVP. Legacy `require_ema_stack_direction` in YAML is accepted and ignored (direction component owns EMA stack). Types: `adx_period` / `peak_lookback_bars` / `max_bars_since_peak` as positive ints; `min_adx_peak` as float with `> 0`; `min_current_adx` and `opposite_di_margin` as non-negative floats.

**Rationale:** mirrors RSI fields on `BlockerRuleSpec` for `rsi_lookback_extreme_blocker` without a second rule type in the tuple.

**Alternative:** free-form dict params. Rejected—weak validation for experiments.

### Decision: strength confirmation = most recent qualifying bar (not a local ADX maximum)

**Terminology:** In this component, **“peak”** (and field names like `adx_peak`, `adx_peak_idx`) mean the **most recent qualifying ADX/DMI strength confirmation bar** in the lookback window—not necessarily a local maximum of the ADX series. Do **not** implement argmax / local-max / swing-high detection on ADX.

Scan backward from current bar `t` over `t - peak_lookback_bars + 1 .. t` (inclusive). A bar **qualifies** when `ADX >= min_adx_peak` and, if `require_di_alignment_on_peak`, side-aware DI holds. Use the **latest** qualifying index as `adx_peak_idx`. Compute `bars_since_adx_peak = t - adx_peak_idx`. Store that bar’s ADX/DI values in `adx_peak`, `di_plus_at_peak`, `di_minus_at_peak`.

If no qualifying bar exists → block with `blocked_reason=no_recent_adx_peak`. If `bars_since_adx_peak > max_bars_since_peak` → `peak_too_old`. If `adx_current < min_current_adx` → `current_adx_too_low`. Opposite flip per research doc.

**Rationale:** pullback entries need the freshest recent impulse confirmation, not the highest ADX print in the window and not a chart-local extremum.

**Alternative:** max ADX in window regardless of recency. Rejected—can reference an old spike while current regime is dead.

**Alternative:** local ADX maximum / swing detection. Rejected—wrong semantics; would block valid pullbacks after a single spike bar.

### Decision: keep `timeframe` param; MVP = `base` only; HTF ADX/DMI deferred to v2

The blocker config **keeps** `timeframe` so experiments and YAML stay forward-compatible (e.g. future `entry TF = 5m`, `ADX strength TF = 15m / 1h`). **MVP** validates `timeframe == "base"` only and fail-fast rejects any other value.

**HTF ADX/DMI is planned for v2.** It will require explicit feature alignment/resampling (same discipline as MTF EMA/RSI in research) and **must not** be silently approximated inside the blocker (no resample-from-base hacks, no forward-fill without a designed contract).

Out of scope for this change; document for follow-up:

- how ADX/DMI is computed on the HTF series;
- how HTF values align to base OHLCV bars;
- whether the blocker uses the last **confirmed** HTF bar only vs the forming HTF bar;
- timestamp / index semantics for `adx_peak_idx` and Signal Trace;
- how diagnostics are labeled in Signal Trace and reports when `timeframe != base`.

**Rationale:** trend strength on a noisy entry TF is a real use case, but HTF alignment is a separate design slice—too much for the first implementation.

**Alternative:** implement HTF ADX in MVP via ad-hoc resample in the blocker. Rejected—risks lookahead, inconsistent trace, and duplicate feature-plan logic.

### Decision: EMA-stack direction is not duplicated in this blocker

EMA ordering (`fast > anchor > slow` for long, etc.) is enforced by the **direction** component only. This blocker does not read anchor-stack EMA columns. Legacy `require_ema_stack_direction` in saved configs is ignored at runtime.

**Rationale:** avoids overlapping gates and duplicate params in Composer; matches `docs/research/19_trend_strength_episode_blocker.md`.

### Decision: blocker output shape matches existing trace contract

- Runtime: `trend_strength_episode_blocker(...) -> pd.Series` (`allowed`).
- Trace: `trend_strength_episode_blocker_trace(...) -> dict[str, pd.Series]` with keys at minimum: `allowed`, `trend_strength_active`, `blocked_reason` (string series or categorical encoded as string), ADX/DI peak/current fields listed in the research doc.

Signal trace should attach these under the blocker instance id like other blockers.

**Rationale:** minimal change to `signals.py` composition (`blockers` AND chain).

### Decision: component counters include blocked_reason breakdown

Extend the existing `component_counters[]` payload (written to variant JSON via `execution/backtest.py`) for each `trend_strength_episode_blocker` instance and side. Keep the standard envelope: `role`, `component_id`, `instance_id`, `side`, `output_type: allow_mask`, `counters`.

`counters` MUST include:

- `allowed_count` — bars where this blocker’s `allowed` is true
- `blocked_count` — bars where `allowed` is false
- `blocked_reason_breakdown` — map of reason string → bar count on **blocked** bars only

Reason keys (MVP): `no_recent_adx_peak`, `peak_too_old`, `current_adx_too_low`, `opposite_di_flip`, `indicator_not_ready` (ADX/DMI NaN or insufficient warmup). Sum of breakdown values MUST equal `blocked_count` when every blocked bar has exactly one reason.

Implementation: derive breakdown from the same trace output used for Signal Trace (`blocked_reason` series), not a second independent evaluation path.

**Rationale:** sweeps need to see whether the blocker removes chop (`no_recent_adx_peak`) vs kills late pullbacks (`peak_too_old`) vs over-tight current ADX (`current_adx_too_low`), etc.

**Alternative:** only generic `allowed_count` / `blocked_count` (already emitted for all blockers). Rejected—insufficient for parameter tuning.

### Decision: report entry diagnostics deferred

Optional closed-trade fields at `entry_idx` (`entry_adx_peak`, `entry_bars_since_adx_peak`, etc.) were not implemented in this slice. MVP uses Signal Trace blocker internals and `component_counters`. See `specs/ema-pullback-report-diagnostics/spec.md` (deferred).

## Follow-up slices (out of this archive)

| Slice | Notes |
|-------|--------|
| Workbench Chart `component_events` | `entry_block` spans/sources on the candle chart (RSI-blocker pattern); no ADX indicator pane in MVP |
| Closed-trade entry snapshots | Optional `entry_*` fields on trade records |
| HTF ADX/DMI (`timeframe != base`) | v2 alignment contract |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| ADX implementation drift vs TradingView/other platforms | Document Wilder definition in code comment; golden-vector tests on short OHLC fixture |
| Warmup bars produce false blocks early in history | Expected; document minimum history; tests use trimmed evaluation window |
| `peak_lookback_bars` scan cost per bar | Vectorize with rolling helpers where possible; MVP bar loop acceptable for correctness first |
| Over-blocking valid pullbacks when `min_current_adx` too high | Sweep params documented; diagnostics expose `blocked_reason` breakdown |
| `BlockerRuleSpec` grows many optional fields | Validate fields only for matching `component_id`; keep RSI fields unchanged |

## Migration Plan

1. Ship feature calculation + component behind opt-in YAML/spec only.
2. Default factory specs (`spec_instances`, batch baselines) unchanged.
3. Rollback: remove blocker from config tuple; no schema migration required.

## Open Questions

- Whether to encode `blocked_reason` as string series in trace vs parallel boolean flags (MVP: string series for breakdown charts).
- Whether `report_schema_version` bump is needed for trade diagnostics or optional keys suffice (prefer optional keys).
