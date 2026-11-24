#!/usr/bin/env python3
"""Deploy and scale Langfuse + AI Gateway on Modal Servers with an optional DB Sandbox.

Architecture (Option A — scalable Modal Servers + swappable data tier):
  - App tier (`examples/modal/modal_servers.py`, deployed via `modal deploy`):
      * LangfuseWeb       (@app.server, port 3000, autoscales on request concurrency)
      * LangfuseAiGateway (@app.server, port 3031, autoscales on request concurrency)
      * LangfuseWorker    (@app.server, port 3030, private, scaled via min_containers)
      * run_migrations    (@app.function, runs Postgres + ClickHouse migrations once)
  - Data tier (swappable via Modal Secret `langfuse-modal-endpoints`):
      * Default PoC mode: ephemeral `langfuse-db` Modal Sandbox running 4 isolated
        Sidecars (`postgres:17`, `clickhouse-server:26.3.62.3`, `redis:7`,
        `cgr.dev/chainguard/minio`, each with `outbound_cidr_allowlist=[]`) behind
        an `nginx:1-alpine` TCP/HTTP proxy.
      * Production / managed DB mode (`--external-db`): skip the DB Sandbox and
        point `langfuse-modal-endpoints` at managed Postgres, ClickHouse Cloud,
        Redis, and S3/R2 — zero code changes to `modal_servers.py`.

Usage:
    python examples/modal/modal_app.py init-secret
    python examples/modal/modal_app.py up
    python examples/modal/modal_app.py smoke
    python examples/modal/modal_app.py scale --workers 2 --gateways 3
    python examples/modal/modal_app.py status
    python examples/modal/modal_app.py stop
"""

from __future__ import annotations

import argparse
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_APP_NAME = "langfuse-ai-gateway-poc"
DEFAULT_DB_SANDBOX_NAME = "langfuse-db"
DEFAULT_SECRET_NAME = "langfuse-modal-poc"
DEFAULT_ENDPOINTS_SECRET_NAME = "langfuse-modal-endpoints"
DEFAULT_LANGFUSE_TAG = "4"
DEFAULT_TIMEOUT_SECONDS = 2 * 60 * 60  # 2 hours (Modal hard max is 24 hours)
MAX_SANDBOX_TIMEOUT_SECONDS = 24 * 60 * 60
DEFAULT_DB_CPU = 4.0
DEFAULT_DB_MEMORY_MIB = 6144
DEFAULT_RUNTIME = "gvisor"

POSTGRES_PORT = 5432
REDIS_PORT = 6379
CLICKHOUSE_NATIVE_PORT = 9000
CLICKHOUSE_HTTP_PORT = 8123
MINIO_PUBLIC_PORT = 9090

NGINX_IMAGE_URI = "docker.io/library/nginx:1-alpine"
POSTGRES_IMAGE_URI = "docker.io/postgres:17"
CLICKHOUSE_IMAGE_URI = "docker.io/clickhouse/clickhouse-server:26.3.62.3"
REDIS_IMAGE_URI = "docker.io/redis:7"
MINIO_IMAGE_URI = "cgr.dev/chainguard/minio"

SERVERS_MODULE_PATH = Path(__file__).with_name("modal_servers.py")

DEFAULT_INIT_USER_EMAIL = "admin@langfuse-modal-poc.example"

REQUIRED_SECRET_KEYS: tuple[str, ...] = (
    "NEXTAUTH_SECRET",
    "SALT",
    "ENCRYPTION_KEY",
    "POSTGRES_PASSWORD",
    "DATABASE_PASSWORD",
    "CLICKHOUSE_PASSWORD",
    "REDIS_AUTH",
    "MINIO_ROOT_PASSWORD",
    "LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY",
    "LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY",
    "LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY",
    "LANGFUSE_AI_GATEWAY_SERVICE_KEY",
    "LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY",
    "LANGFUSE_AI_GATEWAY_REDIS_AUTH",
    "LANGFUSE_INIT_USER_EMAIL",
    "LANGFUSE_INIT_USER_PASSWORD",
    "LANGFUSE_INIT_PROJECT_PUBLIC_KEY",
    "LANGFUSE_INIT_PROJECT_SECRET_KEY",
)

# Relative memory weights used only when --runtime=vm on the DB Sandbox.
VM_DB_SIDECAR_MEMORY_WEIGHTS: dict[str, int] = {
    "postgres": 1024,
    "clickhouse": 2560,
    "redis": 512,
    "minio": 512,
}
VM_MAIN_MIN_MEMORY_MIB = 512


@dataclass(frozen=True)
class SidecarSpec:
    name: str
    image_uri: str
    command: tuple[str, ...]
    env: dict[str, str]
    outbound_cidr_allowlist: list[str] | None = None
    needs_secret: bool = True


def render_nginx_conf() -> str:
    """Return nginx.conf proxying TCP (Postgres, Redis, ClickHouse native) and HTTP (ClickHouse, MinIO)."""
    return f"""\
worker_processes auto;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;

events {{
    worker_connections 1024;
}}

stream {{
    server {{
        listen {POSTGRES_PORT};
        proxy_pass postgres:{POSTGRES_PORT};
    }}

    server {{
        listen {REDIS_PORT};
        proxy_pass redis:{REDIS_PORT};
    }}

    server {{
        listen {CLICKHOUSE_NATIVE_PORT};
        proxy_pass clickhouse:{CLICKHOUSE_NATIVE_PORT};
    }}
}}

http {{
    access_log off;
    client_max_body_size 0;
    proxy_buffering off;

    server {{
        listen {CLICKHOUSE_HTTP_PORT};
        location / {{
            proxy_pass http://clickhouse:{CLICKHOUSE_HTTP_PORT};
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
    }}

    server {{
        listen {MINIO_PUBLIC_PORT};
        location / {{
            proxy_pass http://minio:9000;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
        }}
    }}
}}
"""


