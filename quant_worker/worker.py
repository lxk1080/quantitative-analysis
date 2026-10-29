from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from quant_worker.database import transaction, utc_now
from quant_worker.rules import evaluate_rule
from quant_worker.screening_data import build_screening_bars
from quant_worker.services import ensure_screening_data, sync_daily_bars, sync_realtime_quotes


def _claim_next_job(connection: sqlite3.Connection) -> sqlite3.Row | None:
    with transaction(connection):
        job = connection.execute(
            "SELECT * FROM sync_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1"
        ).fetchone()
        if job is None:
            return None
        connection.execute(
            "UPDATE sync_jobs SET status='running', started_at=? WHERE id=? AND status='queued'",
            (utc_now(), job["id"]),
        )
        return job


def _latest_context(connection: sqlite3.Connection, security: sqlite3.Row, mode: str, intraday_prices: dict[str, dict[str, float]] | None = None) -> dict[str, Any] | None:
    code = str(security["code"])
    rows = connection.execute(
        """SELECT b.trade_date, b.open_qfq, b.high_qfq, b.low_qfq, b.close_qfq, b.raw_close,
                  b.volume, r.pre_close, i.ma5, i.ma10, i.ma60, i.dkx, i.madkx10
           FROM daily_bars b JOIN daily_indicators i
           ON i.stock_code=b.stock_code AND i.trade_date=b.trade_date
           LEFT JOIN daily_raw_bars r ON r.stock_code=b.stock_code AND r.trade_date=b.trade_date
           WHERE b.stock_code=? AND b.quality_status='valid'
           ORDER BY b.trade_date""",
        (code,),
    ).fetchall()
    if len(rows) < 2:
        return None
    intraday_quote: dict[str, float] | None = None
    if mode == "intraday":
        intraday_quote = (intraday_prices or {}).get(code)
        if intraday_quote is None:
            return None
    bars = build_screening_bars(code, [dict(row) for row in rows], intraday_quote)
    return {"bars": bars, "indicators": bars, "current_price": float(bars[-1]["close_qfq"]),
            "security": {"code": code, "exchange": security["exchange"], "is_st": bool(security["is_st"])}}


def run_screening(connection: sqlite3.Connection, payload: dict[str, Any], job_id: str) -> dict[str, Any]:
    rule_id = str(payload["rule_id"])
    rule = connection.execute("SELECT * FROM screening_rules WHERE id=?", (rule_id,)).fetchone()
    if rule is None:
        raise ValueError(f"rule not found: {rule_id}")
    definition = payload.get("definition") if rule_id == "custom-rule" else None
    if not isinstance(definition, dict):
        definition = json.loads(rule["definition_json"])
    conditions = definition.get("conditions", [])
    include_st = rule_id == "custom-rule" and not any(item.get("type") == "exclude_st" for item in conditions if isinstance(item, dict))
    # A screening task is self-sufficient: backfill history first, then use a
    # configured intraday cache or the authoritative daily data when available.
    mode, intraday_prices = ensure_screening_data(connection, job_id, int(payload.get("max_workers", 4)), include_st=include_st, use_existing_realtime=payload.get("use_existing_realtime") is True)
    latest_date = connection.execute("SELECT MAX(trade_date) AS value FROM daily_bars").fetchone()["value"]
    if latest_date is None:
        raise ValueError("no daily bars available")
    run_id = str(uuid.uuid4())
    now = utc_now()
    securities = connection.execute(
        "SELECT code, exchange, is_st FROM securities WHERE security_type='A_SHARE' AND is_active=1" + ("" if include_st else " AND is_st=0") + " ORDER BY code"
    ).fetchall()
    contexts = {security["code"]: _latest_context(connection, security, mode, intraday_prices) for security in securities}
    if any(item.get("type") == "two_month_return_rank" for item in conditions if isinstance(item, dict)):
        returns: list[tuple[str, float]] = []
        for code, context in contexts.items():
            if context is None or len(context["bars"]) < 41:
                continue
            start = float(context["bars"][-41]["close_qfq"])
            end = float(context["bars"][-1]["close_qfq"])
            if start > 0:
                returns.append((code, (end / start - 1) * 100))
        for rank, (code, _) in enumerate(sorted(returns, key=lambda item: item[1], reverse=True), start=1):
            if contexts[code] is not None:
                contexts[code]["two_month_rank"] = rank
    matched = unavailable = 0
    with transaction(connection):
        connection.execute(
            """INSERT INTO screening_runs(id, rule_id, rule_version, mode, data_as_of, status,
               matched_count, unavailable_count, created_at) VALUES (?, ?, ?, ?, ?, 'running', 0, 0, ?)""",
            (run_id, rule_id, rule["version"], mode, latest_date, now),
        )
        for security in securities:
            code = security["code"]
            context = contexts[code]
            if context is None:
                status, detail, price = "unavailable", {"reason": "指标或实时前复权价格不可用"}, None
                unavailable += 1
            else:
                evaluated = evaluate_rule(definition, context)
                status = evaluated.status
                detail = {"conditions": [asdict(item) for item in evaluated.conditions]}
                price = context["current_price"]
                matched += int(status == "matched")
                unavailable += int(status == "unavailable")
            connection.execute(
                "INSERT INTO screening_results(run_id, stock_code, status, current_price, detail_json) VALUES (?, ?, ?, ?, ?)",
                (run_id, code, status, price, json.dumps(detail, ensure_ascii=False)),
            )
        connection.execute(
            """UPDATE screening_runs SET status='succeeded', matched_count=?, unavailable_count=?, finished_at=?
               WHERE id=?""",
            (matched, unavailable, utc_now(), run_id),
        )
    return {"run_id": run_id, "matched": matched, "unavailable": unavailable, "total": len(securities)}


def process_one_job(connection: sqlite3.Connection) -> bool:
    job = _claim_next_job(connection)
    if job is None:
        return False
    try:
        payload = json.loads(job["payload_json"])
        if job["kind"] == "screening":
            summary = run_screening(connection, payload, job["id"])
        elif job["kind"] == "daily_sync":
            summary = sync_daily_bars(connection, job["id"], int(payload.get("max_workers", 4)))
        elif job["kind"] == "realtime_sync":
            summary = sync_realtime_quotes(connection, job["id"], int(payload.get("max_workers", 4)))
        else:
            raise ValueError(f"unsupported job kind: {job['kind']}")
        connection.execute(
            """UPDATE sync_jobs SET status='succeeded',
               progress_current=CASE WHEN progress_total > 0 THEN progress_total ELSE 1 END,
               progress_total=CASE WHEN progress_total > 0 THEN progress_total ELSE 1 END,
               summary_json=?, finished_at=? WHERE id=?""",
            (json.dumps(summary, ensure_ascii=False), utc_now(), job["id"]),
        )
    except Exception as error:
        connection.execute(
            "UPDATE sync_jobs SET status='failed', error_message=?, finished_at=? WHERE id=?",
            (str(error), utc_now(), job["id"]),
        )
    return True


def run_worker_loop(connection: sqlite3.Connection, poll_seconds: float = 1.0) -> None:
    while True:
        if not process_one_job(connection):
            time.sleep(poll_seconds)
