"""Composable preset screening strategies.

Each strategy owns its market-specific definition.  The generic JSON rule
engine only dispatches to this registry, so adding a strategy does not turn
``rules.py`` into a large conditional block.
"""

from quant_worker.strategy_rules.registry import evaluate_preset

__all__ = ["evaluate_preset"]