def generate_es256_private_key_pem() -> str:
    """Generate an ES256 (P-256) private key PEM using the local openssl CLI."""
    openssl = shutil.which("openssl")
    if not openssl:
        raise RuntimeError(
            "openssl CLI is required to generate LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY"
        )
    result = subprocess.run(
        [
            openssl,
            "genpkey",
            "-algorithm",
            "EC",
            "-pkeyopt",
            "ec_paramgen_curve:P-256",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    pem = result.stdout.strip()
    if "BEGIN PRIVATE KEY" not in pem:
        raise RuntimeError("openssl did not produce a valid PKCS#8 private key PEM")
    return pem + "\n"


def generate_secret_payload() -> dict[str, str]:
    """Generate fresh random credentials for the Modal Secret (never hardcoded).

    All generated passwords are lowercase hex so they require no URL percent-
    encoding in Prisma (`DATABASE_URL`) or ClickHouse's migration query string.
    """
    postgres_password = secrets.token_hex(24)
    clickhouse_password = secrets.token_hex(24)
    redis_auth = secrets.token_hex(24)
    minio_password = secrets.token_hex(24)

    return {
        "NEXTAUTH_SECRET": secrets.token_hex(32),
        "SALT": secrets.token_hex(32),
        "ENCRYPTION_KEY": secrets.token_hex(32),
        "POSTGRES_PASSWORD": postgres_password,
        "DATABASE_PASSWORD": postgres_password,
        "CLICKHOUSE_PASSWORD": clickhouse_password,
        "REDIS_AUTH": redis_auth,
        "MINIO_ROOT_PASSWORD": minio_password,
        "LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY": minio_password,
        "LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY": minio_password,
        "LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY": minio_password,
        "LANGFUSE_AI_GATEWAY_SERVICE_KEY": secrets.token_hex(32),
        "LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY": generate_es256_private_key_pem(),
        "LANGFUSE_AI_GATEWAY_REDIS_AUTH": redis_auth,
        "LANGFUSE_INIT_USER_EMAIL": DEFAULT_INIT_USER_EMAIL,
        "LANGFUSE_INIT_USER_PASSWORD": f"Lf-{secrets.token_hex(16)}",
        "LANGFUSE_INIT_PROJECT_PUBLIC_KEY": f"pk-lf-{secrets.token_hex(16)}",
        "LANGFUSE_INIT_PROJECT_SECRET_KEY": f"sk-lf-{secrets.token_hex(16)}",
    }


def compute_vm_memory_plan(total_memory_mib: int) -> tuple[int, dict[str, int]]:
    """Compute VM runtime sidecar reserve and per-sidecar memory shares (MiB)."""
    min_total = VM_MAIN_MIN_MEMORY_MIB + 2048
    if total_memory_mib < min_total:
        raise ValueError(
            f"--db-memory must be at least {min_total} MiB when using --runtime=vm"
        )
    reserve_mib = total_memory_mib - VM_MAIN_MIN_MEMORY_MIB
    total_weight = sum(VM_DB_SIDECAR_MEMORY_WEIGHTS.values())
    allocations: dict[str, int] = {}
    remaining = reserve_mib
    names = list(VM_DB_SIDECAR_MEMORY_WEIGHTS.keys())
    for name in names[:-1]:
        share = max(
            256,
            int(reserve_mib * VM_DB_SIDECAR_MEMORY_WEIGHTS[name] / total_weight),
        )
        allocations[name] = share
        remaining -= share
    allocations[names[-1]] = max(256, remaining)
    return reserve_mib, allocations


def build_data_sidecar_specs() -> list[SidecarSpec]:
    """Return Sidecar specs for Postgres, ClickHouse, Redis, and MinIO.

    Data sidecars have `outbound_cidr_allowlist=[]`, blocking outbound internet
    access while keeping host-local bridge communication with the nginx proxy.
    """
    return [
        SidecarSpec(
            name="postgres",
            image_uri=POSTGRES_IMAGE_URI,
            command=("docker-entrypoint.sh", "postgres"),
            env={
                "POSTGRES_USER": "postgres",
                "POSTGRES_DB": "postgres",
                "TZ": "UTC",
                "PGTZ": "UTC",
            },
            outbound_cidr_allowlist=[],
        ),
        SidecarSpec(
            name="clickhouse",
            image_uri=CLICKHOUSE_IMAGE_URI,
            command=("/entrypoint.sh",),
            env={
                "CLICKHOUSE_DB": "default",
                "CLICKHOUSE_USER": "clickhouse",
            },
            outbound_cidr_allowlist=[],
        ),
        SidecarSpec(
            name="redis",
            image_uri=REDIS_IMAGE_URI,
            command=(
                "sh",
                "-c",
                'exec redis-server --requirepass "$REDIS_AUTH" --maxmemory-policy noeviction',
            ),
            env={},
            outbound_cidr_allowlist=[],
        ),
        SidecarSpec(
            name="minio",
            image_uri=MINIO_IMAGE_URI,
            command=(
                "sh",
                "-c",
                'mkdir -p /data/langfuse && exec minio server --address ":9000" --console-address ":9001" /data',
            ),
            env={
                "MINIO_ROOT_USER": "minio",
            },
            outbound_cidr_allowlist=[],
        ),
    ]


def build_db_endpoints_payload(
    *,
    postgres_socket: tuple[str, int],
    redis_socket: tuple[str, int],
    clickhouse_native_socket: tuple[str, int],
    clickhouse_http_url: str,
    minio_url: str,
    web_url: str,
    gateway_url: str,
) -> dict[str, str]:
    """Build the `langfuse-modal-endpoints` Secret payload for the DB Sandbox.

    Keep all host/URL configuration here so swapping to managed Postgres,
    ClickHouse Cloud, Redis, and S3/R2 only replaces this Secret.
    """
    pg_host, pg_port = postgres_socket
    redis_host, redis_port = redis_socket
    ch_host, ch_port = clickhouse_native_socket
    ch_http = clickhouse_http_url.rstrip("/")
    s3_url = minio_url.rstrip("/")
    clean_web_url = web_url.rstrip("/")
    clean_gateway_url = gateway_url.rstrip("/")

    return {
        "DATABASE_HOST": pg_host,
        "DATABASE_PORT": str(pg_port),
        "DATABASE_USERNAME": "postgres",
        "DATABASE_NAME": "postgres",
        "CLICKHOUSE_URL": ch_http,
        "CLICKHOUSE_MIGRATION_URL": f"clickhouse://{ch_host}:{ch_port}",
        "CLICKHOUSE_USER": "clickhouse",
        "CLICKHOUSE_CLUSTER_ENABLED": "false",
        "CLICKHOUSE_CLUSTER_NAME": "default",
        "REDIS_HOST": redis_host,
        "REDIS_PORT": str(redis_port),
        "REDIS_TLS_ENABLED": "false",
        "LANGFUSE_AI_GATEWAY_REDIS_URL": f"redis://{redis_host}:{redis_port}",
        "LANGFUSE_S3_EVENT_UPLOAD_BUCKET": "langfuse",
        "LANGFUSE_S3_EVENT_UPLOAD_REGION": "auto",
        "LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT": s3_url,
        "LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE": "true",
        "LANGFUSE_S3_EVENT_UPLOAD_PREFIX": "events/",
        "LANGFUSE_S3_MEDIA_UPLOAD_BUCKET": "langfuse",
        "LANGFUSE_S3_MEDIA_UPLOAD_REGION": "auto",
        "LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT": s3_url,
        "LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT": s3_url,
        "LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE": "true",
        "LANGFUSE_S3_MEDIA_UPLOAD_PREFIX": "media/",
        "LANGFUSE_S3_BATCH_EXPORT_ENABLED": "false",
        "LANGFUSE_S3_BATCH_EXPORT_BUCKET": "langfuse",
        "LANGFUSE_S3_BATCH_EXPORT_PREFIX": "exports/",
        "LANGFUSE_S3_BATCH_EXPORT_REGION": "auto",
        "LANGFUSE_S3_BATCH_EXPORT_ENDPOINT": s3_url,
        "LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT": s3_url,
        "LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE": "true",
        "NEXTAUTH_URL": clean_web_url,
        "LANGFUSE_AI_GATEWAY_PUBLIC_URL": clean_gateway_url,
        "LANGFUSE_AI_GATEWAY_WEB_URL": clean_web_url,
    }


def has_modal_credentials() -> bool:
    """Check whether Modal auth env vars or ~/.modal.toml exist."""
    if os.environ.get("MODAL_TOKEN_ID") and os.environ.get("MODAL_TOKEN_SECRET"):
        return True
    modal_config = Path.home() / ".modal.toml"
    return modal_config.is_file() and modal_config.stat().st_size > 0


def require_modal() -> Any:
    """Import modal and verify credentials are configured before making API calls."""
    try:
        import modal  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit(
            "Error: the 'modal' Python package is not installed.\n"
            "Install it with: pip install -r examples/modal/requirements.txt"
        ) from exc

    if not has_modal_credentials():
        raise SystemExit(
            "Error: Modal credentials are missing.\n"
            "Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in your environment "
            "(or run `modal setup`)."
        )
    return modal


def _modal_cli_cmd(*args: str) -> list[str]:
    """Return a command list invoking the modal CLI from the active Python env."""
    sibling = Path(sys.executable).with_name("modal")
    if sibling.is_file():
        return [str(sibling), *args]
    found = shutil.which("modal")
    if found:
        return [found, *args]
    return [sys.executable, "-m", "modal", *args]


def _upsert_modal_secret(modal: Any, name: str, payload: dict[str, str]) -> None:
    """Create or replace a named Modal Secret without printing its values."""
    try:
        modal.Secret.objects.delete(name)
    except Exception:  # noqa: BLE001
        pass
    modal.Secret.objects.create(name, payload, allow_existing=False)


def _wait_for_exec(
    target: Any,
    cmd: tuple[str, ...],
    *,
    label: str,
    timeout_s: float = 180.0,
    interval_s: float = 2.0,
) -> None:
    """Poll a readiness command inside a Sandbox or Sidecar until exit code 0."""
    deadline = time.monotonic() + timeout_s
    last_err = ""
    while time.monotonic() < deadline:
        try:
            proc = target.exec(*cmd, timeout=15)
            rc = proc.wait()
            if rc == 0:
                print(f"  [ok] {label} is ready")
                return
            stderr = proc.stderr.read().strip()
            stdout = proc.stdout.read().strip()
            last_err = stderr or stdout or f"exit code {rc}"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
        time.sleep(interval_s)
    raise TimeoutError(
        f"Timed out waiting for {label} after {timeout_s:.0f}s (last error: {last_err})"
    )


def _http_get(url: str, timeout_s: float = 15.0) -> tuple[int, str]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError(f"Unsupported URL for HTTP check: {url!r}")
    import requests  # type: ignore[import-untyped]

    resp = requests.get(url, timeout=timeout_s)
    return resp.status_code, resp.text.strip()


def _wait_for_http(
    url: str,
    *,
    label: str,
    timeout_s: float = 240.0,
    interval_s: float = 3.0,
) -> None:
    """Poll an HTTPS endpoint until it returns HTTP 200."""
    deadline = time.monotonic() + timeout_s
    last_err = ""
    while time.monotonic() < deadline:
        try:
            status, body = _http_get(url, timeout_s=15.0)
            if status == 200:
                print(f"  [ok] {label} is ready ({url})")
                return
            last_err = f"HTTP {status}: {body[:120]}"
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
        time.sleep(interval_s)
    raise TimeoutError(
        f"Timed out waiting for {label} ({url}) after {timeout_s:.0f}s (last error: {last_err})"
    )


def _create_sidecar(
    sandbox: Any,
    spec: SidecarSpec,
    built_image: Any,
    app_secret: Any,
    *,
    vm_memory_mib: int | None = None,
) -> Any:
    kwargs: dict[str, Any] = {
        "name": spec.name,
        "image": built_image,
        "env": spec.env,
    }
    if spec.needs_secret:
        kwargs["secrets"] = [app_secret]
    if spec.outbound_cidr_allowlist is not None:
        kwargs["outbound_cidr_allowlist"] = spec.outbound_cidr_allowlist
    if vm_memory_mib is not None:
        kwargs["experimental_memory_reserve_consume_mib"] = vm_memory_mib
    return sandbox._experimental_sidecars.create(*spec.command, **kwargs)


def _extract_db_tunnel_endpoints(sandbox: Any) -> dict[str, Any]:
    tunnels = sandbox.tunnels()
    return {
        "postgres_socket": tunnels[POSTGRES_PORT].tcp_socket,
        "redis_socket": tunnels[REDIS_PORT].tcp_socket,
        "clickhouse_native_socket": tunnels[CLICKHOUSE_NATIVE_PORT].tcp_socket,
        "clickhouse_http_url": tunnels[CLICKHOUSE_HTTP_PORT].url.rstrip("/"),
        "minio_url": tunnels[MINIO_PUBLIC_PORT].url.rstrip("/"),
    }


def _start_db_sandbox(
    modal: Any,
    *,
    app_name: str,
    sandbox_name: str,
    secret_name: str,
    cpu: float,
    memory: int,
    runtime: str,
    timeout: int,
    idle_timeout: int | None,
    keep_on_error: bool,
) -> tuple[Any, dict[str, Any]]:
    app = modal.App.lookup(app_name, create_if_missing=True)
    app_secret = modal.Secret.from_name(
        secret_name,
        required_keys=list(REQUIRED_SECRET_KEYS),
    )

    nginx_cmd = f"cat <<'EOF' > /etc/nginx/nginx.conf\n{render_nginx_conf()}EOF"
    nginx_image = (
        modal.Image.from_registry(NGINX_IMAGE_URI)
        .entrypoint([])
        .run_commands(nginx_cmd)
    )

    data_specs = build_data_sidecar_specs()
    built_images: dict[str, Any] = {}

    print(f"Pulling/caching {len(data_specs) + 1} DB-tier images on Modal...")
    with modal.enable_output():
        nginx_image = nginx_image.build(app)
        for spec in data_specs:
            built_images[spec.image_uri] = (
                modal.Image.from_registry(spec.image_uri).entrypoint([]).build(app)
            )

    sandbox_kwargs: dict[str, Any] = {
        "app": app,
        "name": sandbox_name,
        "image": nginx_image,
        "cpu": cpu,
        "memory": memory,
        "runtime": runtime,
        "timeout": timeout,
        "encrypted_ports": [CLICKHOUSE_HTTP_PORT, MINIO_PUBLIC_PORT],
        "unencrypted_ports": [POSTGRES_PORT, REDIS_PORT, CLICKHOUSE_NATIVE_PORT],
    }
    if idle_timeout is not None:
        sandbox_kwargs["idle_timeout"] = idle_timeout

    vm_allocations: dict[str, int] = {}
    if runtime == "vm":
        reserve_mib, vm_allocations = compute_vm_memory_plan(memory)
        sandbox_kwargs["experimental_options"] = {
            "vm_sidecar_memory_reserve_mib": reserve_mib
        }

    print(
        f"Starting ephemeral DB Sandbox '{sandbox_name}' "
        f"(runtime={runtime}, cpu={cpu}, memory={memory} MiB, timeout={timeout}s)..."
    )
    # Wait until the 4 Sidecars are created and written into /etc/hosts before
    # starting nginx so upstream hostnames resolve at nginx startup.
    sandbox = modal.Sandbox.create(
        "sh",
        "-c",
        'while [ ! -f /tmp/start-nginx ]; do sleep 0.2; done; exec nginx -g "daemon off;"',
        **sandbox_kwargs,
    )

    try:
        endpoints = _extract_db_tunnel_endpoints(sandbox)
        print(f"DB Sandbox ID: {sandbox.object_id}")

        print("Starting 4 data Sidecars (postgres, clickhouse, redis, minio)...")
        data_handles: dict[str, Any] = {}
        for spec in data_specs:
            data_handles[spec.name] = _create_sidecar(
                sandbox,
                spec,
                built_images[spec.image_uri],
                app_secret,
                vm_memory_mib=vm_allocations.get(spec.name),
            )

        print("Waiting for data Sidecars to pass health checks...")
        _wait_for_exec(
            data_handles["postgres"],
            ("pg_isready", "-U", "postgres"),
            label="postgres",
            timeout_s=120,
        )
        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", "http://clickhouse:8123/ping"),
            label="clickhouse",
            timeout_s=120,
        )
        _wait_for_exec(
            data_handles["redis"],
            ("sh", "-c", 'redis-cli -a "$REDIS_AUTH" --no-auth-warning ping | grep -q PONG'),
            label="redis",
            timeout_s=90,
        )
        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", "http://minio:9000/minio/health/live"),
            label="minio",
            timeout_s=90,
        )

        # Sidecars are now in /etc/hosts; signal nginx to start proxying.
        proc = sandbox.exec("touch", "/tmp/start-nginx", timeout=15)
        if proc.wait() != 0:
            raise RuntimeError("Failed to trigger nginx proxy startup in DB Sandbox")

        _wait_for_http(
            f"{endpoints['clickhouse_http_url']}/ping",
            label="DB proxy -> clickhouse",
            timeout_s=60,
            interval_s=1.0,
        )
        _wait_for_http(
            f"{endpoints['minio_url']}/minio/health/live",
            label="DB proxy -> minio",
            timeout_s=60,
            interval_s=1.0,
        )
    except Exception:
        if not keep_on_error:
            print(
                f"DB Sandbox startup failed; terminating {sandbox.object_id} "
                "(pass --keep-on-error to keep it running for debugging).",
                file=sys.stderr,
            )
            sandbox.terminate(wait=True)
        raise

    sandbox.detach()
    return sandbox, endpoints


