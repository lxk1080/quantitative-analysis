from __future__ import annotations

import unittest

from quant_worker.rules import evaluate_rule


class RuleTests(unittest.TestCase):
    def test_price_above_indicator_matches(self) -> None:
        context = {
            "current_price": 12.0,
            "bars": [{"volume": 10}] * 6,
            "indicators": [{"ma60": 10.0}, {"ma60": 11.0}],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "price_above_indicator", "indicator": "ma60"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_cross_above_needs_two_complete_values(self) -> None:
        context = {
            "current_price": 12.0,
            "bars": [{"volume": 10}] * 6,
            "indicators": [{"ma5": 9.0, "ma10": 10.0}, {"ma5": 11.0, "ma10": 10.0}],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "cross_above", "left": "ma5", "right": "ma10"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_n_pattern_matches_raw_limit_up_and_three_lows_above_ma5(self) -> None:
        context = {
            "current_price": 12.0,
            "security": {"code": "000001", "exchange": "SZ", "is_st": False},
            "bars": [
                {"trade_date": "2026-08-25", "low_qfq": 9.8, "ma5": 9.5},
                {"trade_date": "2026-08-26", "low_qfq": 10.1, "ma5": 9.8},
                {"trade_date": "2026-08-27", "raw_close": 11.0, "pre_close": 10.0, "low_qfq": 10.3, "ma5": 10.0},
                {"trade_date": "2026-08-28", "low_qfq": 10.7, "ma5": 10.4},
                {"trade_date": "2026-08-31", "low_qfq": 10.9, "ma5": 10.6},
                {"trade_date": "2026-09-01", "low_qfq": 11.0, "ma5": 10.8},
            ],
            "indicators": [],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "n_pattern"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_n_pattern_excludes_star_board(self) -> None:
        context = {
            "current_price": 12.0,
            "security": {"code": "688001", "exchange": "SH", "is_st": False},
            "bars": [{"trade_date": "2026-09-01", "low_qfq": 10.0, "ma5": 9.0}] * 4,
            "indicators": [],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "n_pattern"}]}, context)
        self.assertEqual(result.status, "not_matched")

    def test_n_pattern_uses_three_day_offset_with_today_in_sequence(self) -> None:
        bars = [
            {"trade_date": "2026-08-26", "low_qfq": 10.3, "ma5": 9.9},
            {"trade_date": "2026-08-27", "raw_close": 11.0, "pre_close": 10.0, "low_qfq": 10.5, "ma5": 10.0},
            {"trade_date": "2026-08-28", "low_qfq": 10.5, "ma5": 10.0},
            {"trade_date": "2026-09-01", "low_qfq": 10.6, "ma5": 10.1},
            {"trade_date": "2026-09-02", "low_qfq": 10.7, "ma5": 10.2},
        ]
        context = {"current_price": 10.8, "mode": "intraday", "security": {"code": "000001", "exchange": "SZ", "is_st": False}, "bars": bars, "indicators": bars}
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "n_pattern"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_custom_today_limit_up_uses_latest_unified_bar(self) -> None:
        context = {
            "mode": "intraday",
            "security": {"code": "000001", "exchange": "SZ", "is_st": False},
            "intraday_quote": {"raw_last_price": 11.0, "raw_pre_close": 10.0, "qfq_price": 11.0},
            "bars": [{"trade_date": "2026-09-01", "close_qfq": 10.0},
                     {"trade_date": "2026-09-02", "close_qfq": 11.0, "raw_close": 11.0, "pre_close": 10.0}],
            "indicators": [],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "limit_up_days_ago", "days_ago": 0}]}, context)
        self.assertEqual(result.status, "matched")

    def test_mid_term_trend_matches_when_nine_closes_are_above_dkx_and_price_is_near_dkx(self) -> None:
        bars = [
            {"trade_date": f"2026-08-{day:02d}", "close_qfq": 10.2, "dkx": 10.0}
            for day in range(1, 10)
        ]
        bars.append({"trade_date": "2026-08-10", "close_qfq": 10.1, "dkx": 10.0})
        context = {
            "current_price": 10.3,
            "security": {"code": "000001", "exchange": "SZ", "is_st": False},
            "bars": bars,
            "indicators": bars,
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "mid_term_trend"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_n_low_absorption_matches_a_negative_four_day_return_after_limit_up(self) -> None:
        context = {
            "current_price": 10.0,
            "security": {"code": "000001", "exchange": "SZ", "is_st": False},
            "bars": [
                {"trade_date": "2026-08-26", "raw_close": 11.0, "pre_close": 10.0, "close_qfq": 11.0},
                {"trade_date": "2026-08-27", "close_qfq": 10.8},
                {"trade_date": "2026-08-28", "close_qfq": 10.6},
                {"trade_date": "2026-08-31", "close_qfq": 10.5},
                {"trade_date": "2026-09-01", "close_qfq": 10.4},
            ],
            "indicators": [],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "n_low_absorption"}]}, context)
        self.assertEqual(result.status, "matched")

    def test_n_low_absorption_excludes_920_bse_code_even_when_provider_marks_it_sh(self) -> None:
        context = {
            "current_price": 10.0,
            "security": {"code": "920735", "exchange": "SH", "is_st": False},
            "bars": [{"trade_date": "2026-09-01", "close_qfq": 10.0}] * 5,
            "indicators": [],
        }
        result = evaluate_rule({"operator": "all", "conditions": [{"type": "preset", "preset_id": "n_low_absorption"}]}, context)
        self.assertEqual(result.status, "not_matched")
        self.assertEqual(result.conditions[0].message, "已排除北交所股票")


if __name__ == "__main__":
    unittest.main()
