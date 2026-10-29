CREATE TABLE IF NOT EXISTS user_custom_collections (
  username TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (username, id)
);

CREATE INDEX IF NOT EXISTS user_custom_collections_updated_idx ON user_custom_collections (username, updated_at DESC);

CREATE TABLE IF NOT EXISTS daily_watchlists (
  username TEXT NOT NULL,
  selected_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (username, selected_date)
);

CREATE TABLE IF NOT EXISTS daily_watchlist_stocks (
  username TEXT NOT NULL,
  selected_date TEXT NOT NULL,
  stock_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  rule_title TEXT NOT NULL,
  industry TEXT,
  added_at TEXT NOT NULL,
  PRIMARY KEY (username, selected_date, stock_code),
  FOREIGN KEY (username, selected_date) REFERENCES daily_watchlists (username, selected_date) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legacy_collection_import (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