def _deploy_servers(
    *,
    app_name: str,
    secret_name: str,
    endpoints_secret_name: str,
    langfuse_tag: str,
    gateway_tag: str | None,
    routing_region: str,
    min_web: int,
    max_web: int,
    min_workers: int,
    max_workers: int,
    min_gateways: int,
    max_gateways: int,
) -> None:
    env = os.environ.copy()
    env.update(
        {
            "LANGFUSE_MODAL_APP_NAME": app_name,
            "LANGFUSE_MODAL_SECRET_NAME": secret_name,
            "LANGFUSE_MODAL_ENDPOINTS_SECRET_NAME": endpoints_secret_name,
            "LANGFUSE_MODAL_TAG": langfuse_tag,
            "LANGFUSE_MODAL_GATEWAY_TAG": gateway_tag or langfuse_tag,
            "LANGFUSE_MODAL_ROUTING_REGION": routing_region,
            "LANGFUSE_MODAL_MIN_WEB": str(min_web),
            "LANGFUSE_MODAL_MAX_WEB": str(max_web),
            "LANGFUSE_MODAL_MIN_WORKERS": str(min_workers),
            "LANGFUSE_MODAL_MAX_WORKERS": str(max_workers),
            "LANGFUSE_MODAL_MIN_GATEWAYS": str(min_gateways),
            "LANGFUSE_MODAL_MAX_GATEWAYS": str(max_gateways),
        }
    )
    cmd = _modal_cli_cmd("deploy", str(SERVERS_MODULE_PATH))
    subprocess.run(cmd, env=env, check=True)


