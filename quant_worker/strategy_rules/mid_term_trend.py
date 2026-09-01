from __future__ import annotations

from typing import Any

from quant_worker.strategy_rules.universe import excluded_security_reason


def _result(condition: dict[str, Any], status: str, values: dict[str, Any], message: str) -> Any:
    from quant_worker.rules import ConditionResult

    return ConditionResult(condition, status, values, message)


def evaluate_mid_term_trend(condition: dict[str, Any], context: dict[str, Any]) -> Any:
    """Evaluate the mid-term trend preset using QFQ closes and DKX values."""
    security = context.get("security", {})
    excluded_reason = excluded_security_reason(security)
    if excluded_reason:
        return _result(condition, "not_matched", {}, excluded_reason)

    bars = context.get("bars", [])
    if len(bars) < 10:
        return _result(condition, "unavailable", {}, "日线不足，无法判断前 9 个交易日趋势")
    previous_nine = bars[-10:-1]
    current = bars[-1]
    if current.get("dkx") is None or context.get("current_price") is None:
        return _result(condition, "unavailable", {}, "缺少今日价格或 DKX 指标")
    if any(item.get("close_qfq") is None or item.get("dkx") is None for item in previous_nine):
        return _result(condition, "unavailable", {}, "前 9 个交易日缺少 DKX 指标")

    current_dkx = float(current["dkx"])
    if current_dkx <= 0:
        return _result(condition, "unavailable", {}, "今日 DKX 无效")
    current_price = float(context["current_price"])
    deviation = (current_price - current_dkx) / current_dkx
    previous_above = all(float(item["close_qfq"]) > float(item["dkx"]) for item in previous_nine)
    values = {
        "current_price": current_price,
        "current_dkx": current_dkx,
        "deviation": deviation,
        "previous_nine": [{"date": item.get("trade_date"), "close": item.get("close_qfq"), "dkx": item.get("dkx")} for item in previous_nine],
    }
    if not previous_above:
        return _result(condition, "not_matched", values, "前 9 个交易日存在收盘价未站上 DKX")
    if not (-0.02 < deviation < 0.05):
        return _result(condition, "not_matched", values, f"当前价格相对 DKX 偏离 {deviation:.2%}，未落在 (-2%, 5%) 内")
    return _result(condition, "matched", values, "前 9 个交易日收盘价均在 DKX 之上，当前价格接近 DKX")
