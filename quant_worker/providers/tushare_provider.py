from __future__ import annotations

"""Tushare historical daily provider.

`daily(trade_date=...)` is a market-wide endpoint: one request retrieves one
historical trading day, instead of making one request per stock.  Tushare
returns unadjusted prices, so QFQ is derived locally by the storage service.
"""

import os
from contextlib import contextmanager
from datetime import UTC, date, datetime
from time import monotonic, sleep
from typing import Any

from quant_worker.config import load_project_env
from quant_worker.models import RawDailyBarInput
from quant_worker.providers.base import ProviderNotConfigured


class TushareDailyProvider:
    name = "tushare-daily"

    def __init__(self, client: Any | None = None) -> None:
        load_project_env()
        if client is None:
            try:
                import tushare as ts
            except ImportError as error:  # pragma: no cover - environment dependent
                raise ProviderNotConfigured("Tushare is not installed; run: python -m pip install -r requirements.txt") from error
            token = __import__("os").environ.get("TUSHARE_TOKEN", "").strip()
            if not token:
                raise ProviderNotConfigured("TUSHARE_TOKEN is not configured in .env.local")
            # `set_token` writes ~/.tushare (tk.csv). Passing the token here is
            # equivalent for API calls and keeps this application self-contained.
            client = ts.pro_api(token)
        self._client = client
        # A stale local proxy (commonly 127.0.0.1:7890) makes the worker fail
        # part way through a batch sync. Direct access is the safe default;
        # users who genuinely need a proxy can opt in in `.env.local`.
        self._use_system_proxy = os.environ.get("TUSHARE_USE_SYSTEM_PROXY", "false").strip().lower() in {"1", "true", "yes"}
        # Free daily access is limited to 50 calls/minute.  1.3 seconds keeps
        # a rolling 60-second window below that ceiling with a safety margin.
        self._min_request_interval = max(1.3, float(os.environ.get("TUSHARE_DAILY_MIN_INTERVAL_SECONDS", "1.3")))
        self._last_request_at = 0.0

    @contextmanager
    def _request_network(self):
        if self._use_system_proxy:
            yield
            return
        proxy_keys = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
        saved = {key: os.environ.pop(key, None) for key in proxy_keys}
        try:
            yield
        finally:
            for key, value in saved.items():
                if value is not None:
                    os.environ[key] = value

    def _daily_request(self, trade_date: date):
        remaining = self._last_request_at + self._min_request_interval - monotonic()
        if remaining > 0:
            sleep(remaining)
        try:
            with self._request_network():
                frame = self._client.daily(trade_date=trade_date.strftime("%Y%m%d"))
            self._last_request_at = monotonic()
            return frame
        except Exception as error:
            self._last_request_at = monotonic()
            message = str(error)
            if "频率超限" not in message and "rate limit" not in message.lower():
                raise
            # A task may start while requests from a previously failed task are
            # still inside Tushare's rolling minute. Cool down and retry once.
            sleep(65)
            with self._request_network():
                frame = self._client.daily(trade_date=trade_date.strftime("%Y%m%d"))
            self._last_request_at = monotonic()
            return frame

    @staticmethod
    def _stock_code(ts_code: object) -> str | None:
        text = str(ts_code).strip().upper()
        code, separator, exchange = text.partition(".")
        if not separator or exchange not in {"SH", "SZ", "BJ"} or not code.isdigit():
            return None
        return code.zfill(6)

    @staticmethod
    def _number(value: object, field: str) -> float:
        try:
            result = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"Tushare field {field} is not numeric: {value!r}") from error
        if result != result:
            raise ValueError(f"Tushare field {field} is NaN")
        return result

    def fetch_trade_date(self, trade_date: date) -> list[RawDailyBarInput]:
        frame = self._daily_request(trade_date)
        if frame is None or not hasattr(frame, "to_dict"):
            raise ValueError("Tushare daily did not return a tabular result")
        rows: list[RawDailyBarInput] = []
        fetched_at = datetime.now(UTC)
        for record in frame.to_dict(orient="records"):
            code = self._stock_code(record.get("ts_code"))
            if code is None:
                continue
            try:
                open_price = self._number(record.get("open"), "open")
                high = self._number(record.get("high"), "high")
                low = self._number(record.get("low"), "low")
                close = self._number(record.get("close"), "close")
                pre_close = self._number(record.get("pre_close"), "pre_close")
                # Tushare daily: vol is hands, amount is thousand CNY.
                volume = int(self._number(record.get("vol"), "vol") * 100)
                amount = self._number(record.get("amount"), "amount") * 1000
            except ValueError:
                continue
            if min(open_price, high, low, close, pre_close) <= 0 or low > min(open_price, close) or high < max(open_price, close):
                continue
            rows.append(RawDailyBarInput(
                stock_code=code, trade_date=trade_date, open_price=open_price, high_price=high,
                low_price=low, close_price=close, pre_close=pre_close, volume=volume,
                amount=amount, provider_name=self.name, fetched_at=fetched_at,
            ))
        return rows