def _lookup_server_urls(modal: Any, app_name: str) -> tuple[str, str]:
    web_server = modal.Server.from_name(app_name, "LangfuseWeb")
    gw_server = modal.Server.from_name(app_name, "LangfuseAiGateway")
    web_url = web_server.get_url()
    gateway_url = gw_server.get_url()
    if not web_url or not gateway_url:
        raise RuntimeError(
            "Modal did not return URLs for LangfuseWeb / LangfuseAiGateway."
        )
    return web_url.rstrip("/"), gateway_url.rstrip("/")


def cmd_init_secret(args: argparse.Namespace) -> int:
    modal = require_modal()
    payload = generate_secret_payload()
    if args.force:
        try:
            modal.Secret.objects.delete(args.secret_name)
            print(f"Deleted existing Modal Secret '{args.secret_name}'.")
        except Exception:  # noqa: BLE001
            pass

    modal.Secret.objects.create(
        args.secret_name,
        payload,
        allow_existing=not args.force,
    )
    print(
        f"Modal Secret '{args.secret_name}' is ready with {len(payload)} keys "
        "(values are stored in Modal and not printed)."
    )
    return 0


def cmd_db_up(args: argparse.Namespace) -> int:
    if not (60 <= args.timeout <= MAX_SANDBOX_TIMEOUT_SECONDS):
        raise SystemExit(
            f"Error: --timeout must be between 60 and {MAX_SANDBOX_TIMEOUT_SECONDS} seconds (24h Modal limit)."
        )
    modal = require_modal()
    sandbox, endpoints = _start_db_sandbox(
        modal,
        app_name=args.app_name,
        sandbox_name=args.db_sandbox_name,
        secret_name=args.secret_name,
        cpu=args.db_cpu,
        memory=args.db_memory,
        runtime=args.runtime,
        timeout=args.timeout,
        idle_timeout=args.idle_timeout,
        keep_on_error=args.keep_on_error,
    )
    # Preserve deployed Server URLs if the App already exists.
    web_url = "https://placeholder.modal.run"
    gateway_url = "https://placeholder.modal.run"
    try:
        web_url, gateway_url = _lookup_server_urls(modal, args.app_name)
    except Exception:  # noqa: BLE001
        pass

    endpoints_payload = build_db_endpoints_payload(
        **endpoints,
        web_url=web_url,
        gateway_url=gateway_url,
    )
    _upsert_modal_secret(modal, args.endpoints_secret_name, endpoints_payload)
    print(
        f"Updated Modal Secret '{args.endpoints_secret_name}' with DB Sandbox '{sandbox.object_id}' endpoints."
    )
    return 0


