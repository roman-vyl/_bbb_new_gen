# Exit Policy Entry-Lock Spike

Date: 2026-05-23  
Scope: verify whether entry-locked profile semantics can be implemented honestly on top of `vectorbt.Portfolio.from_signals` without introducing a custom simulator.

## Outcome

Go.

Entry-locked profile semantics are implementable with existing `vectorbt` callback APIs:

- `signal_func_nb` can lock signal-exit profile at entry and keep it until trade close.
- `adjust_sl_func_nb` / `adjust_tp_func_nb` can derive stop/take values from `init_i` (entry index), so distance exits stay entry-locked even if context changes later.

No bar-dynamic shortcut is required.

## Environment

- Python environment used by this repository (`pyproject.toml` research extra with vectorbt).
- `vectorbt` API inspected via `inspect.signature(vbt.Portfolio.from_signals)`.
- Relevant callback context fields:
  - `SignalContext`: `i`, `col`, `position_now`, `val_price_now`, `flex_2d`
  - `AdjustSLContext`: `i`, `col`, `position_now`, `val_price_now`, `init_i`, `init_price`, `curr_i`, `curr_price`, `curr_stop`, `curr_trail`

## What was tested

### 1) Baseline stop series behavior

Test: pass `sl_stop` series that is wide at entry and tighter later; create a low that hits only the later tight stop.  
Result: trade did not close early. This is consistent with entry-anchored stop semantics.

### 2) Locked signal profile via `signal_func_nb`

Test setup:

- entry occurs while profile is `aligned`.
- context/profile flips to `countertrend` later.
- `countertrend` exit signal fires earlier than `aligned` exit signal.

Implementation:

- mutable per-column `locked_profile` array in `signal_args`.
- on entry (`position_now == 0` and entry signal), set `locked_profile[col]` from profile state at that bar.
- while position is open, evaluate only exit signals belonging to the locked profile.

Result: trade exited on the `aligned` signal, ignoring earlier `countertrend` signal after context flip.

### 3) Locked distance profile via `adjust_sl_func_nb`

Test setup:

- profile at entry determines SL distance (`aligned` wide vs `countertrend` tight).
- context flips after entry.
- synthetic low should trigger only the tight stop, not the wide stop.

Implementation:

- `adjust_sl_func_nb` reads profile from `state[c.init_i]` (entry index), not current bar.
- returns stop corresponding to profile-at-entry.

Results:

- when entry profile was `aligned` (wide stop), trade remained open.
- when entry profile was `countertrend` (tight stop), trade closed at the tight level.

## Synthetic-case checklist

- `long_up_locked_signal`: covered; passed.
- `long_down_locked_signal`: same mechanism supports; behavior symmetric.
- `short_down_locked_signal`: same mechanism supports; requires short-side callback branch in implementation.
- `distance_inactive_tighter_tp`: feasible via `adjust_tp_func_nb` using `init_i`.
- `distance_active_min`: feasible by precomputing active-group min for locked profile.
- `always_on_sl`: feasible by combining always_on with profile-specific group in callback inputs.
- `overlapping_entries`: feasible because lock is triggered only when `position_now == 0`.
- `stop_ready_warmup`: remains explicit in strategy layer by gating entries before passing signals.

## Design implications for implementation

- Keep current `from_signals` backend.
- Replace flat `entries/exits/short_exits/sl_stop/tp_stop` composition with callback-based composition for entry-lock:
  - `signal_func_nb` for long/short entry and signal exits using locked profile state.
  - `adjust_sl_func_nb` and `adjust_tp_func_nb` for distance exits using `init_i`.
- Keep `always_on + profile` active-group logic in compiler; callbacks consume precomputed per-profile signals/distances.

## No-go conditions revisited

No-go was defined as inability to represent entry-lock honestly.  
This spike did not hit no-go conditions because callbacks provide entry-index-aware hooks.

