"""Exit management combiner: validation and break-even semantics (deprecated legacy compatibility).

Slice 9: tests in this module cover the legacy ``break_even_stop`` managed combiner path only.
They are not the product contract for the phase-based diagnostic runtime (``phase_rules`` /
``stop_management`` / ``runtime_exits``).
"""

from __future__ import annotations

import pandas as pd
import pytest

from research.strategies.ema_pullback.component_builders import (
    break_even_stop_rule,
    exit_management,
    exit_no_signal,
    exit_policy,
    exits_atr_default,
    trade_management,
)
from research.strategies.ema_pullback.execution.exit_attribution import fill_price_for_distance_exit
from research.strategies.ema_pullback.execution.exit_management import (
    BarManagementTrace,
    management_traces_to_internals,
    resolve_management_rule,
    run_managed_bar_loop,
)
from research.strategies.ema_pullback.spec import TradeManagementSpec
from research.strategies.ema_pullback.spec_instances import make_ema_pullback_strategy_spec

from tests.ema_pullback_context_helpers import exit_policy_htf_consumption


def _tm_with_be_and_sl() -> TradeManagementSpec:
    sl, tp = exits_atr_default(
        atr_period=14, stop_atr_multiplier=1.5, take_atr_multiplier=4.0
    )
    return trade_management(
        exit_policy_spec=exit_policy(
            always_on=(sl, tp),
            aligned=(),
            countertrend=(),
            neutral=(),
        ),
        exit_management_spec=exit_management(
            always_on=(
                break_even_stop_rule(instance_id="be_ao", trigger_r=1.0, offset_r=0.0),
            ),
        ),
    )


def test_break_even_without_stop_loss_fails_validation() -> None:
    with pytest.raises(ValueError, match="exit_management.always_on requires stop_loss"):
        trade_management(
            exit_policy_spec=exit_policy(
                always_on=(exit_no_signal(),),
                aligned=(),
                countertrend=(),
                neutral=(),
            ),
            exit_management_spec=exit_management(
                always_on=(
                    break_even_stop_rule(instance_id="be_ao", trigger_r=1.0),
                ),
            ),
        )


def test_break_even_with_atr_sl_passes_validation() -> None:
    _tm_with_be_and_sl()


def test_fill_price_for_distance_exit_matches_vectorbt_gap_and_level() -> None:
    assert fill_price_for_distance_exit(
        "long", open_=88.0, high=95.0, low=87.0, level=90.0, is_loss=True
    ) == pytest.approx(88.0)
    assert fill_price_for_distance_exit(
        "long", open_=100.0, high=95.0, low=89.0, level=90.0, is_loss=True
    ) == pytest.approx(90.0)


def test_profile_be_without_profile_sl_fails() -> None:
    sl, tp = exits_atr_default(
        atr_period=14, stop_atr_multiplier=1.5, take_atr_multiplier=4.0
    )
    with pytest.raises(ValueError, match="profiles.aligned"):
        trade_management(
            exit_policy_spec=exit_policy_htf_consumption(
                always_on=(tp,),
                aligned=(),
                countertrend=(sl,),
                neutral=(),
            ),
            exit_management_spec=exit_management(
                aligned=(
                    break_even_stop_rule(instance_id="be_al", trigger_r=1.0),
                ),
            ),
        )


def test_resolve_profile_overrides_always_on() -> None:
    em = exit_management(
        always_on=(break_even_stop_rule(instance_id="be_ao", trigger_r=2.0),),
        aligned=(break_even_stop_rule(instance_id="be_al", trigger_r=1.0),),
    )
    resolved = resolve_management_rule(em, "aligned")
    assert resolved is not None
    assert resolved.source == "profile"
    assert resolved.rule.instance_id == "be_al"
    assert resolved.rule.trigger_r == 1.0


def test_resolve_fallback_to_always_on() -> None:
    em = exit_management(
        always_on=(break_even_stop_rule(instance_id="be_ao", trigger_r=2.0),),
    )
    resolved = resolve_management_rule(em, "countertrend")
    assert resolved is not None
    assert resolved.source == "always_on"


