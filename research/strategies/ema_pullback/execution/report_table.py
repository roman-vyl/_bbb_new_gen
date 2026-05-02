"""Stdout comparison table rendering for ema_pullback variants."""

from __future__ import annotations

from typing import Any

from research.strategies.ema_pullback.execution.result_models import VariantResult


def comparison_row(variant_result: VariantResult | dict[str, Any]) -> dict[str, float | str]:
    """Flatten a variant result for the stdout comparison table."""

    if isinstance(variant_result, VariantResult):
        anchor_stack = variant_result.strategy_spec["anchor_stack"]
        return {
            "variant": variant_result.variant,
            "config_id": variant_result.config_id,
            "ema_fast": anchor_stack["fast"]["period"],
            "ema_slow": anchor_stack["slow"]["period"],
            "trades": variant_result.metrics.trades,
            "sharpe": variant_result.metrics.sharpe,
            "profit_factor": variant_result.metrics.profit_factor,
            "max_drawdown": variant_result.metrics.max_drawdown,
        }

    m = variant_result["metrics"]
    anchor_stack = variant_result["strategy_spec"]["anchor_stack"]
    return {
        "variant": variant_result["variant"],
        "config_id": variant_result["config_id"],
        "ema_fast": anchor_stack["fast"]["period"],
        "ema_slow": anchor_stack["slow"]["period"],
        "trades": m["trades"],
        "sharpe": m["sharpe"],
        "profit_factor": m["profit_factor"],
        "max_drawdown": m["max_drawdown"],
    }


def print_comparison_table(rows: list[dict[str, float | str]]) -> None:
    headers = (
        "variant",
        "config_id",
        "ema_fast",
        "ema_slow",
        "trades",
        "sharpe",
        "profit_factor",
        "max_drawdown",
    )
    rendered: list[dict[str, str]] = []
    for row in rows:
        rendered.append(
            {
                "variant": str(row["variant"]),
                "config_id": str(row["config_id"]),
                "ema_fast": str(row["ema_fast"]),
                "ema_slow": str(row["ema_slow"]),
                "trades": str(row["trades"]),
                "sharpe": f"{float(row['sharpe']):.6f}",
                "profit_factor": f"{float(row['profit_factor']):.6f}",
                "max_drawdown": f"{float(row['max_drawdown']):.6f}",
            }
        )

    widths = {h: len(h) for h in headers}
    for row in rendered:
        for h in headers:
            widths[h] = max(widths[h], len(row[h]))

    separator = "-+-".join("-" * widths[h] for h in headers)
    print(" | ".join(h.ljust(widths[h]) for h in headers))
    print(separator)
    for row in rendered:
        print(" | ".join(row[h].ljust(widths[h]) for h in headers))
