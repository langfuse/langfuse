#!/usr/bin/env python3
import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ENDPOINT = os.environ.get("FLOCI_ENDPOINT", "http://localhost:4566").rstrip("/")
RUNNERS_DIR = Path(os.environ.get("CODE_EVAL_RUNNERS_DIR", "/opt/code-eval-runners"))
BUILD_DIR = Path(os.environ.get("CODE_EVAL_RUNNERS_BUILD_DIR", "/tmp/code-eval-runners"))
ROLE_ARN = "arn:aws:iam::000000000000:role/code-eval-floci-role"
NODE_FUNCTION = "code-based-eval-executor-node"
PYTHON_FUNCTION = "code-based-eval-executor-python"


def main() -> None:
    wait_for_floci()
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    node_zip = BUILD_DIR / "node.zip"
    python_zip = BUILD_DIR / "python.zip"

    node_handler_file = "code-based-eval-handler.mjs"
    python_handler_file = "code_based_eval_handler.py"

    with ZipFile(node_zip, "w", ZIP_DEFLATED) as zf:
        zf.write(RUNNERS_DIR / "node" / node_handler_file, node_handler_file)

    with ZipFile(python_zip, "w", ZIP_DEFLATED) as zf:
        zf.write(
            RUNNERS_DIR / "python" / python_handler_file, python_handler_file
        )

    upsert_lambda(
        NODE_FUNCTION, "nodejs24.x", "code-based-eval-handler.handler", node_zip
    )
    upsert_lambda(
        PYTHON_FUNCTION,
        "python3.13",
        "code_based_eval_handler.handler",
        python_zip,
    )

    print("Code eval Floci Lambda runners are ready.", flush=True)


def wait_for_floci() -> None:
    for _ in range(60):
        try:
            request("GET", "/2015-03-31/functions")
            return
        except Exception:
            time.sleep(1)

    raise RuntimeError(f"Timed out waiting for Floci at {ENDPOINT}")


def upsert_lambda(
    function_name: str,
    runtime: str,
    handler: str,
    zip_path: Path,
) -> None:
    encoded_zip = base64.b64encode(zip_path.read_bytes()).decode("ascii")

    if function_exists(function_name):
        request(
            "PUT",
            f"/2015-03-31/functions/{function_name}/code",
            {"ZipFile": encoded_zip},
        )
        return

    request(
        "POST",
        "/2015-03-31/functions",
        {
            "FunctionName": function_name,
            "Runtime": runtime,
            "Handler": handler,
            "Role": ROLE_ARN,
            "Timeout": 2,
            "MemorySize": 128,
            "Code": {"ZipFile": encoded_zip},
        },
    )


def function_exists(function_name: str) -> bool:
    try:
        request("GET", f"/2015-03-31/functions/{function_name}")
        return True
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise


def request(method: str, path: str, payload=None) -> bytes:
    data = None
    headers = {"Content-Type": "application/json"}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        f"{ENDPOINT}{path}",
        data=data,
        headers=headers,
        method=method,
    )

    with urllib.request.urlopen(req, timeout=10) as response:
        return response.read()


if __name__ == "__main__":
    main()