def test_managed_distance_stop_wins_over_signal_on_same_bar() -> None:
    """Task 3.5: SL/TP before signal when both fire on one bar."""
    n = 3
    idx = pd.RangeIndex(n)
    close = pd.Series([100.0, 95.0, 95.0], index=idx)
    high = close.copy()
    low = pd.Series([100.0, 89.0, 89.0], index=idx)
    open_ = close.copy()
    entries = pd.Series([True, False, False], index=idx)
    short_entries = pd.Series([False] * n, index=idx)

    from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
    from research.strategies.ema_pullback.execution.exit_attribution import ExitAttributionContext

    sl_ratio = pd.Series([0.1] + [float("nan")] * (n - 1), index=idx)
    signal_exit = pd.Series([False, True, False], index=idx)
    exit_outputs = PortfolioExitOutputs(
        exits=signal_exit,
        short_exits=pd.Series(False, index=idx),
        sl_stop=sl_ratio,
        tp_stop=pd.Series(float("nan"), index=idx),
        stop_ready_long=pd.Series(True, index=idx),
        stop_ready_short=pd.Series(True, index=idx),
        context_state=pd.Series("neutral", index=idx),
        profile_long=pd.Series("neutral", index=idx),
        profile_short=pd.Series("neutral", index=idx),
        long_exits_by_profile={
            p: signal_exit if p == "neutral" else pd.Series(False, index=idx)
            for p in ("aligned", "countertrend", "neutral")
        },
        short_exits_by_profile={
            p: pd.Series(False, index=idx) for p in ("aligned", "countertrend", "neutral")
        },
        sl_stop_by_profile={p: sl_ratio for p in ("aligned", "countertrend", "neutral")},
        tp_stop_by_profile={
            p: pd.Series(float("nan"), index=idx)
            for p in ("aligned", "countertrend", "neutral")
        },
        attribution=ExitAttributionContext(
            index=idx,
            instance_ids=("atr_sl", "sig_exit"),
            exit_kinds=("stop_loss", "signal"),
            rule_groups=("always_on", "always_on"),
            long_signal_by_rule=(None, signal_exit),
            short_signal_by_rule=(),
            distance_ratio_by_rule=(sl_ratio, None),
            sl_stop_agg=sl_ratio,
            tp_stop_agg=pd.Series(float("nan"), index=idx),
            sl_stop_agg_by_profile={"neutral": sl_ratio},
            tp_stop_agg_by_profile={"neutral": pd.Series(float("nan"), index=idx)},
            context_state=pd.Series("neutral", index=idx),
        ),
    )

    spec = make_ema_pullback_strategy_spec(trade_management_spec=_tm_with_be_and_sl())
    closed, _ = run_managed_bar_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=short_entries,
        exit_outputs=exit_outputs,
    )
    assert len(closed) == 1
    assert closed[0]["exit_attribution"].exit_reason.startswith("stop_loss:")
    assert closed[0]["exit_price"] == pytest.approx(90.0)


def test_managed_stop_loss_fill_price_uses_level_not_close() -> None:
    """Regression: SL fill must match vectorbt stop level, not bar close."""
    n = 3
    idx = pd.RangeIndex(n)
    close = pd.Series([100.0, 95.0, 95.0], index=idx)
    high = close.copy()
    low = pd.Series([100.0, 89.0, 89.0], index=idx)
    open_ = close.copy()
    entries = pd.Series([True, False, False], index=idx)
    short_entries = pd.Series([False] * n, index=idx)

    from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
    from research.strategies.ema_pullback.execution.exit_attribution import ExitAttributionContext
    from research.strategies.ema_pullback.execution.results import build_managed_trade_records

    sl_ratio = pd.Series([0.1] + [float("nan")] * (n - 1), index=idx)
    exit_outputs = PortfolioExitOutputs(
        exits=pd.Series(False, index=idx),
        short_exits=pd.Series(False, index=idx),
        sl_stop=sl_ratio,
        tp_stop=pd.Series(float("nan"), index=idx),
        stop_ready_long=pd.Series(True, index=idx),
        stop_ready_short=pd.Series(True, index=idx),
        context_state=pd.Series("neutral", index=idx),
        profile_long=pd.Series("neutral", index=idx),
        profile_short=pd.Series("neutral", index=idx),
        long_exits_by_profile={
            p: pd.Series(False, index=idx) for p in ("aligned", "countertrend", "neutral")
        },
        short_exits_by_profile={
            p: pd.Series(False, index=idx) for p in ("aligned", "countertrend", "neutral")
        },
        sl_stop_by_profile={p: sl_ratio for p in ("aligned", "countertrend", "neutral")},
        tp_stop_by_profile={
            p: pd.Series(float("nan"), index=idx)
            for p in ("aligned", "countertrend", "neutral")
        },
        attribution=ExitAttributionContext(
            index=idx,
            instance_ids=("atr_sl",),
            exit_kinds=("stop_loss",),
            rule_groups=("always_on",),
            long_signal_by_rule=(),
            short_signal_by_rule=(),
            distance_ratio_by_rule=(sl_ratio,),
            sl_stop_agg=sl_ratio,
            tp_stop_agg=pd.Series(float("nan"), index=idx),
            sl_stop_agg_by_profile={"neutral": sl_ratio},
            tp_stop_agg_by_profile={"neutral": pd.Series(float("nan"), index=idx)},
            context_state=pd.Series("neutral", index=idx),
        ),
    )

    spec = make_ema_pullback_strategy_spec(trade_management_spec=_tm_with_be_and_sl())
    closed, _ = run_managed_bar_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=short_entries,
        exit_outputs=exit_outputs,
    )
    assert len(closed) == 1
    assert closed[0]["exit_idx"] == 1
    assert closed[0]["exit_price"] == pytest.approx(90.0)
    attr = closed[0]["exit_attribution"]
    assert attr.exit_reason.startswith("stop_loss:")
    records = build_managed_trade_records(closed, index=idx, close=close)
    assert records[0]["exit_price"] == pytest.approx(90.0)
    assert records[0]["pnl"] == pytest.approx(-10.0)


