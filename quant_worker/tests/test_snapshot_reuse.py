from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from quant_worker.services import _load_fresh_snapshot


class FixedDateTime(datetime):
    current = datetime(2026, 10, 29, 6, 30, tzinfo=UTC)  # 14:30 Shanghai

    @classmethod
    def now(cls, tz=None):
        return cls.current.astimezone(tz) if tz else cls.current.replace(tzinfo=None)


class SnapshotReuseTests(unittest.TestCase):
    def save_snapshot(self, directory: Path, timestamp: str) -> None:
        captured = datetime.fromisoformat(timestamp)
        name = f"realtime-snapshot-{captured.strftime('%Y%m%d-%H%M%S')}.json"
        payload = {
            "captured_at": timestamp,
            "bars": [{
                "stock_code": "000001", "name": "测试股票", "quote_time": timestamp,
                "open_price": 10, "high_price": 11, "low_price": 9,
                "last_price": 10, "pre_close": 10, "volume": 100,
                "amount": 1000, "provider_name": "test",
            }],
        }
        (directory / name).write_text(json.dumps(payload), encoding="utf-8")

    def test_opt_in_reuses_expired_today_snapshot_only(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.save_snapshot(directory, "2026-10-28T14:29:00+08:00")
            self.save_snapshot(directory, "2026-10-29T14:00:00+08:00")
            with patch("quant_worker.services.CACHE_PATH", directory), patch("quant_worker.services.datetime", FixedDateTime):
                self.assertIsNone(_load_fresh_snapshot(freeze_after_close=False))
                reused = _load_fresh_snapshot(freeze_after_close=False, allow_stale_today=True)
                self.assertEqual(reused[0].quote_time.isoformat(), "2026-10-29T14:00:00+08:00")

    def test_opt_in_with_no_today_snapshot_still_has_cache_miss(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.save_snapshot(directory, "2026-10-28T14:00:00+08:00")
            with patch("quant_worker.services.CACHE_PATH", directory), patch("quant_worker.services.datetime", FixedDateTime):
                self.assertIsNone(_load_fresh_snapshot(freeze_after_close=False, allow_stale_today=True))

    def test_opt_in_can_reuse_pre_close_snapshot_after_close(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.save_snapshot(directory, "2026-10-29T14:00:00+08:00")
            FixedDateTime.current = datetime(2026, 10, 29, 7, 30, tzinfo=UTC)
            try:
                with patch("quant_worker.services.CACHE_PATH", directory), patch("quant_worker.services.datetime", FixedDateTime):
                    self.assertIsNone(_load_fresh_snapshot(freeze_after_close=True))
                    self.assertIsNotNone(_load_fresh_snapshot(freeze_after_close=True, allow_stale_today=True))
            finally:
                FixedDateTime.current = datetime(2026, 10, 29, 6, 30, tzinfo=UTC)


if __name__ == "__main__":
    unittest.main()
