from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from quant_worker.config import DATABASE_PATH, MIGRATIONS_PATH


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def connect(database_path: Path = DATABASE_PATH) -> sqlite3.Connection:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


@contextmanager
def transaction(connection: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
    except Exception:
        connection.execute("ROLLBACK")
        raise
    else:
        connection.execute("COMMIT")


def apply_migrations(connection: sqlite3.Connection) -> int:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)"
    )
    applied = {row[0] for row in connection.execute("SELECT name FROM schema_migrations")}
    migrations = sorted(MIGRATIONS_PATH.glob("*.sql"))
    count = 0
    for migration in migrations:
        if migration.name in applied:
            continue
        # sqlite3.executescript issues its own transaction boundary. Keeping it
        # outside our transaction context avoids a false "no transaction" commit.
        connection.executescript(migration.read_text(encoding="utf-8"))
        connection.execute(
            "INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)",
            (migration.name, utc_now()),
        )
        count += 1
    return count