def cmd_up(args: argparse.Namespace) -> int:
    if not args.external_db and not (60 <= args.timeout <= MAX_SANDBOX_TIMEOUT_SECONDS):
        raise SystemExit(
            f"Error: --timeout must be between 60 and {MAX_SANDBOX_TIMEOUT_SECONDS} seconds (24h Modal limit)."
        )

    modal = require_modal()

    if args.auto_init_secret:
        payload = generate_secret_payload()
        modal.Secret.objects.create(args.secret_name, payload, allow_existing=True)

    db_sandbox = None
    db_endpoints: dict[str, Any] | None = None

    if not args.external_db:
        if args.reuse_db:
            db_sandbox = modal.Sandbox.from_name(args.app_name, args.db_sandbox_name)
            db_endpoints = _extract_db_tunnel_endpoints(db_sandbox)
            print(
                f"Reusing existing DB Sandbox '{args.db_sandbox_name}' ({db_sandbox.object_id}).",
                flush=True,
            )
        else:
            db_sandbox, db_endpoints = _start_db_sandbox(
                modal,
                app_name=args.app_name,
                sandbox_name=args.db_sandbox_name,
                secret_name=args.secret_name,
                cpu=args.db_cpu,
                memory=args.db_memory,
                runtime=args.runtime,
                timeout=args.timeout,
                idle_timeout=args.idle_timeout,
                keep_on_error=args.keep_on_error,
            )

        # If the App was already deployed previously, reuse its stable Server URLs
        # so we only need to write `langfuse-modal-endpoints` once.
        existing_urls: tuple[str, str] | None = None
        try:
            existing_urls = _lookup_server_urls(modal, args.app_name)
        except Exception:  # noqa: BLE001
            existing_urls = None

        seed_web_url, seed_gw_url = existing_urls or (
            "https://placeholder.modal.run",
            "https://placeholder.modal.run",
        )
        seed_payload = build_db_endpoints_payload(
            **db_endpoints,
            web_url=seed_web_url,
            gateway_url=seed_gw_url,
        )
        _upsert_modal_secret(modal, args.endpoints_secret_name, seed_payload)

    print("Registering Modal App (scale=0 while running migrations)...", flush=True)
    _deploy_servers(
        app_name=args.app_name,
        secret_name=args.secret_name,
        endpoints_secret_name=args.endpoints_secret_name,
        langfuse_tag=args.langfuse_tag,
        gateway_tag=args.gateway_tag,
        routing_region=args.routing_region,
        min_web=0,
        max_web=args.max_web,
        min_workers=0,
        max_workers=args.max_workers,
        min_gateways=0,
        max_gateways=args.max_gateways,
    )

    web_url, gateway_url = _lookup_server_urls(modal, args.app_name)
    print(f"Langfuse UI Server URL: {web_url}", flush=True)
    print(f"AI Gateway Server URL:  {gateway_url}", flush=True)

    if db_endpoints is not None and (web_url, gateway_url) != (seed_web_url, seed_gw_url):
        live_payload = build_db_endpoints_payload(
            **db_endpoints,
            web_url=web_url,
            gateway_url=gateway_url,
        )
        _upsert_modal_secret(modal, args.endpoints_secret_name, live_payload)
        # Rebind deployed Functions/Servers to the newly created Secret object ID
        # before invoking `run_migrations`.
        _deploy_servers(
            app_name=args.app_name,
            secret_name=args.secret_name,
            endpoints_secret_name=args.endpoints_secret_name,
            langfuse_tag=args.langfuse_tag,
            gateway_tag=args.gateway_tag,
            routing_region=args.routing_region,
            min_web=0,
            max_web=args.max_web,
            min_workers=0,
            max_workers=args.max_workers,
            min_gateways=0,
            max_gateways=args.max_gateways,
        )

    if not args.skip_migrations:
        print(
            "Running Postgres + ClickHouse migrations via Modal Function `run_migrations`...",
            flush=True,
        )
        migrate_fn = modal.Function.from_name(args.app_name, "run_migrations")
        migrate_fn.remote()
        print("  [ok] migrations complete", flush=True)

    print(
        f"Deploying live Modal Servers "
        f"(web={args.web}..{args.max_web}, workers={args.workers}..{args.max_workers}, "
        f"gateways={args.gateways}..{args.max_gateways})..."
    )
    _deploy_servers(
        app_name=args.app_name,
        secret_name=args.secret_name,
        endpoints_secret_name=args.endpoints_secret_name,
        langfuse_tag=args.langfuse_tag,
        gateway_tag=args.gateway_tag,
        routing_region=args.routing_region,
        min_web=args.web,
        max_web=args.max_web,
        min_workers=args.workers,
        max_workers=args.max_workers,
        min_gateways=args.gateways,
        max_gateways=args.max_gateways,
    )

    print("Waiting for Modal Servers to respond...")
    _wait_for_http(f"{web_url}/api/public/health", label="LangfuseWeb", timeout_s=240)
    _wait_for_http(f"{gateway_url}/ready", label="LangfuseAiGateway (/ready)", timeout_s=180)

    print("\nStack is live:")
    print(f"  Langfuse UI:  {web_url}")
    print(f"  AI Gateway:   {gateway_url}")
    if db_sandbox is not None and db_endpoints is not None:
        print(f"  MinIO S3:     {db_endpoints['minio_url']}")
        print(f"  DB Sandbox:   {db_sandbox.object_id}")
    else:
        print(f"  Data tier:    external managed DBs (Secret '{args.endpoints_secret_name}')")

    print(
        "\nRead the pre-provisioned Langfuse login credentials from the Modal Secret:\n"
        f"  modal shell --secret {args.secret_name} --no-pty -c "
        '\'printf "Email: %s\\nPassword: %s\\n" "$LANGFUSE_INIT_USER_EMAIL" "$LANGFUSE_INIT_USER_PASSWORD"\''
    )
    print(
        "\nScale replicas live (no redeploy needed):\n"
        f"  python examples/modal/modal_app.py scale --app-name {args.app_name} --workers 2 --gateways 3"
    )
    print(
        "\nStop everything when finished:\n"
        f"  python examples/modal/modal_app.py stop --app-name {args.app_name} --db-sandbox-name {args.db_sandbox_name}"
    )
    return 0


