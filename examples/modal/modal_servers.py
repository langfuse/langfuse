"""Scalable Langfuse + AI Gateway Modal App (`@app.server()` + migrations).

Deploys three independently scalable Modal Servers plus a one-off migration
Function from Langfuse's published container images:

  - `LangfuseWeb`       (@app.server, port 3000, unauthenticated=True)
  - `LangfuseAiGateway` (@app.server, port 3031, unauthenticated=True)
  - `LangfuseWorker`    (@app.server, port 3030, unauthenticated=False)
  - `run_migrations`    (@app.function, runs Postgres + ClickHouse migrations)

All credentials live in Modal Secret `langfuse-modal-poc` and all database,
storage, and service endpoints live in Modal Secret `langfuse-modal-endpoints`.
To move from the ephemeral Modal DB Sandbox to external managed databases
(RDS/Neon Postgres, ClickHouse Cloud, Upstash/ElastiCache Redis, AWS S3/R2),
replace the endpoint/credential values in those Secrets and redeploy — no code
changes required.

Deploy directly:
    modal deploy examples/modal/modal_servers.py
    modal run examples/modal/modal_servers.py::run_migrations

Or use the turnkey CLI (which also manages the optional ephemeral DB Sandbox):
    python examples/modal/modal_app.py init-secret
    python examples/modal/modal_app.py up
    python examples/modal/modal_app.py scale --workers 2 --gateways 3
"""

from __future__ import annotations

import os
import signal
import subprocess
from typing import Any

import modal  # type: ignore[import-not-found]

APP_NAME = os.environ.get("LANGFUSE_MODAL_APP_NAME", "langfuse-ai-gateway-poc")
SECRET_NAME = os.environ.get("LANGFUSE_MODAL_SECRET_NAME", "langfuse-modal-poc")
ENDPOINTS_SECRET_NAME = os.environ.get(
    "LANGFUSE_MODAL_ENDPOINTS_SECRET_NAME",
    "langfuse-modal-endpoints",
)
LANGFUSE_TAG = os.environ.get("LANGFUSE_MODAL_TAG", "4")
GATEWAY_TAG = os.environ.get("LANGFUSE_MODAL_GATEWAY_TAG", LANGFUSE_TAG)
ROUTING_REGION = os.environ.get("LANGFUSE_MODAL_ROUTING_REGION", "us-east")

MIN_WEB = int(os.environ.get("LANGFUSE_MODAL_MIN_WEB", "1"))
MAX_WEB = int(os.environ.get("LANGFUSE_MODAL_MAX_WEB", "4"))
MIN_WORKERS = int(os.environ.get("LANGFUSE_MODAL_MIN_WORKERS", "1"))
MAX_WORKERS = int(os.environ.get("LANGFUSE_MODAL_MAX_WORKERS", "4"))
MIN_GATEWAYS = int(os.environ.get("LANGFUSE_MODAL_MIN_GATEWAYS", "1"))
MAX_GATEWAYS = int(os.environ.get("LANGFUSE_MODAL_MAX_GATEWAYS", "10"))

WEB_PORT = 3000
WORKER_PORT = 3030
GATEWAY_PORT = 3031

app = modal.App(APP_NAME)

credentials_secret = modal.Secret.from_name(SECRET_NAME)
endpoints_secret = modal.Secret.from_name(ENDPOINTS_SECRET_NAME)
SHARED_SECRETS = [credentials_secret, endpoints_secret]

web_image = modal.Image.from_registry(
    f"docker.langfuse.com/langfuse/langfuse:{LANGFUSE_TAG}",
    add_python="3.12",
).entrypoint([])

worker_image = modal.Image.from_registry(
    f"docker.langfuse.com/langfuse/langfuse-worker:{LANGFUSE_TAG}",
    add_python="3.12",
).entrypoint([])

gateway_image = modal.Image.from_registry(
    f"docker.langfuse.com/langfuse/ai-gateway:{GATEWAY_TAG}",
    add_python="3.12",
).entrypoint([])


def _stop_process(proc: subprocess.Popen[Any] | None, timeout_s: float = 25.0) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5.0)


