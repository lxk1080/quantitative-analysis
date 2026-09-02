from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from quant_worker.strategy_rules.universe import excluded_security_reason


def _result(condition: dict[str, Any], status: str, values: dict[str, Any], message: str) -> Any:
    # Import lazily to avoid a rules -> registry -> strategy -> rules import cycle.
    from quant_worker.rules import ConditionResult

    return ConditionResult(condition, status, values, message)


def _limit_ratio(code: str) -> Decimal:
    # ChiNext (300/301) uses a 20% limit.  STAR and Beijing are excluded by
    # this strategy, and the remaining A-share boards use the 10% rule.
    return Decimal("0.20") if code.startswith(("300", "301")) else Decimal("0.10")


def _limit_price(pre_close: float, ratio: Decimal) -> Decimal:
    return (Decimal(str(pre_close)) * (Decimal("1") + ratio)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def evaluate_n_pattern(condition: dict[str, Any], context: dict[str, Any]) -> Any:
    """Evaluate the preset N-pattern strategy against completed daily bars.

    A K-line "does not break MA5" means its low is at or above MA5.  The
    limit-up comparison deliberately uses the Tushare raw close/pre-close
    pair rather than QFQ values, because exchange price limits are defined on
    unadjusted trading prices.
    """
    security = context.get("security", {})
    code = str(security.get("code", ""))
    excluded_reason = excluded_security_reason(security)
    if excluded_reason:
        return _result(condition, "not_matched", {}, excluded_reason)

    bars = context.get("bars", [])
    if len(bars) < 4:
        return _result(condition, "unavailable", {}, "日线不足，无法判断 3 个交易日前涨停")

    # Before 16:00 the latest persisted daily bar is yesterday, while the
    # screening date is today.  Therefore "3 trading days ago" is bars[-3]
    # intraday (not bars[-4]); after close today's bar is persisted and the
    # ordinary bars[-4] offset applies.
    limit_index = -3 if context.get("mode") == "intraday" else -4
    limit_up_bar = bars[limit_index]
    raw_close = limit_up_bar.get("raw_close")
    pre_close = limit_up_bar.get("pre_close")
    if raw_close is None or pre_close is None or float(pre_close) <= 0:
        return _result(condition, "unavailable", {"limit_up_date": limit_up_bar.get("trade_date")}, "缺少涨停日原始价格")

    target = _limit_price(float(pre_close), _limit_ratio(code))
    close = Decimal(str(raw_close))
    # Provider numeric values can contain a tiny binary-conversion residue.
    is_limit_up = close + Decimal("0.005") >= target
    recent = bars[-3:]
    missing_ma5 = any(item.get("ma5") is None or item.get("low_qfq") is None for item in recent)
    values = {
        "limit_up_date": limit_up_bar.get("trade_date"),
        "limit_price": float(target),
        "limit_up_close": float(raw_close),
        "recent_low_ma5": [
            {"date": item.get("trade_date"), "low": item.get("low_qfq"), "ma5": item.get("ma5")}
            for item in recent
        ],
    }
    if missing_ma5:
        return _result(condition, "unavailable", values, "最近 3 个交易日缺少 MA5 指标")
    above_ma5 = all(float(item["low_qfq"]) >= float(item["ma5"]) for item in recent)
    if is_limit_up and above_ma5:
        return _result(condition, "matched", values, "3 个交易日前涨停，且最近 3 个交易日未跌破 MA5")
    if not is_limit_up:
        return _result(condition, "not_matched", values, "3 个交易日前未涨停")
    return _result(condition, "not_matched", values, "最近 3 个交易日存在跌破 MA5")
