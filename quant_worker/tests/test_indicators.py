from __future__ import annotations

import unittest
from datetime import date, timedelta

from quant_worker.indicators import calculate_indicators, rolling_mean
from quant_worker.models import DailyBar


class IndicatorTests(unittest.TestCase):
    def test_rolling_mean_requires_complete_window(self) -> None:
        self.assertEqual(rolling_mean([1.0, 2.0, 3.0, 4.0], 3), [None, None, 2.0, 3.0])

    def test_dkx_and_moving_averages_are_available_at_expected_boundaries(self) -> None:
        start = date(2025, 1, 1)
        bars = [
            DailyBar("000001", start + timedelta(days=index), 10 + index, 11 + index, 9 + index, 10 + index, 1000)
            for index in range(70)
        ]
        indicators = calculate_indicators(bars)
        self.assertIsNone(indicators[3].ma5)
        self.assertIsNotNone(indicators[4].ma5)
        self.assertIsNotNone(indicators[9].ma10)
        self.assertIsNone(indicators[19].dkx)
        self.assertIsNotNone(indicators[20].dkx)
        self.assertIsNone(indicators[28].madkx10)
        self.assertIsNotNone(indicators[29].madkx10)
        self.assertIsNotNone(indicators[59].ma60)


if __name__ == "__main__":
    unittest.main()
