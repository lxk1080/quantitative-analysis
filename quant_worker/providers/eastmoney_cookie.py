from __future__ import annotations

import os
from threading import Lock
from urllib.parse import urlsplit

import requests

from quant_worker.config import load_project_env


_install_lock = Lock()
_installed = False


def install_eastmoney_cookie() -> None:
    """Attach the configured cookie to AKShare's Eastmoney requests only."""
    global _installed
    load_project_env()
    if not os.environ.get("EASTMONEY_COOKIE", "").strip():
        return
    with _install_lock:
        if _installed:
            return
        original_request = requests.Session.request

        def request_with_cookie(self: requests.Session, method: str, url: str, **kwargs):
            host = urlsplit(url).hostname or ""
            cookie = os.environ.get("EASTMONEY_COOKIE", "").strip()
            if cookie and (host == "eastmoney.com" or host.endswith(".eastmoney.com")):
                headers = dict(kwargs.get("headers") or {})
                headers["Cookie"] = cookie
                kwargs["headers"] = headers
            return original_request(self, method, url, **kwargs)

        requests.Session.request = request_with_cookie
        _installed = True
