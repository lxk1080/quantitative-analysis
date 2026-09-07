from __future__ import annotations

import json
import sqlite3
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Iterable
from zoneinfo import ZoneInfo

from quant_worker.config import CACHE_PATH, INDICATOR_VERSION, REALTIME_CACHE_TTL_SECONDS, RETAINED_TRADING_DAYS, SHANGHAI_TIMEZONE
from quant_worker.database import transaction, utc_now
from quant_worker.indicators import calculate_indicators
from quant_worker.models import DailyBar, MarketSnapshotBarInput, RawDailyBarInput, SecurityInput
from quant_worker.providers.akshare_provider import AkshareProvider
from quant_worker.providers.tushare_provider import TushareDailyProvider


def _write_audit(connection: sqlite3.Connection, job_id: str, event_type: str, message: str, provider: str | None = None) -> None:
    connection.execute("INSERT INTO sync_audit_logs(job_id, event_type, provider_name, message, created_at) VALUES (?, ?, ?, ?, ?)", (job_id, event_type, provider, message, utc_now()))


def _set_progress(connection: sqlite3.Connection, job_id: str, current: int, total: int) -> None:
    connection.execute("UPDATE sync_jobs SET progress_current=?, progress_total=? WHERE id=?", (current, total, job_id))


def _write_provider_summary(connection: sqlite3.Connection, job_id: str, provider: AkshareProvider) -> None:
    summary = provider.audit_summary()
    for source, counts in summary["counts"].items():
        if any(counts.values()):
            _write_audit(connection, job_id, "provider_source_summary", json.dumps(counts), provider._source_name(source))
    for message in summary["fallbacks"]:
        _write_audit(connection, job_id, "provider_fallback", message, provider.name)


def _upsert_securities(connection: sqlite3.Connection, securities: Iterable[SecurityInput]) -> int:
    values = list(securities)
    if not values:
        return 0
    now = utc_now()
    with transaction(connection):
        connection.executemany(
            """INSERT INTO securities(code, exchange, name, security_type, is_st, is_active, listed_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(code) DO UPDATE SET exchange=excluded.exchange, name=excluded.name,
               security_type=excluded.security_type, is_st=excluded.is_st, is_active=excluded.is_active,
               listed_at=excluded.listed_at, updated_at=excluded.updated_at""",
            [(i.code, i.exchange, i.name, i.security_type, int(i.is_st), int(i.is_active), i.listed_at.isoformat() if i.listed_at else None, now) for i in values],
        )
    return len(values)


def _refresh_universe(connection: sqlite3.Connection, job_id: str, provider: AkshareProvider) -> list[str]:
    _write_audit(connection, job_id, "universe_start", "Refreshing non-ST A-share universe from AKShare", provider.name)
    securities = provider.list_securities()
    _upsert_securities(connection, securities)
    codes = [item.code for item in securities]
    _write_audit(connection, job_id, "universe_finished", f"non-ST A-share universe: {len(codes)}", provider.name)
    return codes


def _local_active_codes(connection: sqlite3.Connection, *, include_st: bool = False) -> list[str]:
    return [row[0] for row in connection.execute(
        "SELECT code FROM securities WHERE security_type='A_SHARE' AND is_active=1" + ("" if include_st else " AND is_st=0") + " ORDER BY code"
    )]


def _history_candidates(connection: sqlite3.Connection, include_today: bool = False) -> tuple[list[date], list[date]]:
    """Find 70 latest Tushare-backed trading dates without a paid calendar API."""
    known = {date.fromisoformat(row["trade_date"]): int(row["row_count"]) for row in connection.execute("SELECT trade_date, row_count FROM history_sync_dates")}
    completed: list[date] = []
    missing: list[date] = []
    current = datetime.now(ZoneInfo(SHANGHAI_TIMEZONE))
    cursor = current.date() if include_today else current.date() - timedelta(days=1)
    while len(completed) + len(missing) < RETAINED_TRADING_DAYS:
        if cursor.weekday() < 5:
            if cursor in known:
                if known[cursor] > 0:
                    completed.append(cursor)
            else:
                missing.append(cursor)
        cursor -= timedelta(days=1)
    return completed, missing


