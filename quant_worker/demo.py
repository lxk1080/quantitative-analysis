from __future__ import annotations

import random
import sqlite3
from datetime import UTC, date, datetime, timedelta

from quant_worker.config import INDICATOR_VERSION, RETAINED_TRADING_DAYS
from quant_worker.database import transaction, utc_now
from quant_worker.indicators import calculate_indicators
from quant_worker.models import DailyBar


def _trading_dates(count: int) -> list[date]:
    current = date.today() - timedelta(days=count * 2)
    dates: list[date] = []
    while len(dates) < count:
        if current.weekday() < 5:
            dates.append(current)
        current += timedelta(days=1)
    return dates


def _bars(code: str, base_price: float, seed: int, dates: list[date]) -> list[DailyBar]:
    randomizer = random.Random(seed)
    close = base_price
    result: list[DailyBar] = []
    for index, trade_date in enumerate(dates):
        trend = 0.0015 if index > len(dates) - 45 else 0.0004
        change = trend + randomizer.uniform(-0.018, 0.02)
        open_price = close * (1 + randomizer.uniform(-0.01, 0.01))
        close = max(0.5, close * (1 + change))
        high = max(open_price, close) * (1 + randomizer.uniform(0.001, 0.015))
        low = min(open_price, close) * (1 - randomizer.uniform(0.001, 0.015))
        volume = int(900_000 * (1 + randomizer.random() * 1.8) * (1.5 if index == len(dates) - 1 else 1))
        result.append(DailyBar(code, trade_date, open_price, high, low, close, volume, close * volume * 100, raw_close=close / 0.97))
    return result


def seed_demo_data(connection: sqlite3.Connection) -> dict[str, int]:
    """Insert deterministic synthetic data. It is deliberately marked as demo data."""
    now = utc_now()
    dates = _trading_dates(140)
    securities = [
        ("600000", "SH", "浦发银行（演示）", "A_SHARE", 0, 1),
        ("000001", "SZ", "平安银行（演示）", "A_SHARE", 0, 1),
        ("300750", "SZ", "宁德时代（演示）", "A_SHARE", 0, 1),
        ("600001", "SH", "ST 演示样本", "A_SHARE", 1, 0),
    ]
    all_bars = {
        "600000": _bars("600000", 10.2, 11, dates),
        "000001": _bars("000001", 11.1, 22, dates),
        "300750": _bars("300750", 185.0, 33, dates),
    }
    with transaction(connection):
        connection.executemany(
            """INSERT INTO securities(code, exchange, name, security_type, is_st, is_active, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(code) DO UPDATE SET name=excluded.name, is_st=excluded.is_st,
                 is_active=excluded.is_active, updated_at=excluded.updated_at""",
            [(*item, now) for item in securities],
        )
        for code, bars in all_bars.items():
            indicators = calculate_indicators(bars)
            retained = list(zip(bars[-RETAINED_TRADING_DAYS:], indicators[-RETAINED_TRADING_DAYS:], strict=True))
            connection.execute("DELETE FROM daily_indicators WHERE stock_code = ?", (code,))
            connection.execute("DELETE FROM daily_bars WHERE stock_code = ?", (code,))
            connection.executemany(
                """INSERT INTO daily_bars(stock_code, trade_date, open_qfq, high_qfq, low_qfq, close_qfq,
                   volume, amount, turnover_rate, raw_close, provider_name, fetched_at, data_version, quality_status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo', ?, 1, 'valid')""",
                [
                    (bar.stock_code, bar.trade_date.isoformat(), bar.open_qfq, bar.high_qfq, bar.low_qfq,
                     bar.close_qfq, bar.volume, bar.amount, None, bar.raw_close, now)
                    for bar, _ in retained
                ],
            )
            connection.executemany(
                """INSERT INTO daily_indicators(stock_code, trade_date, ma5, ma10, ma60, dkx, madkx10,
                   indicator_version, source_data_version, calculated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                [
                    (bar.stock_code, bar.trade_date.isoformat(), indicator.ma5, indicator.ma10, indicator.ma60,
                     indicator.dkx, indicator.madkx10, INDICATOR_VERSION, now)
                    for bar, indicator in retained
                ],
            )
        rule_id = "demo-trend-rule"
        definition = '{"version":1,"operator":"all","conditions":[{"type":"price_above_indicator","indicator":"ma60"},{"type":"volume_multiple","window":5,"minimum":1.1}]}'
        connection.execute(
            """INSERT INTO screening_rules(id, name, definition_json, version, created_at, updated_at)
               VALUES (?, '趋势启动（演示）', ?, 1, ?, ?)
               ON CONFLICT(id) DO UPDATE SET definition_json=excluded.definition_json,
                 updated_at=excluded.updated_at, version=1""",
            (rule_id, definition, now, now),
        )
    return {"securities": 3, "bars_per_security": RETAINED_TRADING_DAYS}
