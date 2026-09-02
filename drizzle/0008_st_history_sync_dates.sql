-- Non-ST history completion must not be mistaken for an ST-inclusive cache.
CREATE TABLE IF NOT EXISTS history_st_sync_dates (
  trade_date TEXT PRIMARY KEY NOT NULL,
  provider_name TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);
