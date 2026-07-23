#!/usr/bin/env python3
"""Exercise the v4 migration audit against a disposable Langfuse PR preview.

The script installs Python SDK v3 in an isolated virtual environment, sends a
trace, waits ten minutes, upgrades that same environment to SDK v4, sends a
second trace, and finally sends a raw OTLP span without Langfuse SDK
attribution headers.

Only synthetic PR previews are accepted as targets.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

DEFAULT_OLD_SDK_VERSION = "3.14.2"
DEFAULT_CURRENT_SDK_VERSION = "4.14.1"
DEFAULT_DELAY_SECONDS = 10 * 60
DEFAULT_SETTLE_SECONDS = 30
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")

LANGFUSE_PHASE = r"""
import json
import os

from langfuse import Langfuse

client = Langfuse(
    public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
    secret_key=os.environ["LANGFUSE_SECRET_KEY"],
    host=os.environ["LANGFUSE_HOST"],
)

with client.start_as_current_observation(
    as_type="span",
    name=os.environ["TEST_SPAN_NAME"],
    input={"phase": os.environ["TEST_PHASE"]},
    output={"result": "synthetic preview data"},
    metadata={
        "preview_test_run": os.environ["TEST_RUN_ID"],
        "sdk_phase": os.environ["TEST_PHASE"],
    },
):
    pass

client.flush()
client.shutdown()
print(json.dumps({"phase": os.environ["TEST_PHASE"], "status": "flushed"}))
"""

RAW_OTEL_PHASE = r"""
import base64
import json
import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

credentials = (
    f'{os.environ["LANGFUSE_PUBLIC_KEY"]}:{os.environ["LANGFUSE_SECRET_KEY"]}'
).encode("utf-8")
authorization = base64.b64encode(credentials).decode("ascii")
provider = TracerProvider(
    resource=Resource.create(
        {
            "service.name": "langfuse-preview-raw-otel",
            "preview.test_run": os.environ["TEST_RUN_ID"],
        }
    )
)
provider.add_span_processor(
    SimpleSpanProcessor(
        OTLPSpanExporter(
            endpoint=f'{os.environ["LANGFUSE_HOST"]}/api/public/otel/v1/traces',
            headers={
                "Authorization": f"Basic {authorization}",
                "x-langfuse-ingestion-version": "4",
            },
        )
    )
)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("langfuse-preview-raw-otel")
with tracer.start_as_current_span(os.environ["TEST_SPAN_NAME"]) as span:
    span.set_attribute("preview.test_run", os.environ["TEST_RUN_ID"])
    span.set_attribute("preview.synthetic", True)

provider.shutdown()
print(json.dumps({"phase": "raw-otel", "status": "flushed"}))
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--host",
        default=os.environ.get("LANGFUSE_HOST"),
        help="PR preview URL, for example https://pr-123.preview.langfuse.com",
    )
    parser.add_argument(
        "--public-key",
        default=os.environ.get("LANGFUSE_PUBLIC_KEY"),
        help="Synthetic preview public key (or LANGFUSE_PUBLIC_KEY)",
    )
    parser.add_argument(
        "--secret-key",
        default=os.environ.get("LANGFUSE_SECRET_KEY"),
        help="Synthetic preview secret key (or LANGFUSE_SECRET_KEY)",
    )
    parser.add_argument(
        "--old-version",
        default=DEFAULT_OLD_SDK_VERSION,
        help=f"Outdated Python SDK version (default: {DEFAULT_OLD_SDK_VERSION})",
    )
    parser.add_argument(
        "--current-version",
        default=DEFAULT_CURRENT_SDK_VERSION,
        help=(
            "Current Python SDK version "
            f"(default: {DEFAULT_CURRENT_SDK_VERSION})"
        ),
    )
    parser.add_argument(
        "--delay-seconds",
        type=int,
        default=DEFAULT_DELAY_SECONDS,
        help=f"Delay between SDK v3 and v4 ingestion (default: {DEFAULT_DELAY_SECONDS})",
    )
    parser.add_argument(
        "--settle-seconds",
        type=int,
        default=DEFAULT_SETTLE_SECONDS,
        help=f"Post-ingestion wait for async processing (default: {DEFAULT_SETTLE_SECONDS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs and print the plan without installing or ingesting",
    )
    return parser.parse_args()


