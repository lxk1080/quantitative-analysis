from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal


@dataclass(frozen=True)
class DailyBar:
    stock_code: str
    trade_date: date
    open_qfq: float
    high_qfq: float
    low_qfq: float
    close_qfq: float
    volume: int
    amount: float | None = None
    turnover_rate: float | None = None
    raw_close: float | None = None


@dataclass(frozen=True)
class DailyBarInput(DailyBar):
    provider_name: str = ""
    fetched_at: datetime | None = None


@dataclass(frozen=True)
class SecurityInput:
    code: str
    exchange: str
    name: str
    security_type: str
    is_st: bool
    is_active: bool
    listed_at: date | None = None


@dataclass(frozen=True)
class RealtimeQuoteInput:
    stock_code: str
    quote_time: datetime
    raw_last_price: float
    volume: int | None
    amount: float | None
    provider_name: str


@dataclass(frozen=True)
class RawDailyBarInput:
    """Unadjusted daily bar.  QFQ bars are derived locally from these rows."""

    stock_code: str
    trade_date: date
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    pre_close: float | None
    volume: int
    amount: float | None
    provider_name: str
    fetched_at: datetime


@dataclass(frozen=True)
class MarketSnapshotBarInput:
    """A full-market raw quote, normalized from one AKShare realtime source."""

    stock_code: str
    name: str
    quote_time: datetime
    open_price: float | None
    high_price: float | None
    low_price: float | None
    last_price: float
    pre_close: float | None
    volume: int | None
    amount: float | None
    provider_name: str


ScreeningMode = Literal["intraday", "post_close"]