def test_managed_long_break_even_trigger_next_bar() -> None:
    pytest.importorskip("vectorbt")
    n = 6
    idx = pd.RangeIndex(n)
    close = pd.Series([100.0, 100.0, 110.0, 110.0, 110.0, 110.0], index=idx)
    high = close.copy()
    low = pd.Series([100.0, 99.0, 109.0, 109.0, 109.0, 109.0], index=idx)
    open_ = close.copy()
    entries = pd.Series([True, False, False, False, False, False], index=idx)
    short_entries = pd.Series([False] * n, index=idx)

    from research.strategies.ema_pullback.execution.exits import PortfolioExitOutputs
    from research.strategies.ema_pullback.execution.exit_attribution import (
        ExitAttributionContext,
    )

    sl_ratio = pd.Series([0.1] + [float("nan")] * (n - 1), index=idx)
    exit_outputs = PortfolioExitOutputs(
        exits=pd.Series(False, index=idx),
        short_exits=pd.Series(False, index=idx),
        sl_stop=sl_ratio,
        tp_stop=pd.Series(float("nan"), index=idx),
        stop_ready_long=pd.Series(True, index=idx),
        stop_ready_short=pd.Series(True, index=idx),
        context_state=pd.Series("neutral", index=idx),
        profile_long=pd.Series("neutral", index=idx),
        profile_short=pd.Series("neutral", index=idx),
        long_exits_by_profile={
            p: pd.Series(False, index=idx) for p in ("aligned", "countertrend", "neutral")
        },
        short_exits_by_profile={
            p: pd.Series(False, index=idx) for p in ("aligned", "countertrend", "neutral")
        },
        sl_stop_by_profile={p: sl_ratio for p in ("aligned", "countertrend", "neutral")},
        tp_stop_by_profile={
            p: pd.Series(float("nan"), index=idx)
            for p in ("aligned", "countertrend", "neutral")
        },
        attribution=ExitAttributionContext(
            index=idx,
            instance_ids=("atr_sl",),
            exit_kinds=("stop_loss",),
            rule_groups=("always_on",),
            long_signal_by_rule=(),
            short_signal_by_rule=(),
            distance_ratio_by_rule=(sl_ratio,),
            sl_stop_agg=sl_ratio,
            tp_stop_agg=pd.Series(float("nan"), index=idx),
            sl_stop_agg_by_profile={"neutral": sl_ratio},
            tp_stop_agg_by_profile={"neutral": pd.Series(float("nan"), index=idx)},
            context_state=pd.Series("neutral", index=idx),
        ),
    )

    spec = make_ema_pullback_strategy_spec(trade_management_spec=_tm_with_be_and_sl())
    closed, traces = run_managed_bar_loop(
        spec=spec,
        close=close,
        open_=open_,
        high=high,
        low=low,
        entries=entries,
        short_entries=short_entries,
        exit_outputs=exit_outputs,
    )
    assert len(closed) >= 1
    pos = closed[0]["position"]
    assert pos.triggered is True
    assert traces[2] is not None
    assert traces[2].break_even_triggered_on_bar is True
    assert traces[2].effective_stop_price == pytest.approx(90.0)
    if traces[3] is not None:
        assert traces[3].effective_stop_price == pytest.approx(100.0)


def test_management_traces_to_internals_side_filter() -> None:
    traces: list[BarManagementTrace | None] = [
        None,
        BarManagementTrace(
            effective_stop_price=90.0,
            pending_stop_price=None,
            break_even_active=True,
            break_even_triggered_on_bar=False,
            break_even_trigger_price=None,
            break_even_stop_moved_to=None,
            break_even_initial_risk=10.0,
            break_even_instance_id="be_ao",
            active_stop_management_source="always_on",
            position_direction="long",
        ),
        None,
    ]
    long_em = management_traces_to_internals(traces, side="long")
    short_em = management_traces_to_internals(traces, side="short")
    assert long_em["effective_stop_price"] == [None, 90.0, None]
    assert short_em["effective_stop_price"] == [None, None, None]
