"""Offline unit tests for examples/modal/modal_app.py.

Validates configuration, secret generation, Caddyfile proxying, VM memory
allocation, and Sandbox/Sidecar orchestration without requiring Modal
credentials or the `modal` package to be installed.
"""

from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).with_name("modal_app.py")
SPEC = importlib.util.spec_from_file_location("modal_app", MODULE_PATH)
assert SPEC and SPEC.loader
modal_app = importlib.util.module_from_spec(SPEC)
sys.modules["modal_app"] = modal_app
SPEC.loader.exec_module(modal_app)


class FakeExecProcess:
    def __init__(self, returncode: int = 0, stdout: str = "ok\n", stderr: str = "") -> None:
        self._returncode = returncode
        self.stdout = types.SimpleNamespace(read=lambda: stdout)
        self.stderr = types.SimpleNamespace(read=lambda: stderr)

    def wait(self) -> int:
        return self._returncode


class FakeSidecarHandle:
    def __init__(self, name: str, command: tuple[str, ...], kwargs: dict) -> None:
        self.name = name
        self.object_id = f"sc-{name}"
        self.command = command
        self.kwargs = kwargs
        self.exec_calls: list[tuple[str, ...]] = []

    def exec(self, *cmd: str, timeout: int = 15) -> FakeExecProcess:
        self.exec_calls.append(cmd)
        return FakeExecProcess(returncode=0, stdout="PONG\n")


class FakeSandbox:
    def __init__(self, command: tuple[str, ...], kwargs: dict) -> None:
        self.object_id = "sb-test-123"
        self.command = command
        self.kwargs = kwargs
        self.sidecars: list[FakeSidecarHandle] = []
        self.exec_calls: list[tuple[str, ...]] = []
        self.waited_ready = False
        self.detached = False
        self.terminated = False
        self._experimental_sidecars = types.SimpleNamespace(
            create=self._create_sidecar,
            list=lambda: list(self.sidecars),
        )

    def _create_sidecar(self, *command: str, **kwargs) -> FakeSidecarHandle:
        handle = FakeSidecarHandle(kwargs["name"], command, kwargs)
        self.sidecars.append(handle)
        return handle

    def wait_until_ready(self, timeout: int = 120) -> None:
        self.waited_ready = True

    def tunnels(self) -> dict[int, types.SimpleNamespace]:
        return {
            modal_app.WEB_PORT: types.SimpleNamespace(url="https://web-abc.modal.host"),
            modal_app.GATEWAY_PORT: types.SimpleNamespace(url="https://gw-abc.modal.host"),
            modal_app.MINIO_PUBLIC_PORT: types.SimpleNamespace(url="https://s3-abc.modal.host"),
        }

    def exec(self, *cmd: str, timeout: int = 15) -> FakeExecProcess:
        self.exec_calls.append(cmd)
        return FakeExecProcess(returncode=0, stdout='{"status":"ok"}\n')

    def detach(self) -> None:
        self.detached = True

    def terminate(self, wait: bool = False) -> None:
        self.terminated = True


class FakeImage:
    def __init__(self, uri: str) -> None:
        self.uri = uri
        self.entrypoints: list[list[str]] = []
        self.commands: list[tuple[str, ...]] = []
        self.built = False

    def entrypoint(self, cmd: list[str]) -> FakeImage:
        self.entrypoints.append(cmd)
        return self

    def run_commands(self, *cmds: str) -> FakeImage:
        self.commands.append(cmds)
        return self

    def build(self, app) -> FakeImage:
        self.built = True
        return self


def make_fake_modal():
    created_secrets: dict[str, dict[str, str]] = {}
    created_sandboxes: list[FakeSandbox] = []

    class FakeSecretObjects:
        @staticmethod
        def create(name: str, env_dict: dict[str, str], allow_existing: bool = False) -> None:
            if name in created_secrets and not allow_existing:
                raise RuntimeError("already exists")
            created_secrets.setdefault(name, dict(env_dict))

        @staticmethod
        def delete(name: str) -> None:
            created_secrets.pop(name, None)

    class FakeSecret:
        objects = FakeSecretObjects

        @staticmethod
        def from_name(name: str, required_keys=None):
            return types.SimpleNamespace(name=name, required_keys=required_keys)

    class FakeSandboxCls:
        @staticmethod
        def create(*cmd: str, **kwargs) -> FakeSandbox:
            sb = FakeSandbox(cmd, kwargs)
            created_sandboxes.append(sb)
            return sb

        @staticmethod
        def from_name(app_name: str, sandbox_name: str) -> FakeSandbox:
            return created_sandboxes[-1]

    class FakeEnableOutput:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    fake_modal = types.SimpleNamespace(
        App=types.SimpleNamespace(lookup=lambda name, create_if_missing=True: types.SimpleNamespace(name=name)),
        Image=types.SimpleNamespace(from_registry=lambda uri: FakeImage(uri)),
        Secret=FakeSecret,
        Sandbox=FakeSandboxCls,
        Probe=types.SimpleNamespace(with_tcp=lambda port: ("tcp", port)),
        enable_output=lambda: FakeEnableOutput(),
        _created_secrets=created_secrets,
        _created_sandboxes=created_sandboxes,
    )
    return fake_modal


