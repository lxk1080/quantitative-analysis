from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def _result(condition: dict[str, Any], status: str, values: dict[str, Any], message: str) -> Any:
    from quant_worker.rules import ConditionResult
    return ConditionResult(condition, status, values, message)


def _unavailable(condition: dict[str, Any], message: str) -> Any:
    return _result(condition, "unavailable", {}, message)


def _offset_bar(context: dict[str, Any], offset: int) -> dict[str, Any] | None:
    bars = context.get("bars", [])
    return bars[-1 - offset] if offset >= 0 and len(bars) > offset else None


def _limit_price(pre_close: float, code: str) -> Decimal:
    ratio = Decimal("0.20") if code.startswith(("300", "301")) else Decimal("0.10")
    return (Decimal(str(pre_close)) * (Decimal("1") + ratio)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def evaluate_custom_condition(condition: dict[str, Any], context: dict[str, Any]) -> Any | None:
    kind = str(condition.get("type", ""))
    security = context.get("security", {})
    code = str(security.get("code", ""))
    exchange = str(security.get("exchange", ""))
    if kind == "exclude_st":
        return _result(condition, "not_matched" if bool(security.get("is_st")) else "matched", {}, "已排除 ST 股票" if bool(security.get("is_st")) else "非 ST 股票")
    if kind == "exclude_star":
        excluded = code.startswith(("688", "689"))
        return _result(condition, "not_matched" if excluded else "matched", {}, "已排除科创板股票" if excluded else "非科创板股票")
    if kind == "exclude_bj":
        excluded = exchange == "BJ" or code.startswith(("4", "8", "920"))
        return _result(condition, "not_matched" if excluded else "matched", {}, "已排除北交所股票" if excluded else "非北交所股票")

    if kind == "limit_up_days_ago":
        offset = int(condition.get("days_ago", 3))
        bar = _offset_bar(context, offset)
        if bar is None:
            return _unavailable(condition, "日线不足，无法判断涨停")
        raw_close, pre_close = bar.get("raw_close"), bar.get("pre_close")
        if raw_close is None or pre_close is None or float(pre_close) <= 0: return _unavailable(condition, "缺少涨停日原始价格")
        target = _limit_price(float(pre_close), code)
        matched = Decimal(str(raw_close)) + Decimal("0.005") >= target
        return _result(condition, "matched" if matched else "not_matched", {"date": bar.get("trade_date"), "close": raw_close, "limit_price": float(target)}, f"{offset} 个交易日前{'涨停' if matched else '未涨停'}")

    if kind == "kline_above_ma":
        days, ma_days = int(condition.get("days", 3)), int(condition.get("ma_days", 5))
        all_bars = context.get("bars", [])
        if days <= 0 or ma_days <= 0 or len(all_bars) < days + ma_days - 1: return _unavailable(condition, f"日线不足，无法计算 MA{ma_days}")
        recent_indexes = range(len(all_bars) - days, len(all_bars))
        matched = all(
            float(all_bars[index]["low_qfq"]) >= sum(float(item["close_qfq"]) for item in all_bars[index - ma_days + 1:index + 1]) / ma_days
            for index in recent_indexes
        )
        return _result(condition, "matched" if matched else "not_matched", {}, f"最近 {days} 个交易日{'未跌破' if matched else '存在跌破'} MA{ma_days}")

    if kind == "close_above_dkx_days":
        days = int(condition.get("days", 9)); bars = context.get("bars", [])[-days:]
        if days <= 0 or len(bars) < days or any(item.get("close_qfq") is None or item.get("dkx") is None for item in bars): return _unavailable(condition, f"最近 {days} 个交易日缺少 DKX 指标")
        matched = all(float(item["close_qfq"]) > float(item["dkx"]) for item in bars)
        return _result(condition, "matched" if matched else "not_matched", {}, f"最近 {days} 个交易日收盘价{'均在' if matched else '未全部在'} DKX 之上")

    if kind == "two_month_return_rank":
        top = int(condition.get("top", 30)); rank = context.get("two_month_rank")
        if rank is None: return _unavailable(condition, "缺少近两个月涨幅排名")
        return _result(condition, "matched" if int(rank) <= top else "not_matched", {"rank": int(rank)}, f"近两个月涨幅排名第 {rank} 名")

    if kind == "daily_return_range":
        days, lower, upper = int(condition.get("days", 4)), float(condition.get("lower", 0)), float(condition.get("upper", 3))
        bars = context.get("bars", [])
        if days <= 0 or len(bars) < days + 1: return _unavailable(condition, "日线不足，无法计算连续涨幅")
        changes = [(float(bars[index]["close_qfq"]) / float(bars[index - 1]["close_qfq"]) - 1) * 100 for index in range(len(bars) - days, len(bars))]
        matched = all(lower <= value <= upper for value in changes)
        return _result(condition, "matched" if matched else "not_matched", {"daily_returns": changes}, f"连续 {days} 天涨幅{'均在' if matched else '未全部在'} {lower:g}% 到 {upper:g}%")

    if kind == "interval_return_below":
        days, maximum = int(condition.get("days", 4)), float(condition.get("maximum", 0)); bars = context.get("bars", [])[-days:]
        if days <= 0 or len(bars) < days or float(bars[0]["close_qfq"]) <= 0: return _unavailable(condition, "日线不足，无法计算区间涨幅")
        change = (float(bars[-1]["close_qfq"]) / float(bars[0]["close_qfq"]) - 1) * 100
        return _result(condition, "matched" if change < maximum else "not_matched", {"interval_return": change}, f"最近 {days} 个交易日区间涨幅 {change:.2f}%")

    if kind == "volume_ratio_days_ago":
        offset, minimum = int(condition.get("days_ago", 0)), float(condition.get("minimum", 3))
        bars = context.get("bars", [])
        if offset < 0:
            return _unavailable(condition, "交易日前不能小于 0")
        index = len(bars) - 1 - offset
        if index < 5 or index >= len(bars):
            return _unavailable(condition, "日线不足，无法计算量比")
        minutes = float(bars[index].get("trading_minutes", 240))
        if minutes <= 0:
            return _unavailable(condition, "缺少有效交易时长")
        average = sum(float(item.get("volume") or 0) for item in bars[index - 5:index]) / 5
        ratio = (float(bars[index].get("volume") or 0) / minutes) / (average / 240) if average > 0 else None
        if ratio is None:
            return _unavailable(condition, "前 5 日平均成交量为零")
        return _result(condition, "matched" if ratio > minimum else "not_matched", {"volume_ratio": ratio}, f"{offset} 个交易日前量比 {ratio:.2f}")

    if kind == "close_dkx_deviation":
        offset, lower, upper = int(condition.get("days_ago", 0)), float(condition.get("lower", -2)), float(condition.get("upper", 5))
        bar = _offset_bar(context, offset)
        if bar is None or bar.get("close_qfq") is None or bar.get("dkx") is None or float(bar["dkx"]) == 0: return _unavailable(condition, "缺少收盘价或 DKX 指标")
        change = (float(bar["close_qfq"]) - float(bar["dkx"])) / float(bar["dkx"]) * 100
        return _result(condition, "matched" if lower < change < upper else "not_matched", {"deviation": change, "date": bar.get("trade_date")}, f"{offset} 个交易日前收盘价相对 DKX 偏离 {change:.2f}%")
    return None
