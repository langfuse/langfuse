#!/usr/bin/env python3
"""Ephemeral all-in-one Langfuse + AI Gateway PoC on a single Modal Sandbox.

Runs a lightweight Caddy reverse proxy as the main Modal Sandbox container (exposing
Langfuse UI, AI Gateway, and MinIO over Modal encrypted tunnels) alongside 7 isolated
Sandbox Sidecars from published container registries:

  - postgres        (docker.io/postgres:17)
  - clickhouse      (docker.io/clickhouse/clickhouse-server:26.3.62.3)
  - redis           (docker.io/redis:7)
  - minio           (cgr.dev/chainguard/minio)
  - web             (docker.langfuse.com/langfuse/langfuse:<tag>)
  - worker          (docker.langfuse.com/langfuse/langfuse-worker:<tag>)
  - ai-gateway      (docker.langfuse.com/langfuse/ai-gateway:<tag>)

Usage:
    python examples/modal/modal_app.py init-secret
    python examples/modal/modal_app.py up
    python examples/modal/modal_app.py status
    python examples/modal/modal_app.py smoke
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
DEFAULT_SANDBOX_NAME = "langfuse-stack"
DEFAULT_SECRET_NAME = "langfuse-modal-poc"
DEFAULT_LANGFUSE_TAG = "4"
DEFAULT_TIMEOUT_SECONDS = 2 * 60 * 60  # 2 hours (Modal hard max is 24 hours)
MAX_SANDBOX_TIMEOUT_SECONDS = 24 * 60 * 60
DEFAULT_CPU = 4.0
DEFAULT_MEMORY_MIB = 8192
DEFAULT_RUNTIME = "gvisor"

WEB_PORT = 3000
WORKER_PORT = 3030
GATEWAY_PORT = 3031
MINIO_PUBLIC_PORT = 9090

CADDY_IMAGE_URI = "docker.io/library/caddy:2-alpine"
POSTGRES_IMAGE_URI = "docker.io/postgres:17"
CLICKHOUSE_IMAGE_URI = "docker.io/clickhouse/clickhouse-server:26.3.62.3"
REDIS_IMAGE_URI = "docker.io/redis:7"
MINIO_IMAGE_URI = "cgr.dev/chainguard/minio"

REQUIRED_SECRET_KEYS: tuple[str, ...] = (
    "NEXTAUTH_SECRET",
    "SALT",
    "ENCRYPTION_KEY",
    "POSTGRES_PASSWORD",
    "DATABASE_URL",
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

DEFAULT_INIT_ORG_ID = "modal-poc-org"
DEFAULT_INIT_ORG_NAME = "Modal PoC Org"
DEFAULT_INIT_PROJECT_ID = "modal-poc-project"
DEFAULT_INIT_PROJECT_NAME = "Modal PoC Project"
DEFAULT_INIT_USER_EMAIL = "admin@langfuse-modal-poc.example"
DEFAULT_INIT_USER_NAME = "Modal PoC Admin"

# Relative memory weights used only when --runtime=vm (Modal's VM runtime carves
# an explicit memory reserve out of the main Sandbox VM for Sidecars).
VM_SIDECAR_MEMORY_WEIGHTS: dict[str, int] = {
    "postgres": 1024,
    "clickhouse": 2560,
    "redis": 512,
    "minio": 512,
    "web": 2048,
    "worker": 1536,
    "ai-gateway": 1024,
}
VM_MAIN_MIN_MEMORY_MIB = 1024


@dataclass(frozen=True)
class SidecarSpec:
    name: str
    image_uri: str
    command: tuple[str, ...]
    env: dict[str, str]
    outbound_cidr_allowlist: list[str] | None = None
    needs_secret: bool = True


def render_caddyfile() -> str:
    """Return the Caddyfile for the main Sandbox reverse proxy.

    Modal's encrypted tunnels terminate TLS at L4 and forward plain HTTP to the
    Sandbox ports. `X-Forwarded-Proto: https` ensures NextAuth sets secure
    cookies and matches `NEXTAUTH_URL`, while `flush_interval -1` disables
    buffering for SSE streams from the AI gateway and Next.js.
    """
    return f"""\
{{
    admin off
    auto_https off
}}

