from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from quant_worker.strategy_rules import evaluate_preset
from quant_worker.strategy_rules.custom_conditions import evaluate_custom_condition


IndicatorName = Literal["ma5", "ma10", "ma60", "dkx", "madkx10"]


@dataclass(frozen=True)
class ConditionResult:
    condition: dict[str, Any]
    status: Literal["matched", "not_matched", "unavailable"]
    values: dict[str, Any]
    message: str


@dataclass(frozen=True)
class EvaluationResult:
    status: Literal["matched", "not_matched", "unavailable"]
    conditions: list[ConditionResult]


def _indicator(context: dict[str, Any], name: str, index: int = -1) -> float | None:
    value = context["indicators"][index].get(name)
    return float(value) if value is not None else None


def _unavailable(condition: dict[str, Any], message: str, values: dict[str, Any]) -> ConditionResult:
    return ConditionResult(condition, "unavailable", values, message)


def evaluate_condition(condition: dict[str, Any], context: dict[str, Any]) -> ConditionResult:
    condition_type = condition.get("type")
    custom_result = evaluate_custom_condition(condition, context)
    if custom_result is not None:
        return custom_result
    if condition_type == "preset":
        preset_id = str(condition.get("preset_id", ""))
        result = evaluate_preset(preset_id, condition, context)
        return result if result is not None else _unavailable(condition, "不支持的预设筛选条件", {})
    if condition_type == "price_above_indicator":
        indicator = condition.get("indicator")
        price = context.get("current_price")
        value = _indicator(context, indicator)
        values = {"price": price, indicator: value}
        if price is None or value is None:
            return _unavailable(condition, "价格或指标不可用", values)
        return ConditionResult(condition, "matched" if price > value else "not_matched", values, "价格高于指标" if price > value else "价格未高于指标")

    if condition_type == "cross_above":
        left, right = condition.get("left"), condition.get("right")
        previous_left, previous_right = _indicator(context, left, -2), _indicator(context, right, -2)
        current_left, current_right = _indicator(context, left), _indicator(context, right)
        values = {"previous_left": previous_left, "previous_right": previous_right, "left": current_left, "right": current_right}
        if any(value is None for value in values.values()):
            return _unavailable(condition, "穿越判断所需指标不足", values)
        matched = previous_left <= previous_right and current_left > current_right
        return ConditionResult(condition, "matched" if matched else "not_matched", values, "发生上穿" if matched else "未发生上穿")

    if condition_type == "volume_multiple":
        window = int(condition.get("window", 5))
        minimum = float(condition.get("minimum", 1))
        bars = context["bars"]
        if len(bars) < window + 1:
            return _unavailable(condition, "成交量历史不足", {"multiple": None})
        current_volume = float(bars[-1]["volume"])
        average = sum(float(bar["volume"]) for bar in bars[-window - 1:-1]) / window
        multiple = current_volume / average if average > 0 else None
        if multiple is None:
            return _unavailable(condition, "历史平均成交量为零", {"multiple": None})
        return ConditionResult(condition, "matched" if multiple >= minimum else "not_matched", {"multiple": multiple}, f"成交量倍数 {multiple:.2f}")

    return _unavailable(condition, "不支持的条件类型", {})


def evaluate_rule(rule: dict[str, Any], context: dict[str, Any]) -> EvaluationResult:
    conditions = [evaluate_condition(condition, context) for condition in rule.get("conditions", [])]
    if not conditions:
        return EvaluationResult("unavailable", [])
    if any(result.status == "unavailable" for result in conditions):
        return EvaluationResult("unavailable", conditions)
    operator = rule.get("operator", "all")
    matched = all(result.status == "matched" for result in conditions) if operator == "all" else any(result.status == "matched" for result in conditions)
    return EvaluationResult("matched" if matched else "not_matched", conditions)
