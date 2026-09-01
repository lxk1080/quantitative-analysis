from __future__ import annotations

"""AKShare multi-source market-data adapter.

The public endpoints behind AKShare are not interchangeable. This module keeps
their field differences here, exposes one normalized contract to the rest of the
application, and records the source actually used for every saved record.

Price-source order: Tencent -> Eastmoney -> Sina. AKShare 1.18 has no
Tonghuashun all-A realtime or individual qfq daily endpoint. Its apparent
``stock_ipo_ths`` "all A shares" endpoint is new-IPO data, not a security
master, so it must not be used as a price or universe fallback.
"""

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import UTC, date, datetime
from threading import Lock
from typing import Any, Callable, Iterable

from quant_worker.models import DailyBarInput, MarketSnapshotBarInput, RealtimeQuoteInput, SecurityInput
from quant_worker.providers.base import ProviderNotConfigured


class AkshareProvider:
    """Source-aware public provider with deterministic fallback and auditing."""

    name = "akshare-multi-source"
    _SPOT_SOURCES = ("tencent", "eastmoney", "sina")
    _DAILY_SOURCES = ("tencent", "eastmoney", "sina")

    def __init__(self, max_workers: int = 2, ak_client: Any | None = None) -> None:
        if ak_client is None:
            try:
                import akshare as ak
            except ImportError as error:  # pragma: no cover - environment dependent
                raise ProviderNotConfigured("AKShare is not installed; run: python -m pip install -r requirements.txt") from error
            ak_client = ak
        self._ak = ak_client
        self._max_workers = max(1, min(max_workers, 4))
        self._lock = Lock()
        self._source_counts = {
            source: {"universe": 0, "daily": 0, "realtime": 0, "failed": 0}
            for source in ("tencent", "eastmoney", "sina")
        }
        self._fallbacks: list[str] = []

    @staticmethod
    def _exchange(code: str) -> str:
        if code.startswith(("6", "9")):
            return "SH"
        if code.startswith(("4", "8")):
            return "BJ"
        return "SZ"

    @staticmethod
    def _is_st(name: str) -> bool:
        return "ST" in name.upper().replace(" ", "")

    @staticmethod
    def _source_name(source: str) -> str:
        return f"akshare-{source}"

    def audit_summary(self) -> dict[str, Any]:
        with self._lock:
            return {"counts": {key: value.copy() for key, value in self._source_counts.items()}, "fallbacks": list(self._fallbacks)}

    def _count(self, source: str, kind: str, amount: int = 1) -> None:
        with self._lock:
            self._source_counts[source][kind] += amount

    def _record_fallback(self, message: str) -> None:
        with self._lock:
            # Avoid a log storm if Tencent is temporarily unavailable for a whole market sync.
            if len(self._fallbacks) < 20:
                self._fallbacks.append(message[:500])

    @staticmethod
    def _records(frame: Any) -> list[dict[str, Any]]:
        if frame is None or not hasattr(frame, "to_dict"):
            raise ValueError("source did not return a tabular result")
        records = frame.to_dict(orient="records")
        if not records:
            raise ValueError("source returned an empty result")
        return records

    @staticmethod
    def _value(record: dict[str, Any], *names: str) -> Any | None:
        for name in names:
            value = record.get(name)
            if value is not None and str(value).strip() not in {"", "-", "--", "nan", "None"}:
                return value
        return None

    @classmethod
    def _code(cls, value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip().upper()
        if len(text) >= 8 and text[:2] in {"SH", "SZ", "BJ"}:
            text = text[-6:]
        return text.zfill(6) if text.isdigit() and len(text) <= 6 else None

    @staticmethod
    def _date(value: Any) -> date:
        return date.fromisoformat(str(value)[:10])

    @staticmethod
    def _number(value: Any, *, required: bool = False) -> float | None:
        if value is None:
            if required:
                raise ValueError("required numeric field is missing")
            return None
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            if required:
                raise ValueError(f"invalid numeric field: {value!r}") from error
            return None
        if number != number:
            if required:
                raise ValueError("required numeric field is NaN")
            return None
        return number

    @staticmethod
    def _daily_symbol(code: str) -> str:
        prefix = "sh" if code.startswith(("6", "9")) else "bj" if code.startswith(("4", "8")) else "sz"
        return prefix + code

    def _spot_candidates(self):
        loaders: dict[str, Callable[[], Any]] = {
            "tencent": self._ak.stock_zh_a_spot_tx,
            "eastmoney": self._ak.stock_zh_a_spot_em,
            "sina": self._ak.stock_zh_a_spot,
        }
        errors: list[str] = []
        yielded = False
        for source in self._SPOT_SOURCES:
            try:
                records = self._records(loaders[source]())
                yielded = True
                yield source, records
            except Exception as error:
                self._count(source, "failed")
                errors.append(f"{source}: {error}")
                self._record_fallback(f"{source} spot request failed: {error}")
        if not yielded:
            raise RuntimeError("all same-contract realtime sources failed; " + " | ".join(errors))

    def _security_rows(self, records: Iterable[dict[str, Any]]) -> list[SecurityInput]:
        items: dict[str, SecurityInput] = {}
        for row in records:
            code = self._code(self._value(row, "code", "代码", "股票代码"))
            name_value = self._value(row, "name", "名称", "股票简称")
            name = str(name_value).strip() if name_value is not None else ""
            if code and name and not self._is_st(name):
                items[code] = SecurityInput(code, self._exchange(code), name, "A_SHARE", False, True)
        return list(items.values())

    def list_securities(self) -> list[SecurityInput]:
        try:
            invalid_sources: list[str] = []
            for source, records in self._spot_candidates():
                securities = self._security_rows(records)
                if securities:
                    self._count(source, "universe", len(securities))
                    if source != "tencent":
                        self._record_fallback(f"universe used {source}; earlier sources: {' | '.join(invalid_sources)}")
                    return securities
                self._count(source, "failed")
                invalid_sources.append(f"{source}: no valid non-ST A-share securities")
            raise ValueError("no valid non-ST A-share securities after normalization")
        except Exception as error:
            raise RuntimeError(f"all universe price sources failed: {error}") from error

    def _daily_frames(self, source: str, code: str, start: date, end: date) -> tuple[Any, Any]:
        start_text, end_text = start.strftime("%Y%m%d"), end.strftime("%Y%m%d")
        if source == "tencent":
            arguments = {"symbol": self._daily_symbol(code), "start_date": start_text, "end_date": end_text}
            return self._ak.stock_zh_a_hist_tx(**arguments, adjust="qfq"), self._ak.stock_zh_a_hist_tx(**arguments, adjust="")
        if source == "eastmoney":
            arguments = {"symbol": code, "period": "daily", "start_date": start_text, "end_date": end_text}
            return self._ak.stock_zh_a_hist(**arguments, adjust="qfq"), self._ak.stock_zh_a_hist(**arguments, adjust="")
        if source == "sina":
            arguments = {"symbol": self._daily_symbol(code), "start_date": start_text, "end_date": end_text}
            return self._ak.stock_zh_a_daily(**arguments, adjust="qfq"), self._ak.stock_zh_a_daily(**arguments, adjust="")
        raise ValueError(f"unsupported source: {source}")

    def _normalize_daily(self, source: str, code: str, qfq_frame: Any, raw_frame: Any) -> list[DailyBarInput]:
        qfq_records, raw_records = self._records(qfq_frame), self._records(raw_frame)
        raw_close_by_date: dict[date, float] = {}
        for raw in raw_records:
            try:
                trade_date = self._date(self._value(raw, "date", "日期"))
                raw_close = self._number(self._value(raw, "close", "收盘"), required=True)
                raw_close_by_date[trade_date] = raw_close
            except (TypeError, ValueError):
                continue
        rows: list[DailyBarInput] = []
        fetched_at = datetime.now(UTC)
        for item in qfq_records:
            trade_date = self._date(self._value(item, "date", "日期"))
            open_price = self._number(self._value(item, "open", "开盘"), required=True)
            high = self._number(self._value(item, "high", "最高"), required=True)
            low = self._number(self._value(item, "low", "最低"), required=True)
            close = self._number(self._value(item, "close", "收盘"), required=True)
            volume = self._number(self._value(item, "volume", "成交量"), required=True)
            if low <= 0 or close <= 0 or low > min(open_price, close) or high < max(open_price, close):
                raise ValueError(f"{code} {trade_date}: invalid qfq OHLC")
            raw_close = raw_close_by_date.get(trade_date)
            if raw_close is None or raw_close <= 0:
                # Never mix vendors solely to fabricate an intraday qfq anchor.
                raise ValueError(f"{code} {trade_date}: raw close missing from {source}")
            rows.append(DailyBarInput(
                stock_code=code, trade_date=trade_date, open_qfq=open_price, high_qfq=high, low_qfq=low,
                close_qfq=close, volume=int(volume), amount=self._number(self._value(item, "amount", "成交额")),
                turnover_rate=self._number(self._value(item, "turnover", "turnover_rate", "换手率")), raw_close=raw_close,
                provider_name=self._source_name(source), fetched_at=fetched_at,
            ))
        if not rows:
            raise ValueError(f"{code}: normalized daily data is empty")
        return rows

    def _fetch_one_daily(self, code: str, start: date, end: date) -> list[DailyBarInput]:
        failures: list[str] = []
        for source in self._DAILY_SOURCES:
            try:
                qfq, raw = self._daily_frames(source, code, start, end)
                rows = self._normalize_daily(source, code, qfq, raw)
                self._count(source, "daily")
                if source != "tencent":
                    self._record_fallback(f"daily {code} used {source}; earlier failures: {' | '.join(failures)}")
                return rows
            except Exception as error:
                self._count(source, "failed")
                failures.append(f"{source}: {error}")
        raise RuntimeError("all qfq/raw daily sources failed; " + " | ".join(failures))

    def fetch_daily_bars(self, codes: list[str], start: date, end: date) -> tuple[dict[str, list[DailyBarInput]], dict[str, str]]:
        """Fetch using a bounded queue rather than enqueueing 5,000 futures."""
        data: dict[str, list[DailyBarInput]] = {}
        failures: dict[str, str] = {}
        iterator = iter(codes)
        pending: dict[Any, str] = {}
        with ThreadPoolExecutor(max_workers=self._max_workers) as executor:
            for _ in range(self._max_workers):
                try:
                    code = next(iterator)
                except StopIteration:
                    break
                pending[executor.submit(self._fetch_one_daily, code, start, end)] = code
            while pending:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                for future in done:
                    code = pending.pop(future)
                    try:
                        data[code] = future.result()
                    except Exception as error:
                        failures[code] = str(error)
                    try:
                        next_code = next(iterator)
                    except StopIteration:
                        continue
                    pending[executor.submit(self._fetch_one_daily, next_code, start, end)] = next_code
        return data, failures

    def _realtime_rows(self, source: str, records: Iterable[dict[str, Any]], codes: set[str]) -> list[RealtimeQuoteInput]:
        quotes: list[RealtimeQuoteInput] = []
        now = datetime.now(UTC)
        for row in records:
            code = self._code(self._value(row, "code", "代码"))
            if code not in codes:
                continue
            price = self._number(self._value(row, "zxj", "最新价", "trade"))
            if price is None or price <= 0:
                continue
            quotes.append(RealtimeQuoteInput(
                stock_code=code, quote_time=now, raw_last_price=price,
                volume=_optional_int(self._value(row, "volume", "成交量")),
                amount=self._number(self._value(row, "amount", "turnover", "成交额")), provider_name=self._source_name(source),
            ))
        return quotes

    def _snapshot_rows(self, source: str, records: Iterable[dict[str, Any]]) -> list[MarketSnapshotBarInput]:
        """Normalize one complete realtime market snapshot.

        We deliberately require full OHLC + previous close here. A provider
        which exposes only last price remains useful for realtime quotes, but
        cannot be promoted to an after-close daily bar safely.
        """
        snapshots: list[MarketSnapshotBarInput] = []
        now = datetime.now(UTC)
        for row in records:
            code = self._code(self._value(row, "code", "代码", "股票代码"))
            name_value = self._value(row, "name", "名称", "股票简称")
            name = str(name_value).strip() if name_value is not None else ""
            last = self._number(self._value(row, "zxj", "最新价", "trade", "close"))
            open_price = self._number(self._value(row, "open", "今开", "开盘"))
            high = self._number(self._value(row, "high", "最高"))
            low = self._number(self._value(row, "low", "最低"))
            pre_close = self._number(self._value(row, "pre_close", "昨收", "昨收价"))
            if not code or not name or self._is_st(name) or last is None or last <= 0:
                continue
            if any(value is None or value <= 0 for value in (open_price, high, low, pre_close)):
                continue
            if low > min(open_price, last) or high < max(open_price, last):
                continue
            snapshots.append(MarketSnapshotBarInput(
                stock_code=code, name=name, quote_time=now,
                open_price=open_price, high_price=high, low_price=low, last_price=last,
                pre_close=pre_close,
                volume=_optional_int(self._value(row, "volume", "成交量")),
                amount=self._number(self._value(row, "amount", "turnover", "成交额")),
                provider_name=self._source_name(source),
            ))
        return snapshots

    def fetch_market_snapshot(self) -> list[MarketSnapshotBarInput]:
        """Return one all-A raw OHLC snapshot with provider fallback."""
        invalid_sources: list[str] = []
        for source, records in self._spot_candidates():
            snapshots = self._snapshot_rows(source, records)
            if snapshots:
                self._count(source, "realtime", len(snapshots))
                if source != "tencent":
                    self._record_fallback(f"market snapshot used {source}; earlier sources: {' | '.join(invalid_sources)}")
                return snapshots
            self._count(source, "failed")
            invalid_sources.append(f"{source}: missing valid OHLC fields")
        raise ValueError("all realtime sources returned no usable all-market OHLC snapshot")

    def fetch_realtime_quotes(self, codes: list[str]) -> tuple[list[RealtimeQuoteInput], dict[str, str]]:
        wanted = set(codes)
        invalid_sources: list[str] = []
        for source, records in self._spot_candidates():
            quotes = self._realtime_rows(source, records, wanted)
            if quotes:
                self._count(source, "realtime", len(quotes))
                if source != "tencent":
                    self._record_fallback(f"realtime used {source}; earlier sources: {' | '.join(invalid_sources)}")
                found = {quote.stock_code for quote in quotes}
                return quotes, {code: "quote missing or invalid in selected source" for code in wanted - found}
            self._count(source, "failed")
            invalid_sources.append(f"{source}: no usable realtime prices")
        raise ValueError("all realtime sources returned no usable prices")


def _optional_int(value: object) -> int | None:
    try:
        number = float(value) if value is not None else None
        return int(number) if number is not None and number == number else None
    except (TypeError, ValueError):
        return None
