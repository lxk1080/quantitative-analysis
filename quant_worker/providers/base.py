from __future__ import annotations

from datetime import date
from typing import Protocol

from quant_worker.models import DailyBarInput, MarketSnapshotBarInput, RealtimeQuoteInput, SecurityInput


class ProviderNotConfigured(RuntimeError):
    """Raised when a UI action needs a real provider that has not been selected."""


class MarketDataProvider(Protocol):
    """Vendor-neutral interface consumed by Python synchronization services."""

    def list_securities(self) -> list[SecurityInput]: ...

    def fetch_daily_bars(self, codes: list[str], start: date, end: date) -> tuple[dict[str, list[DailyBarInput]], dict[str, str]]: ...

    def fetch_realtime_quotes(self, codes: list[str]) -> tuple[list[RealtimeQuoteInput], dict[str, str]]: ...

    def fetch_market_snapshot(self) -> list[MarketSnapshotBarInput]: ...
