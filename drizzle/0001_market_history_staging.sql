-- Raw daily data is retained only long enough to derive the 70 QFQ bars.
-- Keeping source prices makes the adjustment calculation reproducible and
-- lets an after-close realtime snapshot become an ordinary daily bar.
CREATE TABLE IF NOT EXISTS daily_raw_bars (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open_price REAL NOT NULL,
  high_price REAL NOT NULL,
  low_price REAL NOT NULL,
  close_price REAL NOT NULL,
  pre_close REAL,
  volume INTEGER NOT NULL,
  amount REAL,
  provider_name TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (stock_code, trade_date),
  FOREIGN KEY (stock_code) REFERENCES securities(code)
);
CREATE INDEX IF NOT EXISTS daily_raw_bars_date_code_idx ON daily_raw_bars(trade_date, stock_code);

-- A successful Tushare `daily(trade_date=...)` call covers the market once.
-- This marker prevents every later sync from re-requesting already-complete
-- historical trading days.
CREATE TABLE IF NOT EXISTS history_sync_dates (
  trade_date TEXT PRIMARY KEY NOT NULL,
  provider_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);