def _store_raw_day(connection: sqlite3.Connection, rows: list[RawDailyBarInput], allowed_codes: set[str]) -> int:
    values = [row for row in rows if row.stock_code in allowed_codes]
    if not values:
        return 0
    with transaction(connection):
        connection.executemany(
            """INSERT INTO daily_raw_bars(stock_code, trade_date, open_price, high_price, low_price, close_price, pre_close, volume, amount, provider_name, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(stock_code, trade_date) DO UPDATE SET open_price=excluded.open_price, high_price=excluded.high_price,
               low_price=excluded.low_price, close_price=excluded.close_price, pre_close=excluded.pre_close, volume=excluded.volume,
               amount=excluded.amount, provider_name=excluded.provider_name, fetched_at=excluded.fetched_at""",
            [(r.stock_code, r.trade_date.isoformat(), r.open_price, r.high_price, r.low_price, r.close_price, r.pre_close, r.volume, r.amount, r.provider_name, r.fetched_at.isoformat()) for r in values],
        )
    return len(values)


def _mark_history_date(connection: sqlite3.Connection, trade_date: date, row_count: int) -> None:
    connection.execute(
        """INSERT INTO history_sync_dates(trade_date, provider_name, row_count, completed_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(trade_date) DO UPDATE SET provider_name=excluded.provider_name, row_count=excluded.row_count, completed_at=excluded.completed_at""",
        (trade_date.isoformat(), TushareDailyProvider.name, row_count, utc_now()),
    )


def _mark_st_history_date(connection: sqlite3.Connection, trade_date: date, row_count: int) -> None:
    connection.execute(
        """INSERT INTO history_st_sync_dates(trade_date, provider_name, row_count, completed_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(trade_date) DO UPDATE SET provider_name=excluded.provider_name, row_count=excluded.row_count, completed_at=excluded.completed_at""",
        (trade_date.isoformat(), TushareDailyProvider.name, row_count, utc_now()),
    )


def _derive_qfq_bars(raw_rows: list[sqlite3.Row]) -> list[DailyBar]:
    if not raw_rows:
        return []
    factors = [1.0] * len(raw_rows)
    # QFQ factor chain: pre_close[i+1] / close[i] carries corporate actions.
    for index in range(len(raw_rows) - 2, -1, -1):
        older, newer = raw_rows[index], raw_rows[index + 1]
        pre_close = newer["pre_close"]
        factors[index] = factors[index + 1] if pre_close is None or float(pre_close) <= 0 else factors[index + 1] * float(pre_close) / float(older["close_price"])
    return [DailyBar(
        stock_code=row["stock_code"], trade_date=date.fromisoformat(row["trade_date"]),
        open_qfq=float(row["open_price"]) * factor, high_qfq=float(row["high_price"]) * factor,
        low_qfq=float(row["low_price"]) * factor, close_qfq=float(row["close_price"]) * factor,
        volume=int(row["volume"]), amount=float(row["amount"]) if row["amount"] is not None else None, raw_close=float(row["close_price"]),
    ) for row, factor in zip(raw_rows, factors, strict=True)]


