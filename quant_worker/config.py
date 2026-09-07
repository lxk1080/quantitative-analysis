from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", PROJECT_ROOT / "data" / "quant.db"))
MIGRATIONS_PATH = PROJECT_ROOT / "drizzle"
CACHE_PATH = PROJECT_ROOT / "caches"
# Keep a buffer above MA60 so suspensions or omitted daily rows do not make an
# otherwise mature stock lose its moving average.
RETAINED_TRADING_DAYS = 90
INDICATOR_VERSION = "ma-dkx-ths-v2"
REALTIME_CACHE_TTL_SECONDS = 10 * 60
SHANGHAI_TIMEZONE = "Asia/Shanghai"


def load_project_env() -> None:
    """Load local development variables without adding a dotenv dependency.

    Node reads `.env.local` automatically; the standalone Python worker does
    not. Existing process environment always wins, which keeps deployments
    compatible with ordinary environment-variable configuration.
    """
    env_file = PROJECT_ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        item = line.strip()
        if not item or item.startswith("#") or "=" not in item:
            continue
        key, value = item.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))
