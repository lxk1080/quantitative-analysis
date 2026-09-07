"""Build the source-independent, chronological data view consumed by rules."""
from dataclasses import asdict
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from quant_worker.indicators import calculate_indicators
from quant_worker.models import DailyBar


def build_screening_bars(code: str, history: list[dict[str, Any]], quote: dict[str, float] | None = None) -> list[dict[str, Any]]:
    by_date = {str(bar["trade_date"]): dict(bar) for bar in history}
    if quote is not None:
        captured = datetime.fromtimestamp(quote["captured_timestamp"], ZoneInfo("Asia/Shanghai"))
        minute = captured.hour * 60 + captured.minute
        elapsed = max(0, min(120, minute - 570)) + max(0, min(120, minute - 780))
        # Persisted daily data is authoritative when this date is already present.
        by_date.setdefault(captured.date().isoformat(), {
            "trade_date": captured.date().isoformat(),
            "open_qfq": quote["qfq_open"], "high_qfq": quote["qfq_high"],
            "low_qfq": quote["qfq_low"], "close_qfq": quote["qfq_price"],
            "raw_close": quote["raw_last_price"], "pre_close": quote["raw_pre_close"],
            "volume": quote["volume"], "trading_minutes": elapsed,
        })
    bars = [by_date[key] for key in sorted(by_date)]
    values = calculate_indicators([
        DailyBar(stock_code=code, trade_date=date.fromisoformat(bar["trade_date"]),
                 open_qfq=float(bar["open_qfq"]), high_qfq=float(bar["high_qfq"]),
                 low_qfq=float(bar["low_qfq"]), close_qfq=float(bar["close_qfq"]),
                 volume=int(bar["volume"])) for bar in bars
    ])
    for bar, indicators in zip(bars, values, strict=True):
        bar.update(asdict(indicators))
        bar.setdefault("trading_minutes", 240)
    return bars
