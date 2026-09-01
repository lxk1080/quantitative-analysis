from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from quant_worker.database import apply_migrations, connect
from quant_worker.demo import seed_demo_data
from quant_worker.config import RETAINED_TRADING_DAYS
from quant_worker.worker import process_one_job


class WorkerTests(unittest.TestCase):
    def test_demo_data_is_retained_and_screened_through_a_job(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            connection = connect(Path(directory) / "quant.db")
            try:
                apply_migrations(connection)
                seed_demo_data(connection)
                row_count = connection.execute("SELECT COUNT(*) FROM daily_bars").fetchone()[0]
                self.assertEqual(row_count, 3 * RETAINED_TRADING_DAYS)
                connection.execute(
                    """INSERT INTO sync_jobs(id, kind, payload_json, status, created_at)
                       VALUES ('screen-job', 'screening', ?, 'queued', '2025-01-01T00:00:00+00:00')""",
                    (json.dumps({"rule_id": "demo-trend-rule", "mode": "post_close"}),),
                )
                # Demo data intentionally has no live-provider staging rows.
                # Provider orchestration is covered separately; this test keeps
                # validating the queued screening persistence contract offline.
                with patch("quant_worker.worker.ensure_screening_data", return_value=("post_close", {})):
                    self.assertTrue(process_one_job(connection))
                job = connection.execute("SELECT status, summary_json FROM sync_jobs WHERE id='screen-job'").fetchone()
                self.assertEqual(job["status"], "succeeded")
                summary = json.loads(job["summary_json"])
                result_count = connection.execute(
                    "SELECT COUNT(*) FROM screening_results WHERE run_id=?", (summary["run_id"],)
                ).fetchone()[0]
                self.assertEqual(result_count, 3)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
