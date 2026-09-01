CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS securities (
  code TEXT PRIMARY KEY NOT NULL,
  exchange TEXT NOT NULL,
  name TEXT NOT NULL,
  security_type TEXT NOT NULL,
  is_st INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  listed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_bars (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open_qfq REAL NOT NULL,
  high_qfq REAL NOT NULL,
  low_qfq REAL NOT NULL,
  close_qfq REAL NOT NULL,
  volume INTEGER NOT NULL,
  amount REAL,
  turnover_rate REAL,
  raw_close REAL,
  provider_name TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  data_version INTEGER NOT NULL,
  quality_status TEXT NOT NULL,
  PRIMARY KEY (stock_code, trade_date),
  FOREIGN KEY (stock_code) REFERENCES securities(code)
);
CREATE INDEX IF NOT EXISTS daily_bars_trade_date_code_idx ON daily_bars(trade_date, stock_code);
CREATE INDEX IF NOT EXISTS daily_bars_code_date_idx ON daily_bars(stock_code, trade_date DESC);

CREATE TABLE IF NOT EXISTS daily_indicators (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  ma5 REAL,
  ma10 REAL,
  ma60 REAL,
  dkx REAL,
  madkx10 REAL,
  indicator_version TEXT NOT NULL,
  source_data_version INTEGER NOT NULL,
  calculated_at TEXT NOT NULL,
  PRIMARY KEY (stock_code, trade_date),
  FOREIGN KEY (stock_code, trade_date) REFERENCES daily_bars(stock_code, trade_date)
);

CREATE TABLE IF NOT EXISTS realtime_quotes (
  stock_code TEXT PRIMARY KEY NOT NULL,
  quote_time TEXT NOT NULL,
  raw_last_price REAL NOT NULL,
  qfq_last_price REAL,
  volume INTEGER,
  amount REAL,
  qfq_factor REAL,
  quality_status TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  FOREIGN KEY (stock_code) REFERENCES securities(code)
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS sync_jobs_status_created_idx ON sync_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS screening_rules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screening_runs (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  mode TEXT NOT NULL,
  data_as_of TEXT NOT NULL,
  status TEXT NOT NULL,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unavailable_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (rule_id) REFERENCES screening_rules(id)
);

CREATE TABLE IF NOT EXISTS screening_results (
  run_id TEXT NOT NULL,
  stock_code TEXT NOT NULL,
  status TEXT NOT NULL,
  current_price REAL,
  detail_json TEXT NOT NULL,
  PRIMARY KEY (run_id, stock_code),
  FOREIGN KEY (run_id) REFERENCES screening_runs(id),
  FOREIGN KEY (stock_code) REFERENCES securities(code)
);

CREATE TABLE IF NOT EXISTS sync_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  event_type TEXT NOT NULL,
  provider_name TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES sync_jobs(id)
);
