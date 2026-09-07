import copy
import unittest
from datetime import date, datetime, timedelta

from quant_worker.screening_data import build_screening_bars
from quant_worker.rules import evaluate_condition


class UnifiedScreeningTests(unittest.TestCase):
    def setUp(self):
        self.history = [dict(trade_date=(date(2026, 5, 1) + timedelta(days=i)).isoformat(),
                             open_qfq=10., high_qfq=10., low_qfq=10., close_qfq=10.,
                             raw_close=10., pre_close=10., volume=100) for i in range(70)]
        self.quote = dict(captured_timestamp=datetime.fromisoformat("2026-09-07T11:30:00+08:00").timestamp(),
                          qfq_open=10., qfq_high=10., qfq_low=9., qfq_price=9.,
                          raw_last_price=9., raw_pre_close=10., volume=100.)

    def context(self, bars):
        return dict(bars=bars, indicators=bars, current_price=bars[-1]["close_qfq"],
                    security=dict(code="600830", exchange="SH", is_st=False), two_month_rank=1)

    def test_today_is_appended_without_mutating_history_and_recomputes_indicators(self):
        original = copy.deepcopy(self.history)
        bars = build_screening_bars("600830", self.history, self.quote)
        self.assertEqual(self.history, original)
        self.assertEqual(len(bars), 71)
        self.assertEqual(bars[-1]["trade_date"], "2026-09-07")
        self.assertEqual(bars[-1]["close_qfq"], 9.)
        self.assertEqual(bars[-1]["ma5"], 9.8)
        self.assertIsNotNone(bars[-1]["dkx"])
        self.assertIsNotNone(bars[-1]["madkx10"])
        self.assertEqual(bars[-1]["trading_minutes"], 120)

    def test_persisted_today_is_not_duplicated_or_overwritten(self):
        today = dict(self.history[-1], trade_date="2026-09-07")
        bars = build_screening_bars("600830", self.history + [today], self.quote)
        self.assertEqual(len(bars), 71)
        self.assertEqual(bars[-1]["close_qfq"], 10.)
        self.assertEqual(bars[-1]["trading_minutes"], 240)

    def test_all_rules_are_independent_of_source_with_same_data(self):
        quote = dict(self.quote, captured_timestamp=datetime.fromisoformat("2026-09-07T15:00:00+08:00").timestamp())
        live = build_screening_bars("600830", self.history, quote)
        daily = build_screening_bars("600830", live)
        conditions = [
            dict(type="exclude_st"), dict(type="exclude_star"), dict(type="exclude_bj"),
            dict(type="kline_above_ma", days=3, ma_days=5),
            dict(type="close_above_dkx_days", days=9), dict(type="two_month_return_rank", top=30),
            dict(type="daily_return_range", days=3, lower=0, upper=3),
            dict(type="interval_return_below", days=4, maximum=0),
            dict(type="price_above_indicator", indicator="ma60"),
            dict(type="cross_above", left="dkx", right="madkx10"), dict(type="volume_multiple", window=5),
        ]
        for offset in range(4):
            conditions.extend(dict(type=kind, days_ago=offset) for kind in
                              ("limit_up_days_ago", "volume_ratio_days_ago", "close_dkx_deviation"))
        conditions.extend(dict(type="preset", preset_id=name) for name in
                          ("n_pattern", "n_low_absorption", "mid_term_trend"))
        for condition in conditions:
            with self.subTest(condition=condition):
                self.assertEqual(evaluate_condition(condition, self.context(live)),
                                 evaluate_condition(condition, self.context(daily)))

    def test_today_breaks_ma_and_is_included_in_recent_windows(self):
        bars = build_screening_bars("600830", self.history, self.quote)
        context = self.context(bars)
        self.assertEqual(evaluate_condition(dict(type="kline_above_ma", days=3, ma_days=5), context).status, "not_matched")
        self.assertEqual(evaluate_condition(dict(type="daily_return_range", days=3, lower=0, upper=3), context).status, "not_matched")
        self.assertEqual(evaluate_condition(dict(type="interval_return_below", days=4, maximum=0), context).status, "matched")
        bars[-4].update(raw_close=11., pre_close=10.)
        self.assertEqual(evaluate_condition(dict(type="preset", preset_id="n_pattern"), context).status, "not_matched")

    def test_offset_zero_to_three_select_exact_bar(self):
        bars = build_screening_bars("600830", self.history, self.quote)
        for offset in range(4):
            with self.subTest(offset=offset):
                result = evaluate_condition(dict(type="limit_up_days_ago", days_ago=offset), self.context(bars))
                self.assertEqual(result.values["date"], bars[-offset - 1]["trade_date"])
                result = evaluate_condition(dict(type="close_dkx_deviation", days_ago=offset), self.context(bars))
                self.assertEqual(result.values["date"], bars[-offset - 1]["trade_date"])

    def test_volume_ratio_uses_snapshot_duration_and_previous_five_days(self):
        bars = build_screening_bars("600830", self.history, self.quote)
        result = evaluate_condition(dict(type="volume_ratio_days_ago", days_ago=0), self.context(bars))
        self.assertEqual(result.values["volume_ratio"], 2.)
        result = evaluate_condition(dict(type="volume_ratio_days_ago", days_ago=1), self.context(bars))
        self.assertEqual(result.values["volume_ratio"], 1.)
