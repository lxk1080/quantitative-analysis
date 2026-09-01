from __future__ import annotations

from typing import Any


def excluded_security_reason(security: dict[str, Any]) -> str | None:
    """Return a strategy-universe exclusion reason, independent of provider labels."""
    code = str(security.get("code", ""))
    exchange = str(security.get("exchange", ""))
    if bool(security.get("is_st")):
        return "已排除 ST 股票"
    # Some provider snapshots mislabel post-reform BSE 920xxx codes as SH.
    # Keep code-range checks as the authoritative fallback: 4/8 are legacy
    # BSE ranges and 920 is the current range.
    if exchange == "BJ" or code.startswith(("4", "8", "920")):
        return "已排除北交所股票"
    if code.startswith(("688", "689")):
        return "已排除科创板股票"
    return None
