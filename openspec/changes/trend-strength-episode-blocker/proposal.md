## Why

`ema_pullback` can produce entries when the EMA stack is formally ordered (`fast > anchor > slow` for long) even though the market has no recent directional impulse—flat EMAs, chop around anchor, and weak follow-through. Those entries often fail to reach TP or revert quickly to BE/SL. A raw `ADX[t] > threshold` gate on the entry bar would also block many valid pullback entries that occur after impulse fades. Research needs an **opt-in entry blocker** that remembers a recent side-aware ADX/DMI strength episode and only allows pullback entries while that episode is still alive.

## What Changes

- Add `trend_strength_episode_blocker` as a **blockers** component (`role: blockers`, `component_id: trend_strength_episode_blocker`).
- Extend the feature plan and calculations to materialize ADX, +DI, and -DI on the configured timeframe (MVP: `base` only).
- Implement episode/memory semantics: find the most recent side-aware ADX peak in lookback, enforce freshness (`max_bars_since_peak`), minimum current ADX, optional opposite-DI flip block, optional EMA-stack direction check.
- Expose per-bar diagnostics (`trend_strength_active`, `blocked_reason`, peak/current ADX and DI fields) via blocker trace for Signal Trace.
- Emit **component counters** on each run variant: `allowed_count`, `blocked_count`, and **`blocked_reason_breakdown`** (per-reason bar counts) so sweeps show *why* entries were cut, not only lower trade count.
- Register the component in the family registry, component builders, external config loader validation, and BFF catalog when mirrored from research.
- Add unit tests for long/short symmetry, episode expiry, opposite flip, and EMA-stack break.

**Non-goals (explicit)**

- No changes to `data_engine/`, exit_policy, exit_management, `break_even_stop`, or Signal Trace exit-management lifecycle.
- No setup/trigger/direction/risk semantics changes; blocker only ANDs into existing entry mask.
- No requirement for high ADX on the entry candle itself.
- No HTF ADX/DMI in MVP (`timeframe` must be `base`).
- No Workbench Chart overlay or HTF context changes.
- Strategies without this blocker remain unchanged (default configs keep `no_blockers` or existing blockers only).

## Capabilities

### New Capabilities

- `trend-strength-episode-blocker`: Contract for the ADX/DMI episode/memory entry blocker—registration, params, feature dependencies, allow/block semantics, diagnostics, and sweep-oriented evaluation hooks.

### Modified Capabilities

- `ema-pullback-report-diagnostics`: Optional closed-trade entry fields when this blocker is configured (peak ADX, bars since peak, `blocked_reason` at entry bar if trace available).
- `ema-pullback-signal-trace`: Blocker trace records for `trend_strength_episode_blocker` with documented diagnostic keys and `allowed` series aligned to runtime mask.

## Impact

| Layer | Scope |
|-------|--------|
| **research** | `features/plan.py`, `features/calculations.py`, `spec.py` (blocker params), `component_builders.py`, `components/blockers.py`, `components/registry.py`, `execution/signals.py` (counter aggregation), `execution/signal_trace.py`, report/trade diagnostics, tests, experiment YAML examples |
| **research_api** | Component catalog entry if served from registry mirror |
| **frontend** | Catalog-driven Composer may surface new blocker params only; no ADX computation in browser |
| **data_engine** | _none_ |

**Reference docs**: [`docs/research/19_trend_strength_episode_blocker.md`](../../../docs/research/19_trend_strength_episode_blocker.md), [`docs/research/README.md`](../../../docs/research/README.md), [`docs/research/strategy_constructor_master_plan.md`](../../../docs/research/strategy_constructor_master_plan.md).