def _rebuild_stock_history(connection: sqlite3.Connection, code: str, data_version: int) -> bool:
    rows = connection.execute("SELECT * FROM daily_raw_bars WHERE stock_code=? ORDER BY trade_date DESC LIMIT ?", (code, RETAINED_TRADING_DAYS)).fetchall()
    bars = _derive_qfq_bars(list(reversed(rows)))
    if not bars:
        return False
    indicators = calculate_indicators(bars)
    now = utc_now()
    retained_dates = [bar.trade_date.isoformat() for bar in bars]
    placeholders = ",".join("?" for _ in retained_dates)
    with transaction(connection):
        connection.executemany(
            """INSERT INTO daily_bars(stock_code, trade_date, open_qfq, high_qfq, low_qfq, close_qfq, volume, amount, turnover_rate, raw_close, provider_name, fetched_at, data_version, quality_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'derived-qfq', ?, ?, 'valid')
               ON CONFLICT(stock_code, trade_date) DO UPDATE SET open_qfq=excluded.open_qfq, high_qfq=excluded.high_qfq, low_qfq=excluded.low_qfq, close_qfq=excluded.close_qfq, volume=excluded.volume, amount=excluded.amount, raw_close=excluded.raw_close, provider_name=excluded.provider_name, fetched_at=excluded.fetched_at, data_version=excluded.data_version, quality_status='valid'""",
            [(b.stock_code, b.trade_date.isoformat(), b.open_qfq, b.high_qfq, b.low_qfq, b.close_qfq, b.volume, b.amount, b.raw_close, now, data_version) for b in bars],
        )
        connection.executemany(
            """INSERT INTO daily_indicators(stock_code, trade_date, ma5, ma10, ma60, dkx, madkx10, indicator_version, source_data_version, calculated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(stock_code, trade_date) DO UPDATE SET ma5=excluded.ma5, ma10=excluded.ma10, ma60=excluded.ma60, dkx=excluded.dkx, madkx10=excluded.madkx10, indicator_version=excluded.indicator_version, source_data_version=excluded.source_data_version, calculated_at=excluded.calculated_at""",
            [(b.stock_code, b.trade_date.isoformat(), i.ma5, i.ma10, i.ma60, i.dkx, i.madkx10, INDICATOR_VERSION, data_version, now) for b, i in zip(bars, indicators, strict=True)],
        )
        connection.execute(f"DELETE FROM daily_indicators WHERE stock_code=? AND trade_date NOT IN ({placeholders})", [code, *retained_dates])
        connection.execute(f"DELETE FROM daily_bars WHERE stock_code=? AND trade_date NOT IN ({placeholders})", [code, *retained_dates])
        connection.execute(f"DELETE FROM daily_raw_bars WHERE stock_code=? AND trade_date NOT IN ({placeholders})", [code, *retained_dates])
    return True


def sync_history_if_needed(connection: sqlite3.Connection, job_id: str, codes: list[str], *, include_today: bool = False, include_st: bool = False) -> dict[str, int]:
    known, missing = _history_candidates(connection, include_today)
    st_missing: list[date] = []
    if include_st:
        st_known = {date.fromisoformat(row[0]) for row in connection.execute("SELECT trade_date FROM history_st_sync_dates")}
        st_missing = [item for item in known if item not in st_known]
    target_dates = list(dict.fromkeys([*missing, *st_missing]))
    if not target_dates:
        return {"known_dates": len(known), "downloaded_dates": 0, "raw_rows": 0, "rebuilt": 0}
    provider = TushareDailyProvider()
    total = len(target_dates) + len(codes)
    _set_progress(connection, job_id, 0, total)
    fetched_dates = raw_count = 0
    today = datetime.now(ZoneInfo(SHANGHAI_TIMEZONE)).date()
    for index, target_date in enumerate(target_dates, start=1):
        rows = provider.fetch_trade_date(target_date)
        if rows:
            saved = _store_raw_day(connection, rows, set(codes))
            _mark_history_date(connection, target_date, len(rows))
            if include_st:
                _mark_st_history_date(connection, target_date, len(rows))
            fetched_dates += 1
            raw_count += saved
            _write_audit(connection, job_id, "history_date_saved", f"{target_date}: {saved} non-ST rows", provider.name)
        else:
            if include_today and target_date == today:
                # 16:00 is a practical availability boundary, not a guarantee
                # that every provider replica has finished ingesting. Leave it
                # unmarked so a later screening can retry today's daily bar.
                _write_audit(connection, job_id, "history_today_pending", f"{target_date}: Tushare daily not available yet; will retry", provider.name)
            else:
                _mark_history_date(connection, target_date, 0)
                if include_st:
                    _mark_st_history_date(connection, target_date, 0)
                _write_audit(connection, job_id, "history_date_empty", f"{target_date}: non-trading day or no data", provider.name)
        _set_progress(connection, job_id, index, total)
    revision = int(connection.execute("SELECT COALESCE(MAX(data_version), 0) + 1 FROM daily_bars").fetchone()[0])
    rebuilt = 0
    for index, code in enumerate(codes, start=1):
        rebuilt += int(_rebuild_stock_history(connection, code, revision))
        _set_progress(connection, job_id, len(target_dates) + index, total)
    _write_audit(connection, job_id, "history_finished", f"Tushare dates={fetched_dates}, raw rows={raw_count}, rebuilt={rebuilt}", provider.name)
    return {"known_dates": len(known), "downloaded_dates": fetched_dates, "raw_rows": raw_count, "rebuilt": rebuilt}