class ModalAppTests(unittest.TestCase):
    def test_generate_secret_payload_has_all_required_keys_and_safe_values(self) -> None:
        payload = modal_app.generate_secret_payload()
        self.assertEqual(set(payload.keys()), set(modal_app.REQUIRED_SECRET_KEYS))
        self.assertEqual(len(payload["ENCRYPTION_KEY"]), 64)
        self.assertIn("BEGIN PRIVATE KEY", payload["LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY"])
        self.assertEqual(
            payload["DATABASE_URL"],
            f"postgresql://postgres:{payload['POSTGRES_PASSWORD']}@postgres:5432/postgres",
        )
        self.assertEqual(payload["REDIS_AUTH"], payload["LANGFUSE_AI_GATEWAY_REDIS_AUTH"])
        self.assertEqual(
            payload["MINIO_ROOT_PASSWORD"],
            payload["LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY"],
        )

    def test_render_caddyfile_wires_ports_and_streaming_headers(self) -> None:
        caddyfile = modal_app.render_caddyfile()
        self.assertIn(":3000", caddyfile)
        self.assertIn("reverse_proxy http://web:3000", caddyfile)
        self.assertIn("header_up X-Forwarded-Proto https", caddyfile)
        self.assertIn(":3031", caddyfile)
        self.assertIn("reverse_proxy http://ai-gateway:3031", caddyfile)
        self.assertIn("flush_interval -1", caddyfile)
        self.assertIn(":9090", caddyfile)
        self.assertIn("reverse_proxy http://minio:9000", caddyfile)

    def test_vm_memory_plan_partitions_reserve_without_overflow(self) -> None:
        reserve, allocs = modal_app.compute_vm_memory_plan(10240)
        self.assertEqual(reserve, 9216)
        self.assertEqual(set(allocs.keys()), set(modal_app.VM_SIDECAR_MEMORY_WEIGHTS.keys()))
        self.assertEqual(sum(allocs.values()), reserve)
        with self.assertRaises(ValueError):
            modal_app.compute_vm_memory_plan(2048)

    def test_up_orchestrates_all_seven_sidecars_and_wires_gateway_to_web(self) -> None:
        fake_modal = make_fake_modal()
        with mock.patch.object(modal_app, "require_modal", return_value=fake_modal):
            rc = modal_app.main(["init-secret"])
            self.assertEqual(rc, 0)
            self.assertIn(modal_app.DEFAULT_SECRET_NAME, fake_modal._created_secrets)

            rc = modal_app.main(["up", "--runtime", "vm", "--memory", "10240"])
            self.assertEqual(rc, 0)

        self.assertEqual(len(fake_modal._created_sandboxes), 1)
        sb = fake_modal._created_sandboxes[0]
        self.assertTrue(sb.waited_ready)
        self.assertTrue(sb.detached)
        self.assertEqual(sb.kwargs["encrypted_ports"], [3000, 3031, 9090])
        self.assertNotIn("secrets", sb.kwargs)
        self.assertEqual(
            sb.kwargs["experimental_options"]["vm_sidecar_memory_reserve_mib"], 9216
        )

        names = [sc.name for sc in sb.sidecars]
        self.assertEqual(
            names,
            ["postgres", "clickhouse", "redis", "minio", "web", "worker", "ai-gateway"],
        )

        by_name = {sc.name: sc for sc in sb.sidecars}
        # Data sidecars have outbound egress blocked (local bridge still works).
        for db_name in ("postgres", "clickhouse", "redis", "minio"):
            self.assertEqual(by_name[db_name].kwargs["outbound_cidr_allowlist"], [])

        # Web gets public tunnel URLs for NextAuth, AI Gateway, and MinIO.
        web_env = by_name["web"].kwargs["env"]
        self.assertEqual(web_env["NEXTAUTH_URL"], "https://web-abc.modal.host")
        self.assertEqual(
            web_env["LANGFUSE_AI_GATEWAY_PUBLIC_URL"], "https://gw-abc.modal.host"
        )
        self.assertEqual(
            web_env["LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT"], "https://s3-abc.modal.host"
        )
        self.assertEqual(
            web_env["LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT"], "http://minio:9000"
        )

        # Gateway talks to Web over the local bridge and Redis for spend budgets.
        gw_env = by_name["ai-gateway"].kwargs["env"]
        self.assertEqual(gw_env["LANGFUSE_AI_GATEWAY_WEB_URL"], "http://web:3000")
        self.assertEqual(gw_env["LANGFUSE_AI_GATEWAY_ALLOW_HTTP_WEB_URL"], "true")
        self.assertEqual(gw_env["LANGFUSE_AI_GATEWAY_LISTEN_ADDRESS"], "0.0.0.0:3031")
        self.assertEqual(gw_env["LANGFUSE_AI_GATEWAY_REDIS_URL"], "redis://redis:6379")

        # Every Sidecar uses a published registry image with entrypoint cleared.
        for sc in sb.sidecars:
            self.assertTrue(sc.kwargs["image"].built)
            self.assertEqual(sc.kwargs["image"].entrypoints, [[]])

    def test_up_terminates_sandbox_when_readiness_fails(self) -> None:
        fake_modal = make_fake_modal()
        with (
            mock.patch.object(modal_app, "require_modal", return_value=fake_modal),
            mock.patch.object(
                modal_app, "_wait_for_exec", side_effect=TimeoutError("boom")
            ),
        ):
            with self.assertRaises(TimeoutError):
                modal_app.main(["up"])

        self.assertEqual(len(fake_modal._created_sandboxes), 1)
        self.assertTrue(fake_modal._created_sandboxes[0].terminated)

    def test_require_modal_reports_missing_credentials_cleanly(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            with mock.patch.object(Path, "is_file", return_value=False):
                self.assertFalse(modal_app.has_modal_credentials())


if __name__ == "__main__":
    unittest.main()
