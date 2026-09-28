"""Regression tests for runner-local typed errors and packaging."""
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
sys.path.insert(0, str(HERE))
import code_based_eval_handler as runner
from langfuse_errors import LangfuseConfigurationError, LangfuseError


def load_bootstrap():
    spec = importlib.util.spec_from_file_location(
        "bootstrap_floci", SCRIPTS / "bootstrap-floci.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TypedErrorTests(unittest.TestCase):
    def test_missing_evaluator_reports_typed_configuration_error(self):
        result = runner.handler({"code": {"source": "x = 1"}}, None)
        self.assertEqual(result["error"]["code"], "INVALID_SOURCE")
        self.assertIn("LangfuseConfigurationError", result["error"]["message"])

    def test_unrelated_programming_errors_are_not_langfuse_errors(self):
        self.assertTrue(issubclass(LangfuseConfigurationError, LangfuseError))
        self.assertFalse(isinstance(NameError("typo"), LangfuseError))
        self.assertFalse(isinstance(TypeError("bug"), LangfuseError))

    def test_packaging_includes_required_module(self):
        bootstrap = load_bootstrap()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "python").mkdir()
            (root / "node").mkdir()
            for filename in ("code_based_eval_handler.py", "langfuse_errors.py"):
                (root / "python" / filename).write_text("# test\n")
            (root / "node" / "code-based-eval-handler.mjs").write_text("// test\n")
            with (
                patch.object(bootstrap, "RUNNERS_DIR", root),
                patch.object(bootstrap, "BUILD_DIR", root / "build"),
                patch.object(bootstrap, "wait_for_floci"),
                patch.object(bootstrap, "upsert_lambda"),
            ):
                bootstrap.main()
                with ZipFile(root / "build" / "python.zip") as archive:
                    self.assertEqual(
                        set(archive.namelist()),
                        {"code_based_eval_handler.py", "langfuse_errors.py"},
                    )

    def test_missing_required_module_fails_before_deployment(self):
        bootstrap = load_bootstrap()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "python").mkdir()
            (root / "node").mkdir()
            (root / "python" / "code_based_eval_handler.py").write_text("# test\n")
            (root / "node" / "code-based-eval-handler.mjs").write_text("// test\n")
            with (
                patch.object(bootstrap, "RUNNERS_DIR", root),
                patch.object(bootstrap, "BUILD_DIR", root / "build"),
                patch.object(bootstrap, "wait_for_floci"),
                patch.object(bootstrap, "upsert_lambda") as deploy,
            ):
                with self.assertRaisesRegex(FileNotFoundError, "langfuse_errors.py"):
                    bootstrap.main()
                deploy.assert_not_called()


if __name__ == "__main__":
    unittest.main()