def _cache_file_name(captured_at: datetime) -> Path:
    local = captured_at.astimezone(ZoneInfo(SHANGHAI_TIMEZONE))
    return CACHE_PATH / f"realtime-snapshot-{local:%Y%m%d-%H%M%S}.json"


def _snapshot_to_json(snapshot: list[MarketSnapshotBarInput]) -> dict[str, object]:
    return {"captured_at": snapshot[0].quote_time.isoformat(), "provider_name": snapshot[0].provider_name, "bars": [
        {"stock_code": x.stock_code, "name": x.name, "quote_time": x.quote_time.isoformat(), "open_price": x.open_price, "high_price": x.high_price, "low_price": x.low_price, "last_price": x.last_price, "pre_close": x.pre_close, "volume": x.volume, "amount": x.amount, "provider_name": x.provider_name} for x in snapshot
    ]}


def _snapshot_from_json(payload: dict[str, object]) -> list[MarketSnapshotBarInput]:
    values = payload.get("bars")
    if not isinstance(values, list):
        return []
    result: list[MarketSnapshotBarInput] = []
    for row in values:
        if not isinstance(row, dict):
            continue
        try:
            result.append(MarketSnapshotBarInput(stock_code=str(row["stock_code"]), name=str(row["name"]), quote_time=datetime.fromisoformat(str(row["quote_time"])), open_price=float(row["open_price"]), high_price=float(row["high_price"]), low_price=float(row["low_price"]), last_price=float(row["last_price"]), pre_close=float(row["pre_close"]), volume=int(row["volume"]) if row.get("volume") is not None else None, amount=float(row["amount"]) if row.get("amount") is not None else None, provider_name=str(row["provider_name"])))
        except (KeyError, TypeError, ValueError):
            continue
    return result


def _load_fresh_snapshot(*, freeze_after_close: bool) -> list[MarketSnapshotBarInput] | None:
    if not CACHE_PATH.exists():
        return None
    now = datetime.now(UTC)
    today = now.astimezone(ZoneInfo(SHANGHAI_TIMEZONE)).date()
    for cache_file in sorted(CACHE_PATH.glob("realtime-snapshot-*.json"), reverse=True):
        try:
            payload = json.loads(cache_file.read_text(encoding="utf-8"))
            captured = datetime.fromisoformat(str(payload["captured_at"]))
            if captured.tzinfo is None:
                continue
            captured_local = captured.astimezone(ZoneInfo(SHANGHAI_TIMEZONE))
            if captured_local.date() != today:
                continue
            if freeze_after_close:
                # A 15:00+ cache is the one immutable close snapshot used until
                # Tushare becomes the authoritative source at 16:00.
                if captured_local.time() < time(15, 0):
                    continue
            elif (now - captured.astimezone(UTC)).total_seconds() > REALTIME_CACHE_TTL_SECONDS:
                continue
            snapshot = _snapshot_from_json(payload)
            if snapshot:
                return snapshot
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            continue
    return None


