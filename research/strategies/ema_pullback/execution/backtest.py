"""StrategySpec vectorbt backtest backend for ema_pullback."""

from __future__ import annotations

import math
from typing import Any, Literal

from data_engine.contracts import pandas_freq_alias
import pandas as pd
import numpy as np

from research.strategies.ema_pullback.execution.result_models import (
    OpenTradesBreakdown,
    SideMetrics,
    VariantMetrics,
    VariantResult,
)
from research.strategies.ema_pullback.execution.exit_attribution import build_exit_instance_component_map
from research.strategies.ema_pullback.execution.results import (
    build_bounce_counter_breakdown,
    build_exit_reason_breakdown,
    build_fee_diagnostics,
    build_profile_breakdown,
    build_profile_side_breakdown,
    build_trade_quality_breakdowns,
    extract_trade_records,
)
from research.strategies.ema_pullback.components.setup import ema_bounce_counter_setup_trace
from research.strategies.ema_pullback.context.pipeline import build_context_bundle_for_spec
from research.strategies.ema_pullback.execution.execution_adapters import (
    LegacyBreakEvenExitAdapter,
    ManagedExitProviderAdapter,
)
from research.strategies.ema_pullback.execution.execution_combiner import (
    ExecutionExitAdapter,
    run_execution_combiner_loop,
)
from research.strategies.ema_pullback.execution.exit_management import has_exit_management_rules
from research.strategies.ema_pullback.execution.exits import build_exit_outputs_from_spec
from research.strategies.ema_pullback.execution.managed_execution_loop import (
    ManagedExecutionLoopResult,
    execution_result_to_managed_runtime_result,
)
from research.strategies.ema_pullback.execution.managed_exit_provider import ManagedExitProvider
from research.strategies.ema_pullback.execution.results import (
    build_execution_integrated_trade_records,
    build_managed_trade_records,
)
from research.strategies.ema_pullback.execution.signals import build_signals_from_spec
from research.strategies.ema_pullback.execution.trade_runtime import (
    apply_managed_trade_management_diagnostics,
    apply_trade_management_diagnostics,
    build_trade_management_summary,
    build_trade_runtime_diagnostics,
    has_behavior_changing_management_rules,
    is_managed_exit_mode,
    run_managed_exit_runtime,
    trade_management_events_payload,
)
from research.strategies.ema_pullback.features.calculations import add_feature_columns_from_plan
from research.strategies.ema_pullback.features.plan import build_feature_plan_from_strategy_spec
from research.strategies.ema_pullback.spec import strategy_spec_config_id, strategy_spec_to_dict
from research.strategies.ema_pullback.spec import EmaBounceCounterSetupSpec, EmaPullbackStrategySpec


def _profile_code(name: str) -> int:
    return {"aligned": 0, "countertrend": 1, "neutral": 2}.get(name, 2)


def ensure_finite_metric(name: str, value: float) -> float:
    """Return finite metric value; normalize non-finite edge cases to 0.0."""

    if not math.isfinite(value):
        return 0.0
    return value


def _nullable_finite(value: float) -> float | None:
    if not math.isfinite(value):
        return None
    return value


