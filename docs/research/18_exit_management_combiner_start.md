# Step 18 — Exit Management Combiner Start

Date: 2026-06-02  
Start point: current branch reset to `b2363c2` (`Setup becomes context aware (#42)`).  
Status: documentation checkpoint for the next implementation slice, not an OpenSpec change.

## Why this document exists

The abandoned `break-even-stop-management-v1` branch put too much domain behavior into the
`vectorbt` stop callbacks. That was the wrong direction for stateful exit management.

The next slice should start from the current clean branch and build a dedicated domain runtime for
exit management. `vectorbt` can remain the simulation backend, but it must not become the owner of
break-even, trailing, partial take-profit, or future policy-combining semantics.

## Current working baseline

The current `ema_pullback` pipeline already has useful pieces:

```text
StrategySpec
  ↓
FeaturePlan + enriched OHLCV
  ↓
build_signals_from_spec(...)
  ↓
build_exit_outputs_from_spec(...)
  ↓
vectorbt Portfolio.from_signals(...)
  ↓
extract_trade_records(...)
```

Relevant files:

- `research/strategies/ema_pullback/spec.py`
- `research/strategies/ema_pullback/execution/signals.py`
- `research/strategies/ema_pullback/execution/exits.py`
- `research/strategies/ema_pullback/execution/backtest.py`
- `research/strategies/ema_pullback/execution/results.py`
- `research/strategies/ema_pullback/execution/signal_trace.py`

`build_exit_outputs_from_spec(...)` already compiles profile-aware exit outputs:

```text
always_on + selected profile
  → long_exits_by_profile / short_exits_by_profile
  → sl_stop_by_profile / tp_stop_by_profile
  → profile_long / profile_short
  → attribution context
```

`backtest.py` currently uses `signal_func_nb`, `adjust_sl_func_nb`, and `adjust_tp_func_nb` to make
profile-locked signal exits and distance exits work inside `Portfolio.from_signals`. That is acceptable
only as an adapter layer for the current static distance exits. It is not the right place for new
stateful domain policy.

## Target architecture

Introduce an Exit Management Combiner:

```text
compiled entries
compiled static exits
compiled profile/context state
OHLCV
  ↓
Exit Management Combiner
  ↓
managed trade events + per-bar diagnostics
  ↓
portfolio/report/signal-trace adapters
```

The combiner owns:

- position lifecycle state;
- locked entry profile;
- initial stop and initial risk;
- effective stop for current bar;
- pending stop for next bar;
- next-bar promotion semantics;
- rule source: `profile` or `always_on`;
- diagnostics consumed by `trade_records` and Signal Trace.

The adapter owns:

- converting combiner outputs to the selected simulation/report backend;
- preserving existing `vectorbt` behavior when no stateful management rules exist;
- keeping metrics and JSON shape compatible with current reports.

## Runtime decision

Use the existing bar-by-bar research path as the target runtime for stateful management.

For configs without stateful exit-management rules, keep the current `vectorbt` path and its existing
entry-locked static SL/TP behavior.

For configs with stateful rules, add a managed replay path that consumes the already compiled inputs
from `signals.py` and `exits.py`. The first managed rule is `break_even_stop`; the design must leave
room for trailing stops and more advanced take-profit policies.

## Contract shape

Full example (protective SL in `exit_policy`, break-even in `exit_management`, profile override):
see `openspec/changes/exit-management-combiner-v1/design.md` — section **Example configuration**.

Do not revive the old legacy OpenSpec as the source of truth. The next implementation should introduce
a clean semantic slot under `trade_management`, likely:

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

Open naming question for implementation: whether the wire field should be `exit_management` from the
start or whether a narrower `stop_management` name is still useful. Architecturally, the component is
exit management because future rules can manage stops, take-profits, and grouped exits.

## V1 rule

First rule:

```text
component_id: break_even_stop
instance_id: <unique id>
trigger_r: > 0
offset_r: >= 0
apply_once: true
```

V1 resolution:

```text
profile rule overrides always_on rule
else fallback to always_on rule
no merge
no chaining
at most one break_even_stop rule active for a trade
```

V1 semantics:

- **BLOCKER:** `break_even_stop` is forbidden without an initial `stop_loss` from `exit_policy` (validate + runtime fail-fast);
- freeze initial stop and initial risk on entry from that exit_policy stop, not from break-even;
- trigger when price reaches `trigger_r` from entry in the profitable direction;
- compute moved stop as entry price plus/minus `offset_r * initial_risk`;
- the moved stop is pending on the trigger bar;
- pending stop becomes effective on the next bar;
- tighten only;
- if the old effective stop exits the trade on the same bar as the trigger, the trade did not exit by
  the moved break-even stop.

## Diagnostics

The same combiner output must feed both report diagnostics and Signal Trace. Do not recompute
break-even formulas separately in `results.py`, `signal_trace.py`, API services, or frontend code.

Closed `trade_records` can later expose:

```text
break_even:
  enabled
  instance_id
  active_stop_management_source
  trigger_r
  trigger_price
  triggered
  trigger_time
  stop_moved_to
  initial_stop_price
  initial_risk
```

Signal Trace can later expose optional per-bar fields:

```text
effective_stop_price
pending_stop_price
break_even_active
break_even_triggered_on_bar
break_even_trigger_price
break_even_stop_moved_to
break_even_initial_risk
break_even_instance_id
active_stop_management_source
```

Frontend must display these fields read-only when present. It must not recompute management logic and
must not draw a stop-line overlay in the first diagnostics slice.

## Implementation order

1. Remove the legacy active OpenSpec change for `break-even-stop-management-v1`.
2. Add semantic config models for `exit_management` only after naming is agreed.
3. Add a pure domain module, for example `execution/exit_management.py`.
4. Define resolved rule, position state, bar event, and diagnostics structures.
5. Implement `break_even_stop` in the combiner with focused unit tests.
6. Integrate a managed runtime path only for configs that actually use stateful management.
7. Keep current `vectorbt` static path for configs without stateful management.
8. Feed `trade_records` and Signal Trace from the same managed diagnostics.
9. Add API/frontend read-only passthrough after backend diagnostics are stable.

## Guardrails

- Do not change `data_engine/`.
- Do not change setup, trigger, blockers, or context providers for this slice.
- Do not turn `break_even_stop` into a signal exit.
- Do not allow `break_even_stop` without a protective `stop_loss` in `exit_policy`.
- Do not put break-even domain state into `vectorbt.adjust_sl_func_nb`.
- Do not duplicate break-even math between backtest, trace, and report extraction.
- Do not add frontend chart overlays in the first slice.
- Do not preserve compatibility with abandoned branch artifacts.

## Relationship to previous docs

`17_exit_policy_entry_lock_spike.md` proved that `vectorbt` callbacks can implement entry-lock for
static distance exits. This document narrows that conclusion:

```text
callbacks are acceptable as adapter mechanics;
callbacks are not the domain runtime for stateful exit management.
```

`16_exit_reason_attribution.md` remains relevant for explaining already simulated exits. The new
combiner is different: it owns stateful management decisions before the final trade/report is produced.
