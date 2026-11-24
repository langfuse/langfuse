"""Offline unit tests for examples/modal/modal_app.py.

Validates configuration, secret generation, nginx TCP/HTTP proxying, DB
endpoints Secret wiring, VM memory allocation, and CLI orchestration without
requiring Modal credentials or third-party packages to be installed.
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
        self.object_id = "sb-db-test-123"
        self.command = command
        self.kwargs = kwargs
        self.sidecars: list[FakeSidecarHandle] = []
        self.exec_calls: list[tuple[str, ...]] = []
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

    def tunnels(self) -> dict[int, types.SimpleNamespace]:
        return {
            modal_app.POSTGRES_PORT: types.SimpleNamespace(tcp_socket=("r1.modal.host", 40001)),
            modal_app.REDIS_PORT: types.SimpleNamespace(tcp_socket=("r2.modal.host", 40002)),
            modal_app.CLICKHOUSE_NATIVE_PORT: types.SimpleNamespace(tcp_socket=("r3.modal.host", 40003)),
            modal_app.CLICKHOUSE_HTTP_PORT: types.SimpleNamespace(url="https://ch-abc.w.modal.host"),
            modal_app.MINIO_PUBLIC_PORT: types.SimpleNamespace(url="https://s3-abc.w.modal.host"),
        }

    def exec(self, *cmd: str, timeout: int = 15) -> FakeExecProcess:
        self.exec_calls.append(cmd)
        return FakeExecProcess(returncode=0, stdout="Ok.\n")

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


class FakeServer:
    def __init__(self, name: str, url: str) -> None:
        self.name = name
        self._url = url
        self.autoscaler_updates: list[dict] = []
        self.autoscaler = types.SimpleNamespace(
            update=self._update_autoscaler,
            settings=lambda: types.SimpleNamespace(
                min_containers=1, max_containers=4, target_concurrency=20.0
            ),
        )

    def get_url(self) -> str:
        return self._url

    def _update_autoscaler(self, **kwargs) -> dict:
        self.autoscaler_updates.append(kwargs)
        return kwargs


def make_fake_modal():
    created_secrets: dict[str, dict[str, str]] = {}
    created_sandboxes: list[FakeSandbox] = []
    servers = {
        "LangfuseWeb": FakeServer("LangfuseWeb", "https://ws--langfuse-web.modal.run"),
        "LangfuseAiGateway": FakeServer("LangfuseAiGateway", "https://ws--langfuse-gw.modal.run"),
        "LangfuseWorker": FakeServer("LangfuseWorker", "https://ws--langfuse-worker.modal.run"),
    }
    migration_calls: list[str] = []

    class FakeSecretObjects:
        @staticmethod
        def create(name: str, env_dict: dict[str, str], allow_existing: bool = False) -> None:
            if name in created_secrets and not allow_existing:
                raise RuntimeError("already exists")
            created_secrets[name] = dict(env_dict)

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
            if not created_sandboxes:
                raise RuntimeError("not found")
            return created_sandboxes[-1]

    class FakeServerCls:
        @staticmethod
        def from_name(app_name: str, server_name: str) -> FakeServer:
            return servers[server_name]

    class FakeFunctionCls:
        @staticmethod
        def from_name(app_name: str, fn_name: str):
            return types.SimpleNamespace(remote=lambda: migration_calls.append(fn_name))

    class FakeEnableOutput:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    return types.SimpleNamespace(
        App=types.SimpleNamespace(
            lookup=lambda name, create_if_missing=True: types.SimpleNamespace(name=name)
        ),
        Image=types.SimpleNamespace(from_registry=lambda uri: FakeImage(uri)),
        Secret=FakeSecret,
        Sandbox=FakeSandboxCls,
        Server=FakeServerCls,
        Function=FakeFunctionCls,
        enable_output=lambda: FakeEnableOutput(),
        _created_secrets=created_secrets,
        _created_sandboxes=created_sandboxes,
        _servers=servers,
        _migration_calls=migration_calls,
    )


class ModalAppTests(unittest.TestCase):
    def test_generate_secret_payload_has_all_required_keys_and_safe_values(self) -> None:
        payload = modal_app.generate_secret_payload()
        self.assertEqual(set(payload.keys()), set(modal_app.REQUIRED_SECRET_KEYS))
        self.assertEqual(len(payload["ENCRYPTION_KEY"]), 64)
        self.assertIn("BEGIN PRIVATE KEY", payload["LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY"])
        self.assertEqual(payload["POSTGRES_PASSWORD"], payload["DATABASE_PASSWORD"])
        self.assertEqual(payload["REDIS_AUTH"], payload["LANGFUSE_AI_GATEWAY_REDIS_AUTH"])
        self.assertEqual(
            payload["MINIO_ROOT_PASSWORD"],
            payload["LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY"],
        )
        self.assertEqual(payload["LANGFUSE_INIT_USER_EMAIL"], modal_app.DEFAULT_INIT_USER_EMAIL)
        self.assertGreaterEqual(len(payload["LANGFUSE_INIT_USER_PASSWORD"]), 20)
        self.assertTrue(payload["LANGFUSE_INIT_PROJECT_PUBLIC_KEY"].startswith("pk-lf-"))
        self.assertTrue(payload["LANGFUSE_INIT_PROJECT_SECRET_KEY"].startswith("sk-lf-"))

    def test_render_nginx_conf_proxies_tcp_and_http_sidecars(self) -> None:
        conf = modal_app.render_nginx_conf()
        self.assertIn("proxy_pass postgres:5432;", conf)
        self.assertIn("proxy_pass redis:6379;", conf)
        self.assertIn("proxy_pass clickhouse:9000;", conf)
        self.assertIn("proxy_pass http://clickhouse:8123;", conf)
        self.assertIn("proxy_pass http://minio:9000;", conf)
        self.assertIn("proxy_set_header Host $http_host;", conf)

    def test_vm_memory_plan_partitions_reserve_without_overflow(self) -> None:
        reserve, allocs = modal_app.compute_vm_memory_plan(6144)
        self.assertEqual(reserve, 5632)
        self.assertEqual(set(allocs.keys()), set(modal_app.VM_DB_SIDECAR_MEMORY_WEIGHTS.keys()))
        self.assertEqual(sum(allocs.values()), reserve)
        with self.assertRaises(ValueError):
            modal_app.compute_vm_memory_plan(1024)

    def test_up_starts_db_sandbox_runs_migrations_and_deploys_servers(self) -> None:
        fake_modal = make_fake_modal()
        deploy_calls: list[dict] = []

        def fake_deploy(**kwargs) -> None:
            deploy_calls.append(kwargs)

        with (
            mock.patch.object(modal_app, "require_modal", return_value=fake_modal),
            mock.patch.object(modal_app, "_deploy_servers", side_effect=fake_deploy),
            mock.patch.object(modal_app, "_wait_for_http"),
        ):
            self.assertEqual(modal_app.main(["init-secret"]), 0)
            rc = modal_app.main(
                ["up", "--runtime", "vm", "--db-memory", "6144", "--workers", "2", "--gateways", "3"]
            )
            self.assertEqual(rc, 0)

        # DB Sandbox launched with 4 isolated data Sidecars only.
        self.assertEqual(len(fake_modal._created_sandboxes), 1)
        sb = fake_modal._created_sandboxes[0]
        self.assertTrue(sb.detached)
        self.assertEqual(sb.kwargs["encrypted_ports"], [8123, 9090])
        self.assertEqual(sb.kwargs["unencrypted_ports"], [5432, 6379, 9000])
        self.assertEqual([sc.name for sc in sb.sidecars], ["postgres", "clickhouse", "redis", "minio"])
        for sc in sb.sidecars:
            self.assertEqual(sc.kwargs["outbound_cidr_allowlist"], [])
        ch_sidecar = next(sc for sc in sb.sidecars if sc.name == "clickhouse")
        self.assertIn("max_server_memory_usage", " ".join(ch_sidecar.command))

        # Endpoints Secret wired with DB Sandbox sockets + stable Modal Server URLs.
        ep = fake_modal._created_secrets[modal_app.DEFAULT_ENDPOINTS_SECRET_NAME]
        self.assertEqual(ep["DATABASE_HOST"], "r1.modal.host")
        self.assertEqual(ep["DATABASE_PORT"], "40001")
        self.assertEqual(ep["REDIS_HOST"], "r2.modal.host")
        self.assertEqual(ep["REDIS_PORT"], "40002")
        self.assertEqual(ep["CLICKHOUSE_MIGRATION_URL"], "clickhouse://r3.modal.host:40003")
        self.assertEqual(ep["CLICKHOUSE_URL"], "https://ch-abc.w.modal.host")
        self.assertEqual(ep["LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT"], "https://s3-abc.w.modal.host")
        self.assertEqual(ep["NEXTAUTH_URL"], "https://ws--langfuse-web.modal.run")
        self.assertEqual(ep["LANGFUSE_AI_GATEWAY_PUBLIC_URL"], "https://ws--langfuse-gw.modal.run")
        self.assertEqual(ep["LANGFUSE_AI_GATEWAY_WEB_URL"], "https://ws--langfuse-web.modal.run")

        # Initial zero-scale deploy -> migrations -> live deploy with requested scale.
        self.assertEqual(len(deploy_calls), 2)
        self.assertEqual(deploy_calls[0]["min_web"], 0)
        self.assertEqual(deploy_calls[0]["min_workers"], 0)
        self.assertEqual(deploy_calls[0]["min_gateways"], 0)
        self.assertEqual(fake_modal._migration_calls, ["run_migrations"])
        self.assertEqual(deploy_calls[1]["min_web"], 1)
        self.assertEqual(deploy_calls[1]["min_workers"], 2)
        self.assertEqual(deploy_calls[1]["min_gateways"], 3)

    def test_up_external_db_skips_sandbox_and_keeps_user_endpoints(self) -> None:
        fake_modal = make_fake_modal()
        deploy_calls: list[dict] = []

        with (
            mock.patch.object(modal_app, "require_modal", return_value=fake_modal),
            mock.patch.object(modal_app, "_deploy_servers", side_effect=lambda **kw: deploy_calls.append(kw)),
            mock.patch.object(modal_app, "_wait_for_http"),
        ):
            rc = modal_app.main(["up", "--external-db", "--workers", "2"])
            self.assertEqual(rc, 0)

        self.assertEqual(len(fake_modal._created_sandboxes), 0)
        self.assertNotIn(modal_app.DEFAULT_ENDPOINTS_SECRET_NAME, fake_modal._created_secrets)
        self.assertEqual(fake_modal._migration_calls, ["run_migrations"])
        self.assertEqual(deploy_calls[-1]["min_workers"], 2)

    def test_scale_updates_modal_server_autoscalers(self) -> None:
        fake_modal = make_fake_modal()
        with mock.patch.object(modal_app, "require_modal", return_value=fake_modal):
            rc = modal_app.main(
                ["scale", "--web", "2", "--workers", "3", "--gateways", "4", "--max-gateways", "12"]
            )
            self.assertEqual(rc, 0)

        self.assertEqual(fake_modal._servers["LangfuseWeb"].autoscaler_updates, [{"min_containers": 2}])
        self.assertEqual(fake_modal._servers["LangfuseWorker"].autoscaler_updates, [{"min_containers": 3}])
        self.assertEqual(
            fake_modal._servers["LangfuseAiGateway"].autoscaler_updates,
            [{"min_containers": 4, "max_containers": 12}],
        )

    def test_db_up_terminates_sandbox_when_readiness_fails(self) -> None:
        fake_modal = make_fake_modal()
        with (
            mock.patch.object(modal_app, "require_modal", return_value=fake_modal),
            mock.patch.object(modal_app, "_wait_for_exec", side_effect=TimeoutError("boom")),
        ):
            with self.assertRaises(TimeoutError):
                modal_app.main(["db-up"])

        self.assertEqual(len(fake_modal._created_sandboxes), 1)
        self.assertTrue(fake_modal._created_sandboxes[0].terminated)

    def test_require_modal_reports_missing_credentials_cleanly(self) -> None:
        with mock.patch.dict("os.environ", {}, clear=True):
            with mock.patch.object(Path, "is_file", return_value=False):
                self.assertFalse(modal_app.has_modal_credentials())

    def test_http_get_rejects_non_http_schemes(self) -> None:
        with self.assertRaises(ValueError):
            modal_app._http_get("file:///etc/passwd")


if __name__ == "__main__":
    unittest.main()
