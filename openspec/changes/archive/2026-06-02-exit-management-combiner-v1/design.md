## Context

The current `ema_pullback` research pipeline already compiles entries, profile-aware exits, SL/TP distances, context state, attribution data, and trace inputs before producing a portfolio/report. The mistake in the abandoned branch was treating `vectorbt.adjust_sl_func_nb` as the owner of `break_even_stop` domain behavior.

This design starts from `docs/research/18_exit_management_combiner_start.md`: stateful exit management must be a small domain state machine inside the existing research execution flow. It must not be a large parallel orchestrator and must not leak into `data_engine/`.

Current useful anchors:

- `execution/signals.py` builds entry masks.
- `execution/exits.py` builds profile-aware signal exits and static distance exits.
- `execution/backtest.py` currently adapts those outputs into `vectorbt`.
- `execution/results.py` normalizes trade records.
- `execution/signal_trace.py` exposes bar-level diagnostics.

## Goals / Non-Goals

**Goals:**

- Add a focused `Exit Management Combiner` for stateful management of an open trade.
- Implement only `break_even_stop` in v1.
- Reuse existing compiled inputs: entries, static exit-policy outputs, profile state, context state, and OHLCV.
- Preserve current behavior for configs without stateful exit-management rules.
- Make report diagnostics and Signal Trace read from the same combiner output.
- Keep API/frontend changes read-only and additive.
- Enable Composer authoring for `exit_management` rules in the same four buckets as exit policy.

**Non-Goals:**

- No replacement of the whole research backtest pipeline.
- No new global framework outside `ema_pullback` until a second strategy family needs it.
- No `break_even_stop` implementation inside `vectorbt.adjust_sl_func_nb`.
- No chart stop-line overlay.
- No changes to setup, trigger, blocker, or context provider behavior.
- No changes to `data_engine/`.

## Decisions

### Decision 1: Build a small domain combiner inside the existing execution flow

Add `research/strategies/ema_pullback/execution/exit_management.py` with pure Python/domain structures for:

- resolved management rule;
- managed position state;
- effective stop for the current bar;
- pending stop for the next bar;
- trade-level diagnostics;
- per-bar trace diagnostics.

The combiner consumes existing compiled arrays/series from `signals.py` and `exits.py`. It does not recompute EMA/ATR/context and does not own component evaluation.

Alternative considered: build a standalone orchestration engine beside `backtest.py`. Rejected because the existing bar-by-bar research flow already has the inputs and lifecycle boundaries we need.

### Decision 2: Keep `vectorbt` as static path / adapter, not domain owner

Configs without `trade_management.exit_management` rules keep the current `vectorbt` execution path.

Configs with stateful management use the combiner path for the open-trade lifecycle that requires mutable stop state. `vectorbt` callbacks can remain implementation details for current entry-locked static exits, but they must not contain break-even state transitions or diagnostics.

Alternative considered: encode break-even inside `adjust_sl_func_nb`. Rejected because diagnostics, Signal Trace, and future policies would duplicate or reverse-engineer callback state.

### Decision 3: Add semantic config under `trade_management.exit_management`

V1 config shape:

```yaml
trade_management:
  exit_policy:
    ...
  exit_management:
    always_on:
      rules: []
    profiles:
      aligned:
        rules: []
      countertrend:
        rules: []
      neutral:
        rules: []
```

V1 supports one rule type:

```text
component_id: break_even_stop
instance_id: <unique id>
trigger_r: > 0
offset_r: >= 0
apply_once: true
```

Profile resolution is intentionally simple: profile rule overrides `always_on`; otherwise fallback to `always_on`; no merge/chaining.

Alternative considered: revive `stop_management.rules[]`. Rejected for the new change because the target component is broader than stops and should leave room for trailing and take-profit management.

**Important:** `break_even_stop` does **not** replace a protective stop in `exit_policy`. It moves an existing stop after the trade reaches `trigger_r`. Authors MUST configure **both**: at least one `stop_loss` in `exit_policy` for the effective group, plus `break_even_stop` under `exit_management`.

### BLOCKER: break-even without initial stop is forbidden

`break_even_stop` is invalid without an initial protective stop from `exit_policy`. Break-even semantics require frozen `initial_stop_price` and `initial_risk` at entry; those MUST come from compiled distance `stop_loss` rules, not from break-even itself and not from invented defaults.

