-- AKShare is now cache-only. Remove snapshots written by the previous design
-- so no AKShare market quote remains in SQLite.
DELETE FROM realtime_quotes;
