from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd

from quant_worker.database import apply_migrations, connect
from quant_worker.models import RawDailyBarInput
from quant_worker.providers.tushare_provider import TushareDailyProvider
from quant_worker.services import _rebuild_stock_history, _store_raw_day


class FakeTushareClient:
    def daily(self, trade_date: str):
        return pd.DataFrame([{
            "ts_code": "000001.SZ", "open": 10.0, "high": 11.0, "low": 9.5,
            "close": 10.5, "pre_close": 10.0, "vol": 123.0, "amount": 456.0,
        }])


class MarketHistoryTests(unittest.TestCase):
    def test_tushare_units_are_normalized(self) -> None:
        rows = TushareDailyProvider(client=FakeTushareClient()).fetch_trade_date(date(2026, 8, 31))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].volume, 12_300)
        self.assertEqual(rows[0].amount, 456_000)

    def test_qfq_rebuild_uses_following_pre_close_for_corporate_action(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            connection = connect(Path(directory) / "quant.db")
            try:
                apply_migrations(connection)
                connection.execute("INSERT INTO securities(code, exchange, name, security_type, is_st, is_active, updated_at) VALUES ('000001', 'SZ', 'test', 'A_SHARE', 0, 1, ?)", (datetime.now(UTC).isoformat(),))
                rows = [
                    RawDailyBarInput("000001", date(2026, 8, 28), 10, 11, 9, 10, 10, 100, 1000, "test", datetime.now(UTC)),
                    # A 2:1 split: the next day's pre_close is adjusted to 5.
                    RawDailyBarInput("000001", date(2026, 8, 31), 5, 6, 4.5, 5, 5, 200, 1000, "test", datetime.now(UTC)),
                ]
                _store_raw_day(connection, rows, {"000001"})
                self.assertTrue(_rebuild_stock_history(connection, "000001", 1))
                prices = connection.execute("SELECT trade_date, close_qfq FROM daily_bars WHERE stock_code='000001' ORDER BY trade_date").fetchall()
                self.assertEqual([(row["trade_date"], row["close_qfq"]) for row in prices], [("2026-08-28", 5.0), ("2026-08-31", 5.0)])
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