def cmd_scale(args: argparse.Namespace) -> int:
    modal = require_modal()
    targets = [
        ("LangfuseWeb", args.web, args.max_web, args.web_target_concurrency),
        ("LangfuseWorker", args.workers, args.max_workers, None),
        ("LangfuseAiGateway", args.gateways, args.max_gateways, args.gateway_target_concurrency),
    ]
    updated = 0
    for server_name, min_c, max_c, target_c in targets:
        kwargs: dict[str, Any] = {}
        if min_c is not None:
            kwargs["min_containers"] = min_c
        if max_c is not None:
            kwargs["max_containers"] = max_c
        if target_c is not None:
            kwargs["target_concurrency"] = target_c
        if not kwargs:
            continue
        server = modal.Server.from_name(args.app_name, server_name)
        settings = server.autoscaler.update(**kwargs)
        print(f"[ok] {server_name}: {settings}")
        updated += 1

    if updated == 0:
        raise SystemExit(
            "Pass at least one of --web, --workers, --gateways, --max-web, --max-workers, --max-gateways."
        )
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    modal = require_modal()
    web_url, gateway_url = _lookup_server_urls(modal, args.app_name)
    print(f"Modal App:    {args.app_name}")
    print(f"Langfuse UI:  {web_url}")
    print(f"AI Gateway:   {gateway_url}")
    for server_name in ("LangfuseWeb", "LangfuseAiGateway", "LangfuseWorker"):
        server = modal.Server.from_name(args.app_name, server_name)
        settings = server.autoscaler.settings()
        print(
            f"  - {server_name}: min={settings.min_containers} max={settings.max_containers} "
            f"target_concurrency={settings.target_concurrency}"
        )

    try:
        db_sb = modal.Sandbox.from_name(args.app_name, args.db_sandbox_name)
        endpoints = _extract_db_tunnel_endpoints(db_sb)
        sidecars = db_sb._experimental_sidecars.list()
        print(f"DB Sandbox:   {db_sb.object_id} (MinIO: {endpoints['minio_url']})")
        print(f"DB Sidecars ({len(sidecars)}):")
        for sc in sidecars:
            print(f"  - {sc.name}: {sc.object_id}")
    except Exception:  # noqa: BLE001
        print("DB Sandbox:   none running (using external managed DBs or stopped)")
    return 0


