#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx==0.28.1",
#   "traceloop-sdk==0.62.1",
# ]
# ///

"""Ingest and verify a synthetic TraceLoop span on a Langfuse PR preview.

Usage:
  LANGFUSE_PUBLIC_KEY=pk-lf-... \
  LANGFUSE_SECRET_KEY=sk-lf-... \
  uv run scripts/smoke-test-traceloop-preview.py \
    https://pr-12345.preview.langfuse.com
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

PREVIEW_HOST_PATTERN = re.compile(r"^pr-\d+\.preview\.langfuse\.com$")
UNSAFE_ARRAY_INDEX = 10_001


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send a synthetic TraceLoop span to a Langfuse PR preview and verify it."
    )
    parser.add_argument(
        "preview_url",
        nargs="?",
        default=os.environ.get("LANGFUSE_BASE_URL"),
        help="PR preview URL (or set LANGFUSE_BASE_URL)",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=120,
        help="How long to wait for the observation to become queryable (default: 120)",
    )
    args = parser.parse_args()

    if not args.preview_url:
        parser.error("provide a preview URL or set LANGFUSE_BASE_URL")
    if args.timeout_seconds <= 0:
        parser.error("--timeout-seconds must be positive")

    return args


def normalize_preview_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value.rstrip("/"))
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not PREVIEW_HOST_PATTERN.fullmatch(parsed.hostname)
        or parsed.port is not None
        or parsed.path not in ("", "/")
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "preview_url must look like https://pr-12345.preview.langfuse.com"
        )
    return f"https://{parsed.hostname}"


def required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"set the {name} environment variable")
    return value


def basic_auth_header(public_key: str, secret_key: str) -> str:
    credentials = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode(
        "ascii"
    )
    return f"Basic {credentials}"


def emit_span(
    preview_url: str,
    authorization: str,
    run_id: str,
) -> tuple[str, str, str, str]:
    from traceloop.sdk import Traceloop

    Traceloop.init(
        app_name="langfuse-traceloop-preview-smoke-test",
        api_endpoint=f"{preview_url}/api/public/otel",
        headers={
            "Authorization": authorization,
            "x-langfuse-ingestion-version": "4",
        },
        disable_batch=True,
        telemetry_enabled=False,
        should_enrich_metrics=False,
    )

    from opentelemetry import trace
    from opentelemetry.trace import SpanKind

    span_name = f"traceloop-preview-smoke-{run_id}"
    prompt = f"synthetic-valid-prompt-{run_id}"
    completion = f"synthetic-valid-completion-{run_id}"
    unsafe_value = f"synthetic-unsafe-index-{run_id}"

    tracer = trace.get_tracer("opentelemetry.instrumentation.openai.v1")
    with tracer.start_as_current_span(span_name, kind=SpanKind.CLIENT) as span:
        span.set_attribute("llm.request.type", "chat")
        span.set_attribute("gen_ai.system", "OpenAI")
        span.set_attribute("gen_ai.request.model", "synthetic-preview-model")
        span.set_attribute("gen_ai.prompt.0.role", "user")
        span.set_attribute("gen_ai.prompt.0.content", prompt)
        span.set_attribute("gen_ai.completion.0.role", "assistant")
        span.set_attribute("gen_ai.completion.0.content", completion)
        span.set_attribute(f"gen_ai.prompt.{UNSAFE_ARRAY_INDEX}.content", unsafe_value)
        trace_id = f"{span.get_span_context().trace_id:032x}"

    provider = trace.get_tracer_provider()
    force_flush = getattr(provider, "force_flush", None)
    if callable(force_flush) and force_flush(timeout_millis=10_000) is False:
        raise RuntimeError("TraceLoop exporter did not flush within 10 seconds")

    return trace_id, span_name, prompt, completion


def get_json(url: str, authorization: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Authorization": authorization, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def parse_io(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def wait_for_observation(
    preview_url: str,
    authorization: str,
    trace_id: str,
    span_name: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    query = urllib.parse.urlencode(
        {
            "fields": "basic,io",
            "traceId": trace_id,
            "limit": 10,
        }
    )
    url = f"{preview_url}/api/public/v2/observations?{query}"
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        try:
            response = get_json(url, authorization)
            for observation in response.get("data", []):
                if observation.get("name") == span_name:
                    return observation
            last_error = None
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise RuntimeError(
                    f"Langfuse rejected the preview credentials with HTTP {error.code}"
                ) from error
            last_error = error
        except (TimeoutError, urllib.error.URLError) as error:
            last_error = error
        time.sleep(2)

    detail = f": {last_error}" if last_error else ""
    raise TimeoutError(
        f"observation {span_name} was not queryable after {timeout_seconds} seconds{detail}"
    )


def verify_observation(
    observation: dict[str, Any],
    prompt: str,
    completion: str,
    run_id: str,
) -> None:
    parsed_input = parse_io(observation.get("input"))
    parsed_output = parse_io(observation.get("output"))

    expected_input = [{"role": "user", "content": prompt}]
    expected_output = [{"role": "assistant", "content": completion}]
    if parsed_input != expected_input:
        raise AssertionError(
            f"unexpected observation input: {json.dumps(parsed_input, sort_keys=True)}"
        )
    if parsed_output != expected_output:
        raise AssertionError(
            f"unexpected observation output: {json.dumps(parsed_output, sort_keys=True)}"
        )

    unsafe_value = f"synthetic-unsafe-index-{run_id}"
    if unsafe_value in json.dumps(observation, sort_keys=True):
        raise AssertionError("unsafe TraceLoop array index was persisted")


def main() -> int:
    args = parse_args()
    try:
        preview_url = normalize_preview_url(args.preview_url)
        public_key = required_environment("LANGFUSE_PUBLIC_KEY")
        secret_key = required_environment("LANGFUSE_SECRET_KEY")
        authorization = basic_auth_header(public_key, secret_key)
        run_id = uuid.uuid4().hex[:12]

        trace_id, span_name, prompt, completion = emit_span(
            preview_url, authorization, run_id
        )
        observation = wait_for_observation(
            preview_url,
            authorization,
            trace_id,
            span_name,
            args.timeout_seconds,
        )
        verify_observation(observation, prompt, completion, run_id)

        project_id = observation.get("projectId")
        trace_url = (
            f"{preview_url}/project/{project_id}/traces/{trace_id}"
            if project_id
            else None
        )
        print(
            json.dumps(
                {
                    "status": "verified",
                    "traceId": trace_id,
                    "observationId": observation.get("id"),
                    "traceUrl": trace_url,
                    "verified": {
                        "validPromptPreserved": True,
                        "validCompletionPreserved": True,
                        f"arrayIndex{UNSAFE_ARRAY_INDEX}Discarded": True,
                    },
                },
                indent=2,
            )
        )
        return 0
    except (AssertionError, RuntimeError, TimeoutError, ValueError) as error:
        print(f"smoke test failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
