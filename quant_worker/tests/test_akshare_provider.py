from __future__ import annotations

from datetime import date
import unittest

import pandas as pd

from quant_worker.providers.akshare_provider import AkshareProvider


class FakeAkshare:
    def stock_zh_a_spot_tx(self):
        raise RuntimeError("Tencent unavailable")

    def stock_zh_a_spot_em(self):
        return pd.DataFrame([{"代码": "000001", "名称": "平安银行", "最新价": 10.5, "成交量": 100, "成交额": 1000}])

    def stock_zh_a_spot(self):
        return pd.DataFrame([{"代码": "000001", "名称": "新浪备用", "最新价": 10.6}])

    def stock_ipo_ths(self, symbol: str):
        return pd.DataFrame([{"股票代码": "000001", "股票简称": "同花顺备用"}])

    def stock_zh_a_hist_tx(self, **kwargs):
        raise RuntimeError("Tencent daily unavailable")

    def stock_zh_a_hist(self, **kwargs):
        return pd.DataFrame([
            {"日期": "2026-08-27", "开盘": 10.0, "最高": 11.0, "最低": 9.8, "收盘": 10.5, "成交量": 100, "成交额": 1000.0, "换手率": 1.2}
        ])

    def stock_zh_a_daily(self, **kwargs):
        raise AssertionError("Sina should not be selected while Eastmoney is valid")


class FakeSinaOnly(FakeAkshare):
    def stock_zh_a_spot_em(self):
        raise RuntimeError("Eastmoney unavailable")

    def stock_zh_a_hist(self, **kwargs):
        raise RuntimeError("Eastmoney daily unavailable")

    def stock_zh_a_daily(self, **kwargs):
        return pd.DataFrame([
            {"date": "2026-08-27", "open": 10.0, "high": 11.0, "low": 9.8, "close": 10.5, "volume": 100, "amount": 1000.0}
        ])


class AkshareProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = AkshareProvider(ak_client=FakeAkshare())

    def test_st_and_exchange_normalization(self) -> None:
        self.assertTrue(AkshareProvider._is_st("*ST 测试"))
        self.assertTrue(AkshareProvider._is_st("st测试"))
        self.assertFalse(AkshareProvider._is_st("平安银行"))
        self.assertEqual(AkshareProvider._exchange("600000"), "SH")
        self.assertEqual(AkshareProvider._exchange("300750"), "SZ")
        self.assertEqual(AkshareProvider._exchange("830001"), "BJ")

    def test_universe_and_realtime_fall_back_to_eastmoney(self) -> None:
        securities = self.provider.list_securities()
        self.assertEqual([item.code for item in securities], ["000001"])
        quotes, unavailable = self.provider.fetch_realtime_quotes(["000001", "600000"])
        self.assertEqual(quotes[0].provider_name, "akshare-eastmoney")
        self.assertEqual(unavailable, {"600000": "quote missing or invalid in selected source"})
        self.assertTrue(self.provider.audit_summary()["fallbacks"])

    def test_daily_falls_back_without_mixing_qfq_anchor_sources(self) -> None:
        data, failures = self.provider.fetch_daily_bars(["000001"], date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(failures, {})
        self.assertEqual(data["000001"][0].provider_name, "akshare-eastmoney")
        self.assertEqual(data["000001"][0].raw_close, 10.5)

    def test_daily_reaches_sina_when_tencent_and_eastmoney_fail(self) -> None:
        provider = AkshareProvider(ak_client=FakeSinaOnly())
        data, failures = provider.fetch_daily_bars(["000001"], date(2026, 8, 1), date(2026, 8, 31))
        self.assertEqual(failures, {})
        self.assertEqual(data["000001"][0].provider_name, "akshare-sina")


if __name__ == "__main__":
    unittest.main()