def cmd_smoke(args: argparse.Namespace) -> int:
    modal = require_modal()
    web_url, gateway_url = _lookup_server_urls(modal, args.app_name)

    checks = [
        ("Langfuse Web health", f"{web_url}/api/public/health"),
        ("Langfuse Web UI", f"{web_url}/auth/sign-in"),
        ("AI Gateway liveness", f"{gateway_url}/health"),
        ("AI Gateway readiness", f"{gateway_url}/ready"),
    ]

    try:
        db_sb = modal.Sandbox.from_name(args.app_name, args.db_sandbox_name)
        endpoints = _extract_db_tunnel_endpoints(db_sb)
        checks.append(("DB Sandbox ClickHouse", f"{endpoints['clickhouse_http_url']}/ping"))
        checks.append(("DB Sandbox MinIO", f"{endpoints['minio_url']}/minio/health/live"))
    except Exception:  # noqa: BLE001
        pass

    failed = False
    for label, url in checks:
        status, body = _http_get(url)
        marker = "OK" if status == 200 else "FAIL"
        preview = body.replace("\n", " ")[:160]
        print(f"[{marker}] {label}: HTTP {status} ({url}) -> {preview}")
        if status != 200:
            failed = True

    return 1 if failed else 0


def cmd_stop(args: argparse.Namespace) -> int:
    modal = require_modal()

    if not args.db_only:
        print(f"Stopping deployed Modal App '{args.app_name}'...")
        res = subprocess.run(
            _modal_cli_cmd("app", "stop", "-y", args.app_name),
            check=False,
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            print(f"Stopped Modal App '{args.app_name}'.")
        else:
            msg = (res.stderr or res.stdout).strip()
            print(f"Note: `modal app stop {args.app_name}` returned {res.returncode}: {msg}")

    if not args.app_only:
        try:
            db_sb = modal.Sandbox.from_name(args.app_name, args.db_sandbox_name)
            print(f"Terminating DB Sandbox '{args.db_sandbox_name}' ({db_sb.object_id})...")
            db_sb.terminate(wait=True)
            print("Terminated DB Sandbox.")
        except Exception:  # noqa: BLE001
            print(f"No running DB Sandbox '{args.db_sandbox_name}' found.")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deploy scalable Langfuse + AI Gateway Modal Servers with an optional DB Sandbox."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_secret = sub.add_parser(
        "init-secret",
        help="Generate random credentials and store them in a Modal Secret.",
    )
    p_secret.add_argument("--secret-name", default=DEFAULT_SECRET_NAME)
    p_secret.add_argument(
        "--force",
        action="store_true",
        help="Delete and recreate the Modal Secret if it already exists.",
    )
    p_secret.set_defaults(func=cmd_init_secret)

    p_db = sub.add_parser(
        "db-up",
        help="Start only the ephemeral DB Sandbox (4 data Sidecars) and update the endpoints Secret.",
    )
    p_db.add_argument("--app-name", default=DEFAULT_APP_NAME)
    p_db.add_argument("--db-sandbox-name", default=DEFAULT_DB_SANDBOX_NAME)
    p_db.add_argument("--secret-name", default=DEFAULT_SECRET_NAME)
    p_db.add_argument("--endpoints-secret-name", default=DEFAULT_ENDPOINTS_SECRET_NAME)
    p_db.add_argument("--db-cpu", type=float, default=DEFAULT_DB_CPU)
    p_db.add_argument("--db-memory", type=int, default=DEFAULT_DB_MEMORY_MIB)
    p_db.add_argument("--runtime", choices=("gvisor", "vm"), default=DEFAULT_RUNTIME)
    p_db.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    p_db.add_argument("--idle-timeout", type=int, default=None)
    p_db.add_argument("--keep-on-error", action="store_true")
    p_db.set_defaults(func=cmd_db_up)

    p_up = sub.add_parser(
        "up",
        help="Start the optional DB Sandbox, run migrations, and deploy scalable Modal Servers.",
    )
    p_up.add_argument("--app-name", default=DEFAULT_APP_NAME)
    p_up.add_argument("--db-sandbox-name", default=DEFAULT_DB_SANDBOX_NAME)
    p_up.add_argument("--secret-name", default=DEFAULT_SECRET_NAME)
    p_up.add_argument("--endpoints-secret-name", default=DEFAULT_ENDPOINTS_SECRET_NAME)
    p_up.add_argument(
        "--auto-init-secret",
        action="store_true",
        help="Create the credentials Modal Secret automatically if it does not exist yet.",
    )
    p_up.add_argument(
        "--external-db",
        action="store_true",
        help="Skip the ephemeral DB Sandbox and use pre-configured external DBs in --endpoints-secret-name.",
    )
    p_up.add_argument(
        "--reuse-db",
        action="store_true",
        help="Reuse an already-running ephemeral DB Sandbox instead of creating a new one.",
    )
    p_up.add_argument("--skip-migrations", action="store_true")
    p_up.add_argument("--langfuse-tag", default=DEFAULT_LANGFUSE_TAG)
    p_up.add_argument("--gateway-tag", default=None)
    p_up.add_argument("--routing-region", default="us-east")
    p_up.add_argument("--web", type=int, default=1, help="Min containers for LangfuseWeb.")
    p_up.add_argument("--max-web", type=int, default=4, help="Max containers for LangfuseWeb.")
    p_up.add_argument("--workers", type=int, default=1, help="Min containers for LangfuseWorker.")
    p_up.add_argument("--max-workers", type=int, default=4, help="Max containers for LangfuseWorker.")
    p_up.add_argument("--gateways", type=int, default=1, help="Min containers for LangfuseAiGateway.")
    p_up.add_argument("--max-gateways", type=int, default=10, help="Max containers for LangfuseAiGateway.")
    p_up.add_argument("--db-cpu", type=float, default=DEFAULT_DB_CPU)
    p_up.add_argument("--db-memory", type=int, default=DEFAULT_DB_MEMORY_MIB)
    p_up.add_argument("--runtime", choices=("gvisor", "vm"), default=DEFAULT_RUNTIME)
    p_up.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    p_up.add_argument("--idle-timeout", type=int, default=None)
    p_up.add_argument("--keep-on-error", action="store_true")
    p_up.set_defaults(func=cmd_up)

    p_scale = sub.add_parser(
        "scale",
        help="Live-adjust min/max replicas on deployed Modal Servers without redeploying.",
    )
    p_scale.add_argument("--app-name", default=DEFAULT_APP_NAME)
    p_scale.add_argument("--web", type=int, default=None)
    p_scale.add_argument("--max-web", type=int, default=None)
    p_scale.add_argument("--web-target-concurrency", type=float, default=None)
    p_scale.add_argument("--workers", type=int, default=None)
    p_scale.add_argument("--max-workers", type=int, default=None)
    p_scale.add_argument("--gateways", type=int, default=None)
    p_scale.add_argument("--max-gateways", type=int, default=None)
    p_scale.add_argument("--gateway-target-concurrency", type=float, default=None)
    p_scale.set_defaults(func=cmd_scale)

    for cmd_name, help_text, handler in (
        ("status", "Show deployed Modal Server URLs, scaling settings, and DB Sandbox status.", cmd_status),
        ("smoke", "Verify public HTTPS health endpoints and gateway readiness.", cmd_smoke),
    ):
        p = sub.add_parser(cmd_name, help=help_text)
        p.add_argument("--app-name", default=DEFAULT_APP_NAME)
        p.add_argument("--db-sandbox-name", default=DEFAULT_DB_SANDBOX_NAME)
        p.set_defaults(func=handler)

    p_stop = sub.add_parser(
        "stop",
        help="Stop the deployed Modal App and terminate the ephemeral DB Sandbox.",
    )
    p_stop.add_argument("--app-name", default=DEFAULT_APP_NAME)
    p_stop.add_argument("--db-sandbox-name", default=DEFAULT_DB_SANDBOX_NAME)
    p_stop.add_argument("--db-only", action="store_true", help="Terminate only the DB Sandbox.")
    p_stop.add_argument("--app-only", action="store_true", help="Stop only the Modal App Servers.")
    p_stop.set_defaults(func=cmd_stop)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
