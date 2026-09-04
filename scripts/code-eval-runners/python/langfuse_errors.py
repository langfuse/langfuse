"""Langfuse error hierarchy for Python.

This module provides narrow exception types so callers can distinguish
operational Langfuse failures (auth, configuration, API) from programmer
errors such as ``NameError``, ``ImportError`` or ``SyntaxError`` that
would otherwise be masked by catching bare ``Exception``.

The hierarchy mirrors the TypeScript ``BaseError`` family in
``packages/shared/src/errors`` — each subclass carries a stable name
and an HTTP-like status code where applicable.

Example (fixes #906):

    from langfuse_errors import LangfuseAuthError

    def initialize():
        # typo: langfuz is not defined
        langfuz.auth_check()

    try:
        initialize()
    except LangfuseAuthError:
        logger.info("langfuse not configured for this env")
        # NameError is NOT caught — typo surfaces immediately during development

    # Before this module users had to write ``except Exception`` which
    # silently swallowed the NameError and hid the bug until production.
"""

from __future__ import annotations


class LangfuseError(Exception):
    """Base for all Langfuse-specific errors.

    Catching this type handles any Langfuse failure without also catching
    unrelated programming errors (``NameError``, ``ImportError``,
    ``AttributeError``, ``SyntaxError``, etc.).
    """


class LangfuseAuthError(LangfuseError):
    """Raised when credentials are invalid or no project is associated.

    Equivalent to HTTP 401/403 in the TypeScript ``UnauthorizedError``.
    Used by ``auth_check()`` when the project list is empty.
    """


class LangfuseConfigurationError(LangfuseError):
    """Raised for invalid evaluator or SDK configuration.

    Examples: evaluator source missing an ``evaluate`` function, malformed
    ``EvaluationResult`` shape, or missing required environment variables.
    """


class LangfuseAPIError(LangfuseError):
    """Raised for operational API failures (network, 5xx, etc.)."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code