def _prune_snapshot_cache() -> None:
    """Keep only the five newest timestamped snapshots after a successful save."""
    snapshots = []
    for candidate in CACHE_PATH.glob("realtime-snapshot-*.json"):
        if not candidate.is_file() or candidate.is_symlink():
            continue
        try:
            datetime.strptime(candidate.name, "realtime-snapshot-%Y%m%d-%H%M%S.json")
        except ValueError:
            continue
        snapshots.append(candidate)
    for candidate in sorted(snapshots, reverse=True)[5:]:
        try:
            candidate.unlink(missing_ok=True)
        except OSError:
            # A locked cache file must not prevent screening; retry next save.
            continue


def _get_intraday_snapshot(connection: sqlite3.Connection, job_id: str, provider: AkshareProvider) -> tuple[list[MarketSnapshotBarInput], bool]:
    local_time = datetime.now(ZoneInfo(SHANGHAI_TIMEZONE)).time()
    frozen_close = local_time >= time(15, 0)
    cached = _load_fresh_snapshot(freeze_after_close=frozen_close)
    if cached:
        policy = "frozen after-close snapshot" if frozen_close else "snapshot younger than 10 minutes"
        _write_audit(connection, job_id, "realtime_cache_hit", f"reused {len(cached)} records: {policy}", cached[0].provider_name)
        return cached, True
    snapshot = provider.fetch_market_snapshot()
    CACHE_PATH.mkdir(parents=True, exist_ok=True)
    target = _cache_file_name(snapshot[0].quote_time)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(_snapshot_to_json(snapshot), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(target)
    _prune_snapshot_cache()
    _write_audit(connection, job_id, "realtime_cache_saved", f"saved {len(snapshot)} records to {target.name}", snapshot[0].provider_name)
    return snapshot, False


def _snapshot_qfq_prices(connection: sqlite3.Connection, snapshot: list[MarketSnapshotBarInput], codes: set[str]) -> dict[str, dict[str, float]]:
    """Build transient intraday data. AKShare rows are never persisted."""
    prices: dict[str, dict[str, float]] = {}
    for item in snapshot:
        if item.stock_code not in codes:
            continue
        anchor = connection.execute(
            "SELECT close_qfq, raw_close FROM daily_bars WHERE stock_code=? AND raw_close>0 ORDER BY trade_date DESC LIMIT 1",
            (item.stock_code,),
        ).fetchone()
        if anchor is None or float(anchor["raw_close"]) <= 0:
            continue
        factor = float(anchor["close_qfq"]) / float(anchor["raw_close"])
        if factor > 0:
            prices[item.stock_code] = {
                "qfq_price": item.last_price * factor,
                "captured_timestamp": item.quote_time.timestamp(),
                "raw_last_price": item.last_price,
                "raw_pre_close": item.pre_close or 0.0,
                "volume": float(item.volume or 0),
                "qfq_open": float(item.open_price or item.last_price) * factor,
                "qfq_high": float(item.high_price or item.last_price) * factor,
                "qfq_low": float(item.low_price or item.last_price) * factor,
            }
    return prices


def _is_tushare_daily_available() -> bool:
    """Tushare daily is the only post-16:00 authoritative daily source."""
    return datetime.now(ZoneInfo(SHANGHAI_TIMEZONE)).time() >= time(16, 0)


def sync_daily_bars(connection: sqlite3.Connection, job_id: str, max_workers: int = 4) -> dict[str, int | str]:
    tushare_ready = _is_tushare_daily_available()
    # Manual sync is local-first. Do not call AKShare just to decide whether
    # Tushare history is complete; that was the source of the long "preparing"
    # state after clicking an already-complete sync.
    codes = _local_active_codes(connection)
    provider: AkshareProvider | None = None
    if not codes:
        provider = AkshareProvider(max_workers=max_workers)
        codes = _refresh_universe(connection, job_id, provider)
    known, missing = _history_candidates(connection, include_today=tushare_ready)
    if missing:
        history = sync_history_if_needed(connection, job_id, codes, include_today=tushare_ready)
        current = "已按缺失交易日从 Tushare 补齐并重建前复权与指标"
    else:
        history = {"known_dates": len(known), "downloaded_dates": 0, "raw_rows": 0, "rebuilt": 0}
        _write_audit(connection, job_id, "history_complete", "Local history is complete; no external request was made", TushareDailyProvider.name)
        current = "本地最近 90 个交易日数据完整，无需请求外部接口"
    if provider is not None:
        _write_provider_summary(connection, job_id, provider)
    return {"universe": len(codes), **history, "current": current}


def sync_realtime_quotes(connection: sqlite3.Connection, job_id: str, max_workers: int = 4) -> dict[str, int | str]:
    provider = AkshareProvider(max_workers=max_workers)
    codes = [row[0] for row in connection.execute("SELECT code FROM securities WHERE security_type='A_SHARE' AND is_st=0 AND is_active=1")]
    if not codes:
        codes = _refresh_universe(connection, job_id, provider)
    if _is_tushare_daily_available():
        history = sync_history_if_needed(connection, job_id, codes, include_today=True)
        result: dict[str, int | str] = {"mode": "tushare_after_1600", **history}
    else:
        snapshot, cached = _get_intraday_snapshot(connection, job_id, provider)
        result = {"mode": "akshare_cache_hit" if cached else "akshare_cache_saved", "records": len(snapshot), "database_writes": 0}
    _write_provider_summary(connection, job_id, provider)
    return result


def ensure_screening_data(connection: sqlite3.Connection, job_id: str, max_workers: int = 4, *, include_st: bool = False) -> tuple[str, dict[str, dict[str, float]]]:
    codes = _local_active_codes(connection, include_st=include_st)
    provider: AkshareProvider | None = None
    if not codes or include_st:
        provider = AkshareProvider(max_workers=max_workers)
        codes = _refresh_universe(connection, job_id, provider)
        if not include_st:
            codes = _local_active_codes(connection)
    if _is_tushare_daily_available():
        sync_history_if_needed(connection, job_id, codes, include_today=True, include_st=include_st)
        today = datetime.now(ZoneInfo(SHANGHAI_TIMEZONE)).date().isoformat()
        has_today_daily = connection.execute("SELECT 1 FROM history_sync_dates WHERE trade_date=? AND row_count>0", (today,)).fetchone() is not None
        if has_today_daily:
            mode, prices = "post_close", {}
        else:
            # 16:00 is a requested-provider attempt boundary, not proof that
            # Tushare has finished publishing today's daily endpoint.
            if provider is None:
                provider = AkshareProvider(max_workers=max_workers)
            snapshot, _ = _get_intraday_snapshot(connection, job_id, provider)
            mode, prices = "intraday", _snapshot_qfq_prices(connection, snapshot, set(codes))
    else:
        sync_history_if_needed(connection, job_id, codes, include_st=include_st)
        if provider is None:
            provider = AkshareProvider(max_workers=max_workers)
        snapshot, _ = _get_intraday_snapshot(connection, job_id, provider)
        mode, prices = "intraday", _snapshot_qfq_prices(connection, snapshot, set(codes))
    if provider is not None:
        _write_provider_summary(connection, job_id, provider)
    return mode, prices


def rebuild_all_indicators(connection: sqlite3.Connection) -> dict[str, int]:
    """Rebuild stored QFQ bars and indicators after a formula-version change."""
    codes = _local_active_codes(connection)
    revision = int(connection.execute("SELECT COALESCE(MAX(data_version), 0) + 1 FROM daily_bars").fetchone()[0])
    rebuilt = sum(int(_rebuild_stock_history(connection, code, revision)) for code in codes)
    return {"stocks": len(codes), "rebuilt": rebuilt, "data_version": revision}
