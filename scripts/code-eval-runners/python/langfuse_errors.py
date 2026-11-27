"""Typed operational errors for the Python evaluation runner.

These are runner-local types, not public exceptions from the Langfuse Python SDK.
"""


class LangfuseError(Exception):
    """Base class for errors raised by Langfuse runner infrastructure."""


class LangfuseConfigurationError(LangfuseError):
    """Invalid evaluator configuration, such as a missing evaluate function."""