**Config-time (validate + `StrategySpec` validation):**

- If any `break_even_stop` exists under `exit_management`, the strategy MUST have at least one `exit_kind: stop_loss` rule in `exit_policy` (always_on or a profile bucket).
- For each profile bucket `P` that contains `break_even_stop` in `exit_management.profiles.P.rules`, the **effective exit group for P** (always_on `stop_loss` ∪ profile `P` `stop_loss`) MUST contain at least one `stop_loss` rule. Break-even in aligned only + SL only in countertrend profile is rejected.
- If `break_even_stop` exists only under `exit_management.always_on.rules`, at least one `stop_loss` MUST be reachable via always_on (profile buckets may add more SL but cannot be the sole source unless always_on has SL).

**Runtime (combiner / backtest):**

- At trade entry, if an active `break_even_stop` rule applies but the locked profile’s compiled initial stop is missing (no finite `sl_stop` / no resolvable stop distance at `entry_idx`), the run MUST fail fast with a clear error — not silently skip break-even and not synthesize a stop.

**Composer:** validate errors MUST surface on save when the author adds break-even without a protective `stop_loss` in the matching exit-policy group (e.g. add `atr_stop_loss` under Exit policy always-on or the same profile).

### Example configuration (where break-even is set)

Break-even is authored only under `trade_management.exit_management`, **not** under `exit_policy.always_on.exits` or `exit_policy.profiles.*.exits`.

```yaml
# Fragment of strategy instance JSON / experiment YAML
strategy:
  trade_management:
    # Static exits: initial stop, take profit, signal exits (unchanged model)
    exit_policy:
      context_consumption:
        context_ref: htf
        policy_id: exit_profile_by_htf_state
      always_on:
        exits:
          - instance_id: atr_sl
            component_id: atr_stop_loss
            distance: { timeframe: base, period: 14, multiplier: 2.0 }
          - instance_id: atr_tp
            component_id: atr_take_profit
            distance: { timeframe: base, period: 14, multiplier: 4.0 }
      profiles:
        aligned:
          exits: []
        countertrend:
          exits: []
        neutral:
          exits: []

    # Stateful management: move stop while trade is open (new model)
    exit_management:
      always_on:
        rules:
          - instance_id: be_always_on
            component_id: break_even_stop
            trigger_r: 2.0
            offset_r: 0.0
            apply_once: true
      profiles:
        aligned:
          rules:
            - instance_id: be_aligned_1r
              component_id: break_even_stop
              trigger_r: 1.0
              offset_r: 0.0
              apply_once: true
        countertrend:
          rules: []
        neutral:
          rules: []
```

**How resolution works for a trade:**

| Locked entry profile | Active break-even rule | `active_stop_management_source` |
|----------------------|------------------------|----------------------------------|
| `aligned` | `be_aligned_1r` (`trigger_r: 1`) | `profile` |
| `countertrend` | `be_always_on` (`trigger_r: 2`) — profile bucket empty, fallback | `always_on` |
| `neutral` | `be_always_on` | `always_on` |

Composer surfaces the same four buckets as exit policy, but writes to `exit_management.*.rules[]`:

```text
trade_management.exit_management.always_on.rules[]
trade_management.exit_management.profiles.aligned.rules[]
trade_management.exit_management.profiles.countertrend.rules[]
trade_management.exit_management.profiles.neutral.rules[]
```

Do **not** put `break_even_stop` in:

```text
trade_management.exit_policy.always_on.exits[]
trade_management.exit_policy.profiles.<profile>.exits[]
```

### Decision 4: Composer mirrors exit-policy buckets with a separate role

Composer SHALL add catalog sections and list slots for exit management, parallel to existing exit policy sections:

- Exit management always-on rules
- Profile aligned / countertrend / neutral management rules

The component `break_even_stop` SHALL use catalog role `exit_management` (not `exits`), so the exit-policy picker does not mix ATR stop-loss with break-even move rules.

Paths (draft JSON):

```text
instances[n].strategy.trade_management.exit_management.always_on.rules[slot]
instances[n].strategy.trade_management.exit_management.profiles.aligned.rules[slot]
instances[n].strategy.trade_management.exit_management.profiles.countertrend.rules[slot]
instances[n].strategy.trade_management.exit_management.profiles.neutral.rules[slot]
```

