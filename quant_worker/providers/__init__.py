"""External market-data adapters.

Only this package may depend on a concrete vendor SDK or HTTP endpoint.
"""

from quant_worker.providers.base import MarketDataProvider, ProviderNotConfigured
from quant_worker.providers.akshare_provider import AkshareProvider

__all__ = ["AkshareProvider", "MarketDataProvider", "ProviderNotConfigured"]
