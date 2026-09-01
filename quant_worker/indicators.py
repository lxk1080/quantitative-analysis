from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Sequence

from quant_worker.config import INDICATOR_VERSION
from quant_worker.models import DailyBar


@dataclass(frozen=True)
class IndicatorValue:
    ma5: float | None
    ma10: float | None
    ma60: float | None
    dkx: float | None
    madkx10: float | None


def rolling_mean(values: Sequence[float | None], window: int) -> list[float | None]:
    if window <= 0:
        raise ValueError("window must be positive")
    result: list[float | None] = []
    rolling: list[float] = []
    for value in values:
        if value is None or not isfinite(value):
            rolling.clear()
            result.append(None)
            continue
        rolling.append(value)
        if len(rolling) > window:
            rolling.pop(0)
        result.append(sum(rolling) / window if len(rolling) == window else None)
    return result


def calculate_dkx(bars: Sequence[DailyBar]) -> list[float | None]:
    """Tonghuashun DKX formula with the default MADKX(10) signal line.

    The final term intentionally uses REF(MID, 20), not REF(MID, 19): this
    follows the formula exported by Tonghuashun and leaves a one-period gap.
    """
    mid = [
        (3 * bar.close_qfq + bar.open_qfq + bar.high_qfq + bar.low_qfq) / 6
        for bar in bars
    ]
    result: list[float | None] = []
    for index in range(len(mid)):
        if index < 20:
            result.append(None)
            continue
        weighted_sum = sum((20 - offset) * mid[index - offset] for offset in range(19)) + mid[index - 20]
        result.append(weighted_sum / 210)
    return result


def calculate_indicators(bars: Sequence[DailyBar]) -> list[IndicatorValue]:
    ordered = sorted(bars, key=lambda item: item.trade_date)
    closes = [bar.close_qfq for bar in ordered]
    dkx = calculate_dkx(ordered)
    return [
        IndicatorValue(ma5, ma10, ma60, dkx_value, madkx10)
        for ma5, ma10, ma60, dkx_value, madkx10 in zip(
            rolling_mean(closes, 5),
            rolling_mean(closes, 10),
            rolling_mean(closes, 60),
            dkx,
            rolling_mean(dkx, 10),
            strict=True,
        )
    ]


__all__ = ["INDICATOR_VERSION", "IndicatorValue", "calculate_indicators", "rolling_mean"]