Validate API MUST accept the new shape and reject invalid v1 rules (duplicate `break_even_stop` per group, bad `trigger_r`, **break_even without initial `stop_loss`**, etc.).

Alternative considered: reuse `role: exits` and one combined list. Rejected because authors would confuse static distance stops with stateful stop moves, and runtime compilation paths differ.

### Decision 5: One combiner output feeds reports and trace

The combiner should emit both:

- trade diagnostics for `trade_records[].break_even`;
- per-bar diagnostics for Signal Trace.

`results.py`, `signal_trace.py`, `research_api`, and frontend must pass through or display this data. They must not recompute break-even formulas.

Alternative considered: reconstruct `break_even` in `extract_trade_records` from OHLC after simulation. Rejected because the source of truth is the runtime state that moved, or did not move, the stop.

### Decision 6: Next-bar semantics are explicit state

On trigger bar *t*, the current effective stop remains the old stop. The break-even stop becomes pending. On bar *t+1*, pending is promoted to effective before that bar's stop checks.

If the old effective stop exits the trade on trigger bar *t*, the trade is not reported as exited by the moved break-even stop.

## Risks / Trade-offs

- [Risk] Managed path diverges from current static vectorbt behavior. → Mitigation: keep static configs on the current path and add parity tests for no-management configs.
- [Risk] Break-even math gets duplicated in trace/report/API. → Mitigation: tests must assert both report diagnostics and Signal Trace consume the combiner output.
- [Risk] Config naming churn if `exit_management` is later renamed. → Mitigation: choose `exit_management` now and do not preserve abandoned branch wire names.
- [Risk] Metrics compatibility is harder if managed path bypasses vectorbt trade records. → Mitigation: normalize managed trade rows into the existing `extract_trade_records`/metric shape or a narrow equivalent adapter before touching API/frontend.
- [Risk] HTF context overlays regress when Signal Trace contracts change. → Mitigation: include explicit Workbench HTF overlay verification in tasks.

## Migration Plan

1. Add config/dataclass support for `trade_management.exit_management` with default empty groups.
2. Add the pure combiner and unit-test it without API/frontend.
3. Route only configs with exit-management rules through the managed path.
4. Preserve the current vectorbt path for all existing configs.
5. Add Composer catalog sections, UI list slots, and validate support for `exit_management`.
6. Add additive report/Signal Trace/API/frontend fields.
7. Validate old reports still load without `break_even`.

Rollback is straightforward while the feature is additive: disable configs with `exit_management` rules and the current vectorbt path remains the default.

## Open Questions

- Whether v1 managed path should compute portfolio-level metrics directly from managed trade rows or adapt them through a minimal portfolio-like result object.
- Whether `active_stop_management_source` should be renamed to `active_exit_management_source` before implementation. The diagnostics request uses the stop-management name, but the new architecture is exit-management.

## Implementation notes (as built)

Aligned with code on branch; update this section when behavior changes.

| Topic | Spec / doc | As built |
|-------|------------|----------|
| Report `break_even` trigger timestamp | `trigger_time` in early drafts | `trigger_time_ms` (matches `entry_time_ms`) |
| Signal Trace exit-management fields | Listed as logical per-bar fields | `long` / `short` → `internals.exit_management` parallel arrays |
| Signal Trace API contract | Optional fields | Passed via existing `SideSignalTrace.internals` (`extra` allowed on dict values) |
| Managed `exit_reason` | Not in original slice | `break_even:<instance_id>` when exit hits moved BE stop; SL/TP/signal via attribution; chart marker **BE** |
| Managed `exit_price` | Implicit bar close | SL/TP/BE fills at stop **level** (or **open** on gap through), mirroring `get_stop_price_nb`; signal exits at bar **close** |
| Trade record bar indices | Not in v1 specs | Optional `entry_idx` / `exit_idx` on managed-path records; `TradeRecord` API model |
| Example fixture | Task 1.7 | `research/experiments/configs/fixtures/exit_management_be_profile_override.json` aligned with JSON example in this file |
| Chart Bar Inspector | Signal Trace spec | `ChartBarInspector` + `exitManagementBarInspector.ts` read `internals.exit_management` per selected bar (no candle recompute) |
| Parity / Composer tests | Tasks 3.6, 6.7, 5.5–5.6, 2.8 | Extended in `test_exit_management_extended.py`, `composerExitManagement.test.ts`, partial API trace passthrough |
