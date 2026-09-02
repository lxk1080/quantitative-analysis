from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from quant_worker.strategy_rules.universe import excluded_security_reason


def _result(condition: dict[str, Any], status: str, values: dict[str, Any], message: str) -> Any:
    from quant_worker.rules import ConditionResult

    return ConditionResult(condition, status, values, message)


def _limit_ratio(code: str) -> Decimal:
    return Decimal("0.20") if code.startswith(("300", "301")) else Decimal("0.10")


def _limit_price(pre_close: float, ratio: Decimal) -> Decimal:
    return (Decimal(str(pre_close)) * (Decimal("1") + ratio)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def evaluate_n_low_absorption(condition: dict[str, Any], context: dict[str, Any]) -> Any:
    """Evaluate a four-day pullback after a limit-up day.

    The limit-up day is four completed trading days before the latest bar and
    is not included in the following four-day interval-return calculation.
    """
    security = context.get("security", {})
    code = str(security.get("code", ""))
    excluded_reason = excluded_security_reason(security)
    if excluded_reason:
        return _result(condition, "not_matched", {}, excluded_reason)

    bars = context.get("bars", [])
    if len(bars) < 5:
        return _result(condition, "unavailable", {}, "日线不足，无法判断 4 个交易日前涨停")
    intraday = context.get("mode") == "intraday"
    limit_up_bar = bars[-4] if intraday else bars[-5]
    interval_bars = bars[-3:] if intraday else bars[-4:]
    raw_close, pre_close = limit_up_bar.get("raw_close"), limit_up_bar.get("pre_close")
    if raw_close is None or pre_close is None or float(pre_close) <= 0:
        return _result(condition, "unavailable", {"limit_up_date": limit_up_bar.get("trade_date")}, "缺少涨停日原始价格")
    if any(item.get("close_qfq") is None for item in interval_bars):
        return _result(condition, "unavailable", {}, "最近 4 个交易日缺少收盘价")

    limit_price = _limit_price(float(pre_close), _limit_ratio(code))
    is_limit_up = Decimal(str(raw_close)) + Decimal("0.005") >= limit_price
    first_close = float(interval_bars[0]["close_qfq"])
    last_close = float(interval_bars[-1]["close_qfq"])
    interval_return = (last_close - first_close) / first_close if first_close > 0 else None
    values = {
        "limit_up_date": limit_up_bar.get("trade_date"),
        "limit_price": float(limit_price),
        "limit_up_close": float(raw_close),
        "interval_start_date": interval_bars[0].get("trade_date"),
        "interval_end_date": interval_bars[-1].get("trade_date"),
        "interval_return": interval_return,
    }
    if interval_return is None:
        return _result(condition, "unavailable", values, "最近 4 个交易日首日收盘价无效")
    if not is_limit_up:
        return _result(condition, "not_matched", values, "4 个交易日前未涨停")
    if interval_return >= 0:
        return _result(condition, "not_matched", values, f"最近 4 个交易日区间涨幅为 {interval_return:.2%}，不小于 0")
    return _result(condition, "matched", values, "4 个交易日前涨停，随后 4 个交易日区间回调")
