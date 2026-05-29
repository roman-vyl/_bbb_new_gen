"""Strategy-level context bundle and consumer policies."""

from research.strategies.ema_pullback.context.bundle import ContextBundle, ContextOutput
from research.strategies.ema_pullback.context.evaluation import (
    ContextConsumptionResult,
    SideAwareEvaluationContext,
    evaluate_context_consumption,
)
from research.strategies.ema_pullback.context.policies import (
    EXIT_PROFILE_BY_HTF_STATE_POLICY,
    HTF_REGIME_GATE_POLICY,
    HTF_STATE_GATE_POLICY,
    apply_exit_profile_by_htf_state,
    apply_htf_regime_gate,
    apply_htf_state_gate,
    resolve_htf_regime,
)

__all__ = [
    "ContextBundle",
    "ContextConsumptionResult",
    "ContextOutput",
    "EXIT_PROFILE_BY_HTF_STATE_POLICY",
    "HTF_REGIME_GATE_POLICY",
    "HTF_STATE_GATE_POLICY",
    "SideAwareEvaluationContext",
    "apply_exit_profile_by_htf_state",
    "apply_htf_regime_gate",
    "apply_htf_state_gate",
    "evaluate_context_consumption",
    "resolve_htf_regime",
]