@app.function(
    image=web_image,
    secrets=SHARED_SECRETS,
    timeout=600,
    cpu=1.0,
    memory=2048,
    single_use_containers=True,
    env={
        "TELEMETRY_ENABLED": "false",
        "LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED": "false",
        "LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED": "false",
    },
)
def run_migrations() -> str:
    """Run Postgres (Prisma) and ClickHouse migrations once outside web replicas."""
    result = subprocess.run(
        ["./web/entrypoint.sh", "true"],
        cwd="/app",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Migrations failed with exit code {result.returncode}")
    return "migrations-ok"


@app.server(
    image=web_image,
    port=WEB_PORT,
    unauthenticated=True,
    routing_region=ROUTING_REGION,
    cpu=1.0,
    memory=2048,
    min_containers=MIN_WEB,
    max_containers=MAX_WEB,
    target_concurrency=20,
    scaledown_window=300,
    startup_timeout=180,
    exit_grace_period=30,
    secrets=SHARED_SECRETS,
    env={
        "HOSTNAME": "0.0.0.0",
        "PORT": str(WEB_PORT),
        "TELEMETRY_ENABLED": "false",
        "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES": "false",
        "LANGFUSE_TRUSTED_PROXY_COUNT": "1",
        "LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED": "true",
        "LANGFUSE_AUTO_CLICKHOUSE_MIGRATION_DISABLED": "true",
        "LANGFUSE_INIT_ORG_ID": "modal-poc-org",
        "LANGFUSE_INIT_ORG_NAME": "Modal PoC Org",
        "LANGFUSE_INIT_PROJECT_ID": "modal-poc-project",
        "LANGFUSE_INIT_PROJECT_NAME": "Modal PoC Project",
        "LANGFUSE_INIT_USER_NAME": "Modal PoC Admin",
    },
)
class LangfuseWeb:
    proc: subprocess.Popen[Any] | None = None

    @modal.enter()
    def start(self) -> None:
        self.proc = subprocess.Popen(
            [
                "dumb-init",
                "--",
                "./web/entrypoint.sh",
                "node",
                "./web/server.js",
                "--keepAliveTimeout",
                "110000",
            ],
            cwd="/app",
        )

    @modal.exit()
    def stop(self) -> None:
        _stop_process(self.proc)


@app.server(
    image=gateway_image,
    port=GATEWAY_PORT,
    unauthenticated=True,
    routing_region=ROUTING_REGION,
    cpu=1.0,
    memory=1024,
    min_containers=MIN_GATEWAYS,
    max_containers=MAX_GATEWAYS,
    target_concurrency=50,
    max_concurrency=200,
    scaledown_window=180,
    startup_timeout=60,
    exit_grace_period=60,
    secrets=SHARED_SECRETS,
    env={
        "LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS": f"0.0.0.0:{GATEWAY_PORT}",
        "LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS": "15",
        "LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS": "10",
        "LANGFUSE_LOG_LEVEL": "info",
    },
)
class LangfuseAiGateway:
    proc: subprocess.Popen[Any] | None = None

    @modal.enter()
    def start(self) -> None:
        self.proc = subprocess.Popen(["/usr/local/bin/ai-gateway"])

    @modal.exit()
    def stop(self) -> None:
        _stop_process(self.proc, timeout_s=28.0)


@app.server(
    image=worker_image,
    port=WORKER_PORT,
    unauthenticated=False,
    routing_region=ROUTING_REGION,
    cpu=1.0,
    memory=2048,
    min_containers=MIN_WORKERS,
    max_containers=MAX_WORKERS,
    scaledown_window=300,
    startup_timeout=120,
    exit_grace_period=60,
    secrets=SHARED_SECRETS,
    env={
        "PORT": str(WORKER_PORT),
        "TELEMETRY_ENABLED": "false",
        "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES": "false",
    },
)
class LangfuseWorker:
    proc: subprocess.Popen[Any] | None = None

    @modal.enter()
    def start(self) -> None:
        self.proc = subprocess.Popen(
            [
                "dumb-init",
                "--",
                "./worker/entrypoint.sh",
                "node",
                "worker/dist/index.js",
            ],
            cwd="/app",
        )

    @modal.exit()
    def stop(self) -> None:
        _stop_process(self.proc, timeout_s=28.0)
