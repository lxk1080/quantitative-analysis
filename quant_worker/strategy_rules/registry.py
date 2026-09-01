from __future__ import annotations

from typing import Any, Callable

from quant_worker.strategy_rules.mid_term_trend import evaluate_mid_term_trend
from quant_worker.strategy_rules.n_low_absorption import evaluate_n_low_absorption
from quant_worker.strategy_rules.n_pattern import evaluate_n_pattern

PresetEvaluator = Callable[[dict[str, Any], dict[str, Any]], Any]

PRESET_EVALUATORS: dict[str, PresetEvaluator] = {
    "n_pattern": evaluate_n_pattern,
    "mid_term_trend": evaluate_mid_term_trend,
    "n_low_absorption": evaluate_n_low_absorption,
}


def evaluate_preset(preset_id: str, condition: dict[str, Any], context: dict[str, Any]) -> Any | None:
    evaluator = PRESET_EVALUATORS.get(preset_id)
    return evaluator(condition, context) if evaluator else None