def validate_preview_host(host: str | None) -> str:
    if not host:
        raise ValueError("--host or LANGFUSE_HOST is required")

    normalized = host.rstrip("/")
    parsed = urlparse(normalized)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".preview.langfuse.com")
        or parsed.username
        or parsed.password
        or parsed.port
        or parsed.path not in ("", "/")
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "host must be an HTTPS Langfuse PR preview URL without credentials, "
            "a port, path, query, or fragment"
        )
    return normalized


def validate_version(version: str, label: str) -> str:
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError(f"{label} must be an exact stable x.y.z version")
    return version


def install_sdk(venv_python: Path, version: str) -> None:
    requirement = f"langfuse=={version}"
    uv = shutil.which("uv")
    if uv:
        command = [uv, "pip", "install", "--python", str(venv_python), requirement]
    else:
        command = [
            str(venv_python),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            requirement,
        ]
    subprocess.run(command, check=True)


def run_phase(
    venv_python: Path,
    source: str,
    *,
    environment: dict[str, str],
) -> None:
    subprocess.run(
        [str(venv_python), "-c", source],
        check=True,
        env={**os.environ, **environment},
    )


def main() -> int:
    args = parse_args()
    try:
        host = validate_preview_host(args.host)
        old_version = validate_version(args.old_version, "old version")
        current_version = validate_version(args.current_version, "current version")
        if args.delay_seconds < 0 or args.settle_seconds < 0:
            raise ValueError("delay values must be non-negative")
        if not args.dry_run and (not args.public_key or not args.secret_key):
            raise ValueError(
                "--public-key/--secret-key or matching environment variables are required"
            )
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    run_id = uuid.uuid4().hex[:12]
    plan = {
        "host": host,
        "runId": run_id,
        "oldSdkVersion": old_version,
        "currentSdkVersion": current_version,
        "delaySeconds": args.delay_seconds,
        "settleSeconds": args.settle_seconds,
        "phases": ["python-v3", "python-v4", "raw-otel"],
    }
    print(json.dumps(plan, indent=2))
    if args.dry_run:
        return 0

    phase_environment = {
        "LANGFUSE_HOST": host,
        "LANGFUSE_PUBLIC_KEY": args.public_key,
        "LANGFUSE_SECRET_KEY": args.secret_key,
        "TEST_RUN_ID": run_id,
    }

    with tempfile.TemporaryDirectory(prefix="langfuse-preview-upgrade-") as directory:
        venv_dir = Path(directory) / ".venv"
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
        venv_python = (
            venv_dir / "Scripts" / "python.exe"
            if sys.platform == "win32"
            else venv_dir / "bin" / "python"
        )

        install_sdk(venv_python, old_version)
        old_sent_at = datetime.now(UTC)
        run_phase(
            venv_python,
            LANGFUSE_PHASE,
            environment={
                **phase_environment,
                "TEST_PHASE": "python-v3-before-upgrade",
                "TEST_SPAN_NAME": f"preview-python-v3-{run_id}",
            },
        )
        print(
            f"Python SDK {old_version} flushed at {old_sent_at.isoformat()}; "
            f"waiting {args.delay_seconds} seconds before upgrading.",
            flush=True,
        )
        time.sleep(args.delay_seconds)

        install_sdk(venv_python, current_version)
        current_sent_at = datetime.now(UTC)
        run_phase(
            venv_python,
            LANGFUSE_PHASE,
            environment={
                **phase_environment,
                "TEST_PHASE": "python-v4-after-upgrade",
                "TEST_SPAN_NAME": f"preview-python-v4-{run_id}",
            },
        )
        run_phase(
            venv_python,
            RAW_OTEL_PHASE,
            environment={
                **phase_environment,
                "TEST_PHASE": "raw-otel",
                "TEST_SPAN_NAME": f"preview-raw-otel-{run_id}",
            },
        )
        print(
            f"Python SDK {current_version} and raw OTel flushed at "
            f"{current_sent_at.isoformat()}; waiting {args.settle_seconds} "
            "seconds for asynchronous ingestion.",
            flush=True,
        )
        time.sleep(args.settle_seconds)

    print(
        json.dumps(
            {
                **plan,
                "oldSentAt": old_sent_at.isoformat(),
                "currentSentAt": current_sent_at.isoformat(),
                "status": "complete",
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