def _open_high_low_for_vectorbt(enriched: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Require real OHLC columns for vectorbt stop semantics (Step 15); fail-fast if missing or non-finite."""

    missing = [c for c in ("open", "high", "low") if c not in enriched.columns]
    if missing:
        raise SystemExit(
            "enriched OHLCV must contain columns open, high, low for vectorbt stop execution; "
            f"missing: {', '.join(repr(c) for c in missing)}"
        )
    open_s = enriched["open"].astype(float)
    high_s = enriched["high"].astype(float)
    low_s = enriched["low"].astype(float)
    for name, series in (("open", open_s), ("high", high_s), ("low", low_s)):
        if series.isna().any():
            raise SystemExit(f"{name} contains NaN — check DB / repair pipeline.")
    return open_s, high_s, low_s


def _uses_managed_execution_integration(spec: EmaPullbackStrategySpec) -> bool:
    em = spec.trade_management.exit_management
    return is_managed_exit_mode(em.mode) and has_behavior_changing_management_rules(
        stop_management=em.stop_management,
        take_management=em.take_management,
        runtime_exits=em.runtime_exits,
    )


def _needs_execution_combiner(spec: EmaPullbackStrategySpec) -> bool:
    return has_exit_management_rules(spec) or _uses_managed_execution_integration(spec)


def _build_execution_exit_adapter(
    spec: EmaPullbackStrategySpec,
    enriched: pd.DataFrame,
    close: pd.Series,
) -> tuple[ExecutionExitAdapter, Literal["legacy", "v2"]]:
    if has_exit_management_rules(spec):
        return LegacyBreakEvenExitAdapter(spec=spec, close=close), "legacy"
    if _uses_managed_execution_integration(spec):
        em = spec.trade_management.exit_management
        provider = ManagedExitProvider(
            phase_rules=em.phase_rules,
            stop_management=em.stop_management,
            take_management=em.take_management,
            runtime_exits=em.runtime_exits,
            atr_series_by_key=_atr_series_for_phase_rules(enriched, spec),
        )
        return ManagedExitProviderAdapter(provider=provider, index=close.index), "v2"
    raise ValueError("execution combiner adapter requested but spec has no combiner path")


def _atr_series_for_phase_rules(
    enriched: pd.DataFrame,
    spec: EmaPullbackStrategySpec,
) -> dict[tuple[str, int], pd.Series]:
    """Return already-materialized ATR columns needed by diagnostic phase rules."""

    out: dict[tuple[str, int], pd.Series] = {}
    for rule in spec.trade_management.exit_management.phase_rules:
        atr = rule.condition.atr
        if atr is None:
            continue
        column = f"atr_close_{atr.timeframe}_{atr.period}"
        if column in enriched.columns:
            out[(atr.timeframe, atr.period)] = enriched[column].astype(float)
    return out


def _build_side_metrics(records: list[dict[str, Any]], init_cash: float) -> SideMetrics:
    trades = len(records)
    pnl_values = [float(record.get("pnl") or 0.0) for record in records]
    pnl = sum(pnl_values)
    return_pct = pnl / float(init_cash) if float(init_cash) != 0.0 else 0.0

    if trades == 0:
        return SideMetrics(
            trades=0,
            pnl=0.0,
            return_pct=0.0,
            profit_factor=None,
            win_rate=None,
        )

    gross_profit = sum(value for value in pnl_values if value > 0.0)
    gross_loss = abs(sum(value for value in pnl_values if value < 0.0))
    if gross_loss == 0.0:
        profit_factor = None
    else:
        profit_factor = _nullable_finite(gross_profit / gross_loss)

    win_rate = sum(1 for value in pnl_values if value > 0.0) / trades
    return SideMetrics(
        trades=trades,
        pnl=pnl,
        return_pct=return_pct,
        profit_factor=profit_factor,
        win_rate=win_rate,
    )


def build_trade_side_metrics(
    trade_records: list[dict[str, Any]],
    init_cash: float,
    *,
    sharpe: float,
    max_drawdown: float,
    fees_rate: float = 0.0,
    trade_management_summary: dict[str, Any] | None = None,
) -> VariantMetrics:
    """Realized PnL / PF / win_rate use ``status == \"closed\"`` only; open rows are counted in ``open_trades``."""

    closed = [record for record in trade_records if record.get("status") == "closed"]
    open_recs = [record for record in trade_records if record.get("status") == "open"]
    open_trades = OpenTradesBreakdown(
        long=sum(1 for record in open_recs if record.get("direction") == "long"),
        short=sum(1 for record in open_recs if record.get("direction") == "short"),
        total=len(open_recs),
    )

    long_closed = [record for record in closed if record.get("direction") == "long"]
    short_closed = [record for record in closed if record.get("direction") == "short"]
    return VariantMetrics(
        long=_build_side_metrics(long_closed, init_cash),
        short=_build_side_metrics(short_closed, init_cash),
        total=_build_side_metrics(closed, init_cash),
        sharpe=ensure_finite_metric("sharpe_ratio", sharpe),
        max_drawdown=ensure_finite_metric("max_drawdown", max_drawdown),
        open_trades=open_trades,
        profile_breakdown=build_profile_breakdown(trade_records),
        profile_side_breakdown=build_profile_side_breakdown(trade_records),
        exit_reason_breakdown=build_exit_reason_breakdown(trade_records),
        fee_diagnostics=build_fee_diagnostics(trade_records, fees_rate=fees_rate),
        bounce_counter_breakdown=build_bounce_counter_breakdown(trade_records),
        trade_management_summary=trade_management_summary,
        **build_trade_quality_breakdowns(trade_records),
    )


def _equity_metrics_from_trades(
    trade_records: list[dict[str, Any]],
    *,
    init_cash: float,
    n_bars: int,
) -> tuple[float, float]:
    equity = float(init_cash)
    peak = equity
    max_dd = 0.0
    for rec in trade_records:
        if rec.get("status") != "closed":
            continue
        pnl = float(rec.get("pnl") or 0.0)
        equity += pnl
        if equity > peak:
            peak = equity
        if peak > 0:
            dd = (equity / peak) - 1.0
            if dd < max_dd:
                max_dd = dd
    closed_pnls = [
        float(r.get("pnl") or 0.0) for r in trade_records if r.get("status") == "closed"
    ]
    if len(closed_pnls) < 2:
        return 0.0, ensure_finite_metric("max_drawdown", max_dd)
    import numpy as np

    arr = np.asarray(closed_pnls, dtype=float)
    std = float(arr.std())
    sharpe = float(arr.mean() / std * np.sqrt(len(arr))) if std > 0 else 0.0
    return ensure_finite_metric("sharpe_ratio", sharpe), ensure_finite_metric(
        "max_drawdown", max_dd
    )


def _run_execution_combiner_strategy_spec(
    spec: EmaPullbackStrategySpec,
    enriched: pd.DataFrame,
    plan: Any,
    *,
    signals: Any,
    exit_outputs: Any,
    context_bundle: Any,
    init_cash: float,
    fees: float,
    slippage: float,
    adapter: ExecutionExitAdapter,
    adapter_kind: Literal["legacy", "v2"],
) -> VariantResult:
    open_s, high_s, low_s = _open_high_low_for_vectorbt(enriched)
    close = enriched["close"].astype(float)
    entries_for_portfolio = signals.entries.fillna(False).astype(bool) & exit_outputs.stop_ready_long
    short_entries_for_portfolio = (
        signals.short_entries.fillna(False).astype(bool) & exit_outputs.stop_ready_short
    )
    combiner_result = run_execution_combiner_loop(
        spec=spec,
        close=close,
        open_=open_s,
        high=high_s,
        low=low_s,
        entries=entries_for_portfolio,
        short_entries=short_entries_for_portfolio,
        exit_outputs=exit_outputs,
        adapter=adapter,
        component_map=build_exit_instance_component_map(spec),
    )
    trade_management_events: list[dict[str, Any]] | None = None
    trade_management_summary: dict[str, Any] | None = None
    if adapter_kind == "v2":
        assert isinstance(adapter, ManagedExitProviderAdapter)
        trade_records = build_execution_integrated_trade_records(
            combiner_result.closed,
            index=close.index,
            fees_rate=float(fees),
            base_timeframe=spec.base_timeframe,
        )
        managed_runtime = execution_result_to_managed_runtime_result(
            ManagedExecutionLoopResult(
                closed=combiner_result.closed,
                events=combiner_result.events,
                states_by_trade_id=adapter.states_by_trade_id,
            )
        )
        apply_managed_trade_management_diagnostics(trade_records, managed_runtime)
        trade_management_events = trade_management_events_payload(managed_runtime)
        trade_management_summary = build_trade_management_summary(trade_records)
    else:
        trade_records = build_managed_trade_records(
            combiner_result.closed,
            index=close.index,
            close=close,
            high=high_s,
            low=low_s,
            open_=open_s,
            attribution=exit_outputs.attribution,
            fees_rate=float(fees),
            base_timeframe=spec.base_timeframe,
            profile_long=exit_outputs.profile_long,
            profile_short=exit_outputs.profile_short,
            context_state=exit_outputs.context_state,
        )
    sharpe, max_dd = _equity_metrics_from_trades(
        trade_records, init_cash=float(init_cash), n_bars=len(close)
    )
    return VariantResult(
        variant=spec.variant,
        config_id=strategy_spec_config_id(spec),
        symbol=spec.symbol.strip().upper(),
        timeframe=spec.base_timeframe.strip(),
        strategy_spec=strategy_spec_to_dict(spec),
        metrics=build_trade_side_metrics(
            trade_records,
            float(init_cash),
            sharpe=sharpe,
            max_drawdown=max_dd,
            fees_rate=float(fees),
            trade_management_summary=trade_management_summary,
        ),
        component_counters=list(signals.output_counters + exit_outputs.output_counters),
        trade_records=trade_records,
        trade_management_events=trade_management_events,
    )


def run_strategy_spec(
    spec: EmaPullbackStrategySpec,
    ohlcv: Any,
    *,
    init_cash: float = 100.0,
    fees: float = 0.0,
    slippage: float = 0.0,
) -> VariantResult:
    """Run one strategy spec over shared OHLCV."""
    try:
        import vectorbt as vbt
    except ImportError as exc:  # pragma: no cover - exercised when extra missing
        raise SystemExit(
            "vectorbt (and research extras) are required. "
            'Install with: pip install -e ".[research]"'
        ) from exc

    plan = build_feature_plan_from_strategy_spec(spec)
    enriched = add_feature_columns_from_plan(ohlcv, plan)
    open_s, high_s, low_s = _open_high_low_for_vectorbt(enriched)
    context_bundle = build_context_bundle_for_spec(spec, enriched, plan)
    signals = build_signals_from_spec(
        enriched, spec, plan, context_bundle=context_bundle
    )
    exit_outputs = build_exit_outputs_from_spec(
        enriched, spec, plan, context_bundle=context_bundle
    )

    # Future diagnostic_only trade-management must run after actual trade_records
    # are built from the chosen path. It must not feed phase state back into
    # vectorbt masks, stops, exits, or legacy BE managed decisions.
    if _needs_execution_combiner(spec):
        close = enriched["close"].astype(float)
        adapter, adapter_kind = _build_execution_exit_adapter(spec, enriched, close)
        return _run_execution_combiner_strategy_spec(
            spec,
            enriched,
            plan,
            signals=signals,
            exit_outputs=exit_outputs,
            context_bundle=context_bundle,
            init_cash=init_cash,
            fees=fees,
            slippage=slippage,
            adapter=adapter,
            adapter_kind=adapter_kind,
        )

    close = enriched["close"].astype(float)
    if close.isna().any():
        raise SystemExit("close contains NaN — check DB / repair pipeline.")

    fast_col = plan.anchor_columns["fast"]
    slow_col = plan.anchor_columns["slow"]
    ema_f = enriched[fast_col]
    ema_s = enriched[slow_col]
    if ema_f.isna().any() or ema_s.isna().any():
        raise SystemExit("EMA columns contain NaN (unexpected for ewm on finite close).")

    freq = pandas_freq_alias(spec.base_timeframe)
    stop_kwargs = exit_outputs.stop_kwargs()
    entries_for_portfolio = signals.entries.fillna(False).astype(bool) & exit_outputs.stop_ready_long
    short_entries_for_portfolio = (
        signals.short_entries.fillna(False).astype(bool) & exit_outputs.stop_ready_short
    )

    long_exit_matrix = np.column_stack(
        [
            exit_outputs.long_exits_by_profile["aligned"].fillna(False).to_numpy(dtype=bool),
            exit_outputs.long_exits_by_profile["countertrend"].fillna(False).to_numpy(dtype=bool),
            exit_outputs.long_exits_by_profile["neutral"].fillna(False).to_numpy(dtype=bool),
        ]
    )
    short_exit_matrix = np.column_stack(
        [
            exit_outputs.short_exits_by_profile["aligned"].fillna(False).to_numpy(dtype=bool),
            exit_outputs.short_exits_by_profile["countertrend"].fillna(False).to_numpy(dtype=bool),
            exit_outputs.short_exits_by_profile["neutral"].fillna(False).to_numpy(dtype=bool),
        ]
    )
    sl_long_matrix = np.column_stack(
        [
            exit_outputs.sl_stop_by_profile["aligned"].to_numpy(dtype=float),
            exit_outputs.sl_stop_by_profile["countertrend"].to_numpy(dtype=float),
            exit_outputs.sl_stop_by_profile["neutral"].to_numpy(dtype=float),
        ]
    )
    sl_short_matrix = sl_long_matrix
    tp_long_matrix = np.column_stack(
        [
            exit_outputs.tp_stop_by_profile["aligned"].to_numpy(dtype=float),
            exit_outputs.tp_stop_by_profile["countertrend"].to_numpy(dtype=float),
            exit_outputs.tp_stop_by_profile["neutral"].to_numpy(dtype=float),
        ]
    )
    tp_short_matrix = tp_long_matrix
    long_profile_codes = np.asarray(
        [_profile_code(str(v)) for v in exit_outputs.profile_long.to_list()],
        dtype=np.int64,
    )
    short_profile_codes = np.asarray(
        [_profile_code(str(v)) for v in exit_outputs.profile_short.to_list()],
        dtype=np.int64,
    )
    locked_profile = np.asarray([-1], dtype=np.int64)

    from numba import njit

    @njit
    def signal_func_nb(
        c,
        entries_arr,
        short_entries_arr,
        long_exit_mat,
        short_exit_mat,
        long_profile_arr,
        short_profile_arr,
        locked,
    ):
        le = False
        lx = False
        se = False
        sx = False
        i = c.i
        col = c.col
        if c.position_now == 0:
            if entries_arr[i]:
                le = True
                locked[col] = long_profile_arr[i]
            elif short_entries_arr[i]:
                se = True
                locked[col] = short_profile_arr[i]
        elif c.position_now > 0:
            prof = locked[col]
            if prof < 0:
                prof = long_profile_arr[i]
                locked[col] = prof
            lx = long_exit_mat[i, prof]
            if lx:
                locked[col] = -1
        else:
            prof = locked[col]
            if prof < 0:
                prof = short_profile_arr[i]
                locked[col] = prof
            sx = short_exit_mat[i, prof]
            if sx:
                locked[col] = -1
        return le, lx, se, sx

    @njit
    def adjust_sl_func_nb(c, sl_long_mat, sl_short_mat, long_profile_arr, short_profile_arr, locked):
        if c.position_now > 0:
            prof = locked[c.col]
            if prof < 0:
                prof = long_profile_arr[c.init_i]
                locked[c.col] = prof
            return sl_long_mat[c.init_i, prof], False
        if c.position_now < 0:
            prof = locked[c.col]
            if prof < 0:
                prof = short_profile_arr[c.init_i]
                locked[c.col] = prof
            return sl_short_mat[c.init_i, prof], False
        return np.nan, False

    @njit
    def adjust_tp_func_nb(c, tp_long_mat, tp_short_mat, long_profile_arr, short_profile_arr, locked):
        if c.position_now > 0:
            prof = locked[c.col]
            if prof < 0:
                prof = long_profile_arr[c.init_i]
                locked[c.col] = prof
            return tp_long_mat[c.init_i, prof]
        if c.position_now < 0:
            prof = locked[c.col]
            if prof < 0:
                prof = short_profile_arr[c.init_i]
                locked[c.col] = prof
            return tp_short_mat[c.init_i, prof]
        return np.nan

    pf = vbt.Portfolio.from_signals(
        close,
        signal_func_nb=signal_func_nb,
        signal_args=(
            entries_for_portfolio.to_numpy(dtype=bool),
            short_entries_for_portfolio.to_numpy(dtype=bool),
            long_exit_matrix,
            short_exit_matrix,
            long_profile_codes,
            short_profile_codes,
            locked_profile,
        ),
        open=open_s,
        high=high_s,
        low=low_s,
        freq=freq,
        init_cash=float(init_cash),
        fees=float(fees),
        slippage=float(slippage),
        adjust_sl_func_nb=adjust_sl_func_nb,
        adjust_sl_args=(
            sl_long_matrix,
            sl_short_matrix,
            long_profile_codes,
            short_profile_codes,
            locked_profile,
        ),
        adjust_tp_func_nb=adjust_tp_func_nb,
        adjust_tp_args=(
            tp_long_matrix,
            tp_short_matrix,
            long_profile_codes,
            short_profile_codes,
            locked_profile,
        ),
    )

    exit_component_map = build_exit_instance_component_map(spec)
    from research.strategies.ema_pullback.components.registry import EMA_BOUNCE_COUNTER_SETUP_COMPONENT
    from research.strategies.ema_pullback.setup_runtime import run_setup_trace

    setup_traces_by_instance_side: dict[str, dict[str, dict[str, pd.Series]]] | None = None
    bounce_rules = [
        rule
        for rule in spec.setups
        if rule.component_id == EMA_BOUNCE_COUNTER_SETUP_COMPONENT
    ]
    if bounce_rules:
        setup_traces_by_instance_side = {}
        anchor_col = plan.anchor_columns["anchor"]
        for rule in bounce_rules:
            by_side: dict[str, dict[str, pd.Series]] = {}
            for side in ("long", "short"):
                if not spec.trade_sides.includes(side):
                    continue
                by_side[side] = run_setup_trace(
                    enriched,
                    rule,
                    plan,
                    anchor_col=anchor_col,
                    side=side,
                )
            setup_traces_by_instance_side[rule.instance_id] = by_side
    trade_records = extract_trade_records(
        pf,
        close,
        high=high_s,
        low=low_s,
        open_s=open_s,
        attribution=exit_outputs.attribution,
        profile_long=exit_outputs.profile_long,
        profile_short=exit_outputs.profile_short,
        context_state=exit_outputs.context_state,
        diagnostic_atr_series=None,
        base_timeframe=spec.base_timeframe,
        exit_component_map=exit_component_map,
        strategy_spec=spec,
        context_bundle=context_bundle,
        setup_traces_by_instance_side=setup_traces_by_instance_side,
    )
    trade_management_events: list[dict[str, Any]] | None = None
    trade_management_summary: dict[str, Any] | None = None
    exit_management = spec.trade_management.exit_management
    if exit_management.mode == "diagnostic_only":
        diagnostic_runtime = build_trade_runtime_diagnostics(
            trade_records=trade_records,
            high=high_s,
            low=low_s,
            close=close,
            phase_rules=exit_management.phase_rules,
            atr_series_by_key=_atr_series_for_phase_rules(enriched, spec),
        )
        apply_trade_management_diagnostics(trade_records, diagnostic_runtime)
        trade_management_events = trade_management_events_payload(diagnostic_runtime)
        trade_management_summary = build_trade_management_summary(trade_records)
    elif is_managed_exit_mode(exit_management.mode):
        managed_runtime = run_managed_exit_runtime(
            trade_records=trade_records,
            open_=open_s,
            high=high_s,
            low=low_s,
            close=close,
            phase_rules=exit_management.phase_rules,
            stop_management=exit_management.stop_management,
            take_management=exit_management.take_management,
            runtime_exits=exit_management.runtime_exits,
            atr_series_by_key=_atr_series_for_phase_rules(enriched, spec),
        )
        apply_managed_trade_management_diagnostics(trade_records, managed_runtime)
        trade_management_events = trade_management_events_payload(managed_runtime)
        trade_management_summary = build_trade_management_summary(trade_records)

    sharpe = ensure_finite_metric("sharpe_ratio", float(pf.sharpe_ratio()))
    max_dd_raw = pf.max_drawdown()
    max_dd_f = float(max_dd_raw) if hasattr(max_dd_raw, "item") else float(max_dd_raw)
    max_dd_f = ensure_finite_metric("max_drawdown", max_dd_f)

    return VariantResult(
        variant=spec.variant,
        config_id=strategy_spec_config_id(spec),
        symbol=spec.symbol.strip().upper(),
        timeframe=spec.base_timeframe.strip(),
        strategy_spec=strategy_spec_to_dict(spec),
        metrics=build_trade_side_metrics(
            trade_records,
            float(init_cash),
            sharpe=sharpe,
            max_drawdown=max_dd_f,
            fees_rate=float(fees),
            trade_management_summary=trade_management_summary,
        ),
        component_counters=list(signals.output_counters + exit_outputs.output_counters),
        trade_records=trade_records,
        trade_management_events=trade_management_events,
    )
