import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const IMAGE_TAG = "langfuse-in-app-agent-sandbox:e2e";
const MICROVM_HOOKS_ROOT = "/aws/lambda-microvms/runtime/v1";
const DOCKER_BUILD_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 30_000;

type JsonResponse = {
  status: number;
  body: unknown;
};

describe("sandbox runtime docker container", () => {
  let containerName = "";
  let baseUrl = "";

  beforeAll(async () => {
    await runDocker(["build", ".", "-t", IMAGE_TAG], {
      cwd: PACKAGE_ROOT,
      timeout: DOCKER_BUILD_TIMEOUT_MS,
    });

    containerName = `langfuse-in-app-agent-sandbox-e2e-${randomUUID().slice(0, 8)}`;
    await runDocker([
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      "127.0.0.1::5000",
      IMAGE_TAG,
    ]);

    const hostPort = (
      await runDocker([
        "inspect",
        "-f",
        '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}',
        containerName,
      ])
    ).stdout.trim();

    if (!hostPort) {
      throw new Error("Docker did not publish sandbox server port 5000");
    }

    baseUrl = `http://127.0.0.1:${hostPort}`;
    await waitForHealth(baseUrl, containerName);
  }, 300_000);

  afterAll(async () => {
    if (!containerName) {
      return;
    }

    await runDocker(["rm", "-f", containerName]).catch(() => undefined);
  });

  it(
    "serves health, sandbox operations, and microvm hooks over HTTP",
    { timeout: 120_000 },
    async () => {
      const health = await requestJson(baseUrl, "/health");
      expect(health).toEqual({ status: 200, body: { status: "ok" } });

      const written = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "write",
          path: "hello.txt",
          content: "hello",
        }),
      });
      expect(written.status).toBe(200);
      expect(written.body).toEqual({
        result: {
          path: "/workspace/hello.txt",
          bytesWritten: Buffer.byteLength("hello", "utf8"),
        },
      });

      const readBack = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "read",
          path: "/workspace/hello.txt",
        }),
      });
      expect(readBack).toEqual({
        status: 200,
        body: {
          result: {
            path: "/workspace/hello.txt",
            content: "hello",
          },
        },
      });

      const edited = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "edit",
          path: "hello.txt",
          oldText: "hello",
          newText: "hello world",
        }),
      });
      expect(edited).toEqual({
        status: 200,
        body: {
          result: {
            path: "/workspace/hello.txt",
            replaced: true,
          },
        },
      });

      const bash = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: "cat hello.txt; pwd",
        }),
      });
      expect(bash.status).toBe(200);
      expect(bash.body).toEqual({
        result: expect.objectContaining({
          stdout: expect.stringMatching(/^hello world\/workspace\n$/),
          stderr: "",
          exitCode: 0,
        }),
      });

      const toolCall = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: "cat /workspace/tool_calls/note.txt",
          toolCallFiles: [
            {
              path: "/workspace/tool_calls/note.txt",
              content: "from-previous-tool",
            },
          ],
        }),
      });
      expect(toolCall.status).toBe(200);
      expect(toolCall.body).toEqual({
        result: expect.objectContaining({
          stdout: "from-previous-tool",
          exitCode: 0,
        }),
      });

      const toolCallReset = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: "test ! -e /workspace/tool_calls/note.txt",
        }),
      });
      expect(toolCallReset.status).toBe(200);
      expect(toolCallReset.body).toEqual({
        result: expect.objectContaining({ exitCode: 0 }),
      });

      const timedOut = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: "sleep 2",
          timeoutMs: 200,
        }),
      });
      expect(timedOut.status).toBe(200);
      expect(timedOut.body).toEqual({
        result: expect.objectContaining({
          exitCode: 124,
          stderr: expect.stringContaining("timed out after 200ms"),
        }),
      });

      const escaped = await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "read",
          path: "/etc/passwd",
        }),
      });
      expect(escaped.status).toBe(500);
      expect(escaped.body).toEqual({
        error: "Sandbox path escapes workspace: /etc/passwd",
      });

      const missing = await requestJson(baseUrl, "/not-a-route");
      expect(missing).toEqual({
        status: 404,
        body: { error: "Not found" },
      });

      for (const [hookPath, expected] of [
        [`${MICROVM_HOOKS_ROOT}/ready`, { ready: true }],
        [`${MICROVM_HOOKS_ROOT}/run`, { ready: true }],
        [`${MICROVM_HOOKS_ROOT}/resume`, { resumed: true }],
        [`${MICROVM_HOOKS_ROOT}/suspend`, { suspended: true }],
        [`${MICROVM_HOOKS_ROOT}/terminate`, { terminated: true }],
      ] as const) {
        const hook = await requestJson(baseUrl, hookPath, {
          method: "POST",
          body: "{}",
        });
        expect(hook).toEqual({ status: 200, body: expected });
      }
    },
  );
});

async function waitForHealth(baseUrl: string, containerName: string) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    try {
      const response = await requestJson(baseUrl, "/health");
      if (response.status === 200) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const logs = await runDocker(["logs", "--tail", "50", containerName]).catch(
    () => ({ stdout: "", stderr: "" }),
  );

  throw new Error(
    [
      `Sandbox container did not become healthy within ${HEALTH_TIMEOUT_MS}ms.`,
      lastError instanceof Error ? lastError.message : String(lastError ?? ""),
      logs.stdout,
      logs.stderr,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function requestJson(
  baseUrl: string,
  pathname: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;

  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function runDocker(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
) {
  try {
    return await execFileAsync("docker", args, {
      cwd: options.cwd,
      timeout: options.timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (!isDockerPermissionError(error)) {
      throw annotateDockerError(args, error);
    }

    try {
      return await execFileAsync("sudo", ["-n", "docker", ...args], {
        cwd: options.cwd,
        timeout: options.timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (sudoError) {
      throw annotateDockerError(["sudo", "-n", "docker", ...args], sudoError);
    }
  }
}

function isDockerPermissionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stderr =
    error !== null &&
    typeof error === "object" &&
    "stderr" in error &&
    typeof error.stderr === "string"
      ? error.stderr
      : "";

  return /permission denied/i.test(`${message}\n${stderr}`);
}

function annotateDockerError(args: string[], error: unknown) {
  const stderr =
    error !== null &&
    typeof error === "object" &&
    "stderr" in error &&
    typeof error.stderr === "string"
      ? error.stderr.trim()
      : "";
  const stdout =
    error !== null &&
    typeof error === "object" &&
    "stdout" in error &&
    typeof error.stdout === "string"
      ? error.stdout.trim()
      : "";
  const message = error instanceof Error ? error.message : String(error);

  return new Error(
    [`docker ${args.join(" ")} failed: ${message}`, stdout, stderr]
      .filter(Boolean)
      .join("\n"),
  );
}