:{WEB_PORT} {{
    reverse_proxy http://web:{WEB_PORT} {{
        flush_interval -1
        header_up X-Forwarded-Proto https
    }}
}}

:{GATEWAY_PORT} {{
    reverse_proxy http://ai-gateway:{GATEWAY_PORT} {{
        flush_interval -1
    }}
}}

:{MINIO_PUBLIC_PORT} {{
    reverse_proxy http://minio:9000
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
        "DATABASE_URL": f"postgresql://postgres:{postgres_password}@postgres:5432/postgres",
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
            f"--memory must be at least {min_total} MiB when using --runtime=vm"
        )
    reserve_mib = total_memory_mib - VM_MAIN_MIN_MEMORY_MIB
    total_weight = sum(VM_SIDECAR_MEMORY_WEIGHTS.values())
    allocations: dict[str, int] = {}
    remaining = reserve_mib
    names = list(VM_SIDECAR_MEMORY_WEIGHTS.keys())
    for name in names[:-1]:
        share = max(256, int(reserve_mib * VM_SIDECAR_MEMORY_WEIGHTS[name] / total_weight))
        allocations[name] = share
        remaining -= share
    allocations[names[-1]] = max(256, remaining)
    return reserve_mib, allocations


def build_data_sidecar_specs() -> list[SidecarSpec]:
    """Return Sidecar specs for Postgres, ClickHouse, Redis, and MinIO.

    Data sidecars have `outbound_cidr_allowlist=[]`, blocking outbound internet
    access while keeping host-local bridge communication with sibling containers.
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


def build_shared_langfuse_env(web_url: str, minio_url: str) -> dict[str, str]:
    """Non-secret env vars shared by langfuse-web and langfuse-worker."""
    return {
        "NEXTAUTH_URL": web_url,
        "TELEMETRY_ENABLED": "false",
        "LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES": "false",
        "CLICKHOUSE_MIGRATION_URL": "clickhouse://clickhouse:9000",
        "CLICKHOUSE_URL": "http://clickhouse:8123",
        "CLICKHOUSE_USER": "clickhouse",
        "CLICKHOUSE_CLUSTER_ENABLED": "false",
        "CLICKHOUSE_CLUSTER_NAME": "default",
        "REDIS_HOST": "redis",
        "REDIS_PORT": "6379",
        "REDIS_TLS_ENABLED": "false",
        "LANGFUSE_S3_EVENT_UPLOAD_BUCKET": "langfuse",
        "LANGFUSE_S3_EVENT_UPLOAD_REGION": "auto",
        "LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT": "http://minio:9000",
        "LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE": "true",
        "LANGFUSE_S3_EVENT_UPLOAD_PREFIX": "events/",
        "LANGFUSE_S3_MEDIA_UPLOAD_BUCKET": "langfuse",
        "LANGFUSE_S3_MEDIA_UPLOAD_REGION": "auto",
        "LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT": "http://minio:9000",
        "LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE": "true",
        "LANGFUSE_S3_MEDIA_UPLOAD_PREFIX": "media/",
        "LANGFUSE_S3_BATCH_EXPORT_ENABLED": "false",
        "LANGFUSE_S3_BATCH_EXPORT_BUCKET": "langfuse",
        "LANGFUSE_S3_BATCH_EXPORT_PREFIX": "exports/",
        "LANGFUSE_S3_BATCH_EXPORT_REGION": "auto",
        "LANGFUSE_S3_BATCH_EXPORT_ENDPOINT": "http://minio:9000",
        "LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT": minio_url,
        "LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID": "minio",
        "LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE": "true",
    }


def build_app_sidecar_specs(
    *,
    web_url: str,
    gateway_url: str,
    minio_url: str,
    langfuse_tag: str,
    gateway_tag: str | None = None,
) -> tuple[SidecarSpec, SidecarSpec, SidecarSpec]:
    """Return Sidecar specs for (web, worker, ai-gateway)."""
    shared_env = build_shared_langfuse_env(web_url=web_url, minio_url=minio_url)
    effective_gateway_tag = gateway_tag or langfuse_tag

    web_env = {
        **shared_env,
        "HOSTNAME": "0.0.0.0",
        "PORT": str(WEB_PORT),
        "LANGFUSE_TRUSTED_PROXY_COUNT": "1",
        "LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT": minio_url,
        "LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT": "http://minio:9000",
        "LANGFUSE_AI_GATEWAY_PUBLIC_URL": gateway_url,
        "LANGFUSE_INIT_ORG_ID": DEFAULT_INIT_ORG_ID,
        "LANGFUSE_INIT_ORG_NAME": DEFAULT_INIT_ORG_NAME,
        "LANGFUSE_INIT_PROJECT_ID": DEFAULT_INIT_PROJECT_ID,
        "LANGFUSE_INIT_PROJECT_NAME": DEFAULT_INIT_PROJECT_NAME,
        "LANGFUSE_INIT_USER_NAME": DEFAULT_INIT_USER_NAME,
    }
    web_spec = SidecarSpec(
        name="web",
        image_uri=f"docker.langfuse.com/langfuse/langfuse:{langfuse_tag}",
        command=(
            "sh",
            "-c",
            "cd /app && exec dumb-init -- ./web/entrypoint.sh node ./web/server.js --keepAliveTimeout 110000",
        ),
        env=web_env,
    )

    worker_env = {
        **shared_env,
        "PORT": str(WORKER_PORT),
    }
    worker_spec = SidecarSpec(
        name="worker",
        image_uri=f"docker.langfuse.com/langfuse/langfuse-worker:{langfuse_tag}",
        command=(
            "sh",
            "-c",
            "cd /app && exec dumb-init -- ./worker/entrypoint.sh node worker/dist/index.js",
        ),
        env=worker_env,
    )

    gateway_env = {
        # Plain HTTP is safe here because traffic stays on the host-local
        # Sandbox bridge network and never traverses the public internet.
        "LANGFUSE_AI_GATEWAY_WEB_URL": f"http://web:{WEB_PORT}",
        "LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL": "true",
        "LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS": f"0.0.0.0:{GATEWAY_PORT}",
        "LANGFUSE_AI_GATEWAY_REDIS_URL": "redis://redis:6379",
        "LANGFUSE_AI_GATEWAY_CONNECTION_DRAIN_TIMEOUT_SECONDS": "15",
        "LANGFUSE_AI_GATEWAY_TELEMETRY_SHUTDOWN_TIMEOUT_SECONDS": "10",
        "LANGFUSE_LOG_LEVEL": "info",
    }
    gateway_spec = SidecarSpec(
        name="ai-gateway",
        image_uri=f"docker.langfuse.com/langfuse/ai-gateway:{effective_gateway_tag}",
        command=("/usr/local/bin/ai-gateway",),
        env=gateway_env,
    )

    return web_spec, worker_spec, gateway_spec


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


def cmd_up(args: argparse.Namespace) -> int:
    if not (60 <= args.timeout <= MAX_SANDBOX_TIMEOUT_SECONDS):
        raise SystemExit(
            f"Error: --timeout must be between 60 and {MAX_SANDBOX_TIMEOUT_SECONDS} seconds (24h Modal limit)."
        )

    modal = require_modal()
    app = modal.App.lookup(args.app_name, create_if_missing=True)

    if args.auto_init_secret:
        payload = generate_secret_payload()
        modal.Secret.objects.create(args.secret_name, payload, allow_existing=True)

    app_secret = modal.Secret.from_name(
        args.secret_name,
        required_keys=list(REQUIRED_SECRET_KEYS),
    )

    caddy_cmd = (
        f"cat <<'EOF' > /etc/caddy/Caddyfile\n{render_caddyfile()}EOF"
    )
    caddy_image = (
        modal.Image.from_registry(CADDY_IMAGE_URI)
        .entrypoint([])
        .run_commands(caddy_cmd)
    )

    data_specs = build_data_sidecar_specs()
    # Placeholder URLs just to collect unique image URIs before the Sandbox starts.
    placeholder_app_specs = build_app_sidecar_specs(
        web_url="https://placeholder.modal.host",
        gateway_url="https://placeholder.modal.host",
        minio_url="https://placeholder.modal.host",
        langfuse_tag=args.langfuse_tag,
        gateway_tag=args.gateway_tag,
    )

    image_uris = {spec.image_uri for spec in [*data_specs, *placeholder_app_specs]}
    built_images: dict[str, Any] = {}

    print(f"Pulling/caching {len(image_uris) + 1} published registry images on Modal...")
    with modal.enable_output():
        caddy_image = caddy_image.build(app)
        for uri in sorted(image_uris):
            built_images[uri] = modal.Image.from_registry(uri).entrypoint([]).build(app)

    sandbox_kwargs: dict[str, Any] = {
        "app": app,
        "name": args.sandbox_name,
        "image": caddy_image,
        "cpu": args.cpu,
        "memory": args.memory,
        "runtime": args.runtime,
        "timeout": args.timeout,
        "encrypted_ports": [WEB_PORT, GATEWAY_PORT, MINIO_PUBLIC_PORT],
        "readiness_probe": modal.Probe.with_tcp(WEB_PORT),
    }
    if args.idle_timeout is not None:
        sandbox_kwargs["idle_timeout"] = args.idle_timeout

    vm_allocations: dict[str, int] = {}
    if args.runtime == "vm":
        reserve_mib, vm_allocations = compute_vm_memory_plan(args.memory)
        sandbox_kwargs["experimental_options"] = {
            "vm_sidecar_memory_reserve_mib": reserve_mib
        }

    print(
        f"Starting main Sandbox '{args.sandbox_name}' "
        f"(runtime={args.runtime}, cpu={args.cpu}, memory={args.memory} MiB, timeout={args.timeout}s)..."
    )
    sandbox = modal.Sandbox.create(
        "caddy",
        "run",
        "--config",
        "/etc/caddy/Caddyfile",
        "--adapter",
        "caddyfile",
        **sandbox_kwargs,
    )

    try:
        sandbox.wait_until_ready(timeout=120)

        tunnels = sandbox.tunnels()
        web_url = tunnels[WEB_PORT].url.rstrip("/")
        gateway_url = tunnels[GATEWAY_PORT].url.rstrip("/")
        minio_url = tunnels[MINIO_PUBLIC_PORT].url.rstrip("/")

        print(f"Sandbox ID:   {sandbox.object_id}")
        print(f"Langfuse UI:  {web_url}")
        print(f"AI Gateway:   {gateway_url}")
        print(f"MinIO S3:     {minio_url}")

        print("Starting stateful data Sidecars (postgres, clickhouse, redis, minio)...")
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
            ("sh", "-c", 'redis-cli -a "$REDIS_AUTH" ping | grep -q PONG'),
            label="redis",
            timeout_s=90,
        )
        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", "http://minio:9000/minio/health/live"),
            label="minio",
            timeout_s=90,
        )

        web_spec, worker_spec, gateway_spec = build_app_sidecar_specs(
            web_url=web_url,
            gateway_url=gateway_url,
            minio_url=minio_url,
            langfuse_tag=args.langfuse_tag,
            gateway_tag=args.gateway_tag,
        )

        print("Starting langfuse-web (runs Postgres + ClickHouse migrations on first boot)...")
        _create_sidecar(
            sandbox,
            web_spec,
            built_images[web_spec.image_uri],
            app_secret,
            vm_memory_mib=vm_allocations.get(web_spec.name),
        )
        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", f"http://web:{WEB_PORT}/api/public/health"),
            label="langfuse-web",
            timeout_s=300,
            interval_s=3.0,
        )

        print("Starting langfuse-worker and langfuse-ai-gateway...")
        for spec in (worker_spec, gateway_spec):
            _create_sidecar(
                sandbox,
                spec,
                built_images[spec.image_uri],
                app_secret,
                vm_memory_mib=vm_allocations.get(spec.name),
            )

        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", f"http://worker:{WORKER_PORT}/api/health"),
            label="langfuse-worker",
            timeout_s=180,
            interval_s=3.0,
        )
        _wait_for_exec(
            sandbox,
            ("wget", "-qO-", f"http://ai-gateway:{GATEWAY_PORT}/ready"),
            label="langfuse-ai-gateway (/ready)",
            timeout_s=120,
            interval_s=2.0,
        )
    except Exception:
        if not args.keep_on_error:
            print(
                f"Startup failed; terminating Sandbox {sandbox.object_id} to avoid idle billing "
                "(pass --keep-on-error to keep it running for debugging).",
                file=sys.stderr,
            )
            sandbox.terminate(wait=True)
        raise

    print("\nStack is live:")
    print(f"  Langfuse UI:  {web_url}")
    print(f"  AI Gateway:   {gateway_url}")
    print(f"  MinIO S3:     {minio_url}")
    print(f"  Sandbox ID:   {sandbox.object_id}")
    print(
        "\nRead the pre-provisioned Langfuse login credentials from the Modal Secret:\n"
        f"  modal shell --secret {args.secret_name} --no-pty -c "
        "'printf \"Email: %s\\nPassword: %s\\n\" \"$LANGFUSE_INIT_USER_EMAIL\" \"$LANGFUSE_INIT_USER_PASSWORD\"'"
    )
    print(
        "\nStop when finished (Sandboxes bill per second while running):\n"
        f"  python examples/modal/modal_app.py stop --app-name {args.app_name} --sandbox-name {args.sandbox_name}"
    )

    if args.attach:
        print("\nAttached (Ctrl+C to terminate Sandbox)...")
        try:
            sandbox.wait()
        except KeyboardInterrupt:
            print("\nTerminating Sandbox...")
            sandbox.terminate(wait=True)
    else:
        sandbox.detach()

    return 0


def _lookup_sandbox(modal: Any, app_name: str, sandbox_name: str) -> Any:
    return modal.Sandbox.from_name(app_name, sandbox_name)


def cmd_status(args: argparse.Namespace) -> int:
    modal = require_modal()
    sandbox = _lookup_sandbox(modal, args.app_name, args.sandbox_name)
    tunnels = sandbox.tunnels()
    sidecars = sandbox._experimental_sidecars.list()

    print(f"Sandbox ID:   {sandbox.object_id}")
    print(f"Langfuse UI:  {tunnels[WEB_PORT].url.rstrip('/')}")
    print(f"AI Gateway:   {tunnels[GATEWAY_PORT].url.rstrip('/')}")
    print(f"MinIO S3:     {tunnels[MINIO_PUBLIC_PORT].url.rstrip('/')}")
    print(f"Sidecars ({len(sidecars)}):")
    for sc in sidecars:
        print(f"  - {sc.name}: {sc.object_id}")
    return 0


def _http_get(url: str, timeout_s: float = 15.0) -> tuple[int, str]:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise ValueError(f"Unsupported URL for HTTP check: {url!r}")
    import requests  # type: ignore[import-untyped]

    resp = requests.get(url, timeout=timeout_s)
    return resp.status_code, resp.text.strip()


def cmd_smoke(args: argparse.Namespace) -> int:
    modal = require_modal()
    sandbox = _lookup_sandbox(modal, args.app_name, args.sandbox_name)
    tunnels = sandbox.tunnels()
    web_url = tunnels[WEB_PORT].url.rstrip("/")
    gateway_url = tunnels[GATEWAY_PORT].url.rstrip("/")
    minio_url = tunnels[MINIO_PUBLIC_PORT].url.rstrip("/")

    checks = [
        ("Langfuse Web health", f"{web_url}/api/public/health"),
        ("Langfuse Web UI", f"{web_url}/auth/sign-in"),
        ("AI Gateway liveness", f"{gateway_url}/health"),
        ("AI Gateway readiness", f"{gateway_url}/ready"),
        ("MinIO S3 tunnel", f"{minio_url}/minio/health/live"),
    ]
    failed = False
    for label, url in checks:
        status, body = _http_get(url)
        marker = "OK" if status == 200 else "FAIL"
        preview = body.replace("\n", " ")[:160]
        print(f"[{marker}] {label}: HTTP {status} ({url}) -> {preview}")
        if status != 200:
            failed = True

    proc = sandbox.exec(
        "wget", "-qO-", f"http://worker:{WORKER_PORT}/api/health", timeout=15
    )
    rc = proc.wait()
    worker_body = proc.stdout.read().strip()
    marker = "OK" if rc == 0 else "FAIL"
    print(f"[{marker}] Langfuse Worker health (bridge): rc={rc} -> {worker_body[:160]}")
    if rc != 0:
        failed = True

    return 1 if failed else 0


def cmd_stop(args: argparse.Namespace) -> int:
    modal = require_modal()
    sandbox = _lookup_sandbox(modal, args.app_name, args.sandbox_name)
    print(f"Terminating Sandbox '{args.sandbox_name}' ({sandbox.object_id})...")
    sandbox.terminate(wait=True)
    print("Terminated.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run Langfuse + AI Gateway in an ephemeral Modal Sandbox."
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

    p_up = sub.add_parser(
        "up",
        help="Start the ephemeral Sandbox + 7 Sidecars and print public URLs.",
    )
    p_up.add_argument("--app-name", default=DEFAULT_APP_NAME)
    p_up.add_argument("--sandbox-name", default=DEFAULT_SANDBOX_NAME)
    p_up.add_argument("--secret-name", default=DEFAULT_SECRET_NAME)
    p_up.add_argument(
        "--auto-init-secret",
        action="store_true",
        help="Create the Modal Secret automatically if it does not exist yet.",
    )
    p_up.add_argument(
        "--langfuse-tag",
        default=DEFAULT_LANGFUSE_TAG,
        help="Tag for docker.langfuse.com/langfuse/{langfuse,langfuse-worker,ai-gateway} (must be > 4.75.0).",
    )
    p_up.add_argument(
        "--gateway-tag",
        default=None,
        help="Optional override tag for docker.langfuse.com/langfuse/ai-gateway.",
    )
    p_up.add_argument("--cpu", type=float, default=DEFAULT_CPU)
    p_up.add_argument("--memory", type=int, default=DEFAULT_MEMORY_MIB)
    p_up.add_argument(
        "--runtime",
        choices=("gvisor", "vm"),
        default=DEFAULT_RUNTIME,
        help="Modal Sandbox runtime ('gvisor' default; use 'vm' for a full Linux kernel).",
    )
    p_up.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Sandbox lifetime in seconds (max 86400 = 24h).",
    )
    p_up.add_argument(
        "--idle-timeout",
        type=int,
        default=None,
        help="Optional idle timeout in seconds before Modal terminates the Sandbox.",
    )
    p_up.add_argument(
        "--attach",
        action="store_true",
        help="Stay attached and terminate the Sandbox on Ctrl+C.",
    )
    p_up.add_argument(
        "--keep-on-error",
        action="store_true",
        help="Keep the Sandbox running for debugging if a Sidecar readiness check fails.",
    )
    p_up.set_defaults(func=cmd_up)

    for cmd_name, help_text, handler in (
        ("status", "Show running Sandbox URLs and Sidecars.", cmd_status),
        ("smoke", "Verify public HTTPS health endpoints and gateway readiness.", cmd_smoke),
        ("stop", "Terminate the running Sandbox and all Sidecars.", cmd_stop),
    ):
        p = sub.add_parser(cmd_name, help=help_text)
        p.add_argument("--app-name", default=DEFAULT_APP_NAME)
        p.add_argument("--sandbox-name", default=DEFAULT_SANDBOX_NAME)
        p.set_defaults(func=handler)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
