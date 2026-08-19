import { readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Docker from "dockerode";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const IMAGE_TAG = "langfuse-in-app-agent-sandbox:e2e";
const MICROVM_HOOKS_ROOT = "/aws/lambda-microvms/runtime/v1";
const HEALTH_TIMEOUT_MS = 30_000;

type JsonResponse = {
  status: number;
  body: unknown;
};

describe("sandbox runtime docker container", () => {
  const docker = new Docker();
  let container: Docker.Container | undefined;
  let baseUrl = "";

  beforeAll(async () => {
    await buildSandboxImage(docker);

    container = await docker.createContainer({
      Image: IMAGE_TAG,
      name: `langfuse-in-app-agent-sandbox-e2e-${randomUUID().slice(0, 8)}`,
      ExposedPorts: { "5000/tcp": {} },
      HostConfig: {
        PortBindings: {
          "5000/tcp": [{ HostIp: "127.0.0.1", HostPort: "0" }],
        },
      },
    });
    await container.start();

    const inspect = await container.inspect();
    const hostPort = inspect.NetworkSettings.Ports["5000/tcp"]?.[0]?.HostPort;
    if (!hostPort) {
      throw new Error("Docker did not publish sandbox server port 5000");
    }

    baseUrl = `http://127.0.0.1:${hostPort}`;
    await waitForHealth(baseUrl, container);
  }, 300_000);

  afterAll(async () => {
    await container?.remove({ force: true }).catch(() => undefined);
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

async function buildSandboxImage(docker: Docker) {
  const src = [
    "Dockerfile",
    "package.json",
    ...(await listRelativeFiles(path.join(PACKAGE_ROOT, "dist"), "dist")),
  ];
  const stream = await docker.buildImage(
    { context: PACKAGE_ROOT, src },
    { t: IMAGE_TAG },
  );

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function listRelativeFiles(
  absDir: string,
  relativePrefix: string,
): Promise<string[]> {
  const entries = await readdir(absDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${relativePrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(
        ...(await listRelativeFiles(
          path.join(absDir, entry.name),
          relativePath,
        )),
      );
      continue;
    }

    files.push(relativePath);
  }

  return files;
}

async function waitForHealth(baseUrl: string, container: Docker.Container) {
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

  const logs = await container
    .logs({ stdout: true, stderr: true, tail: 50 })
    .catch(() => Buffer.from(""));
  const logText = Buffer.isBuffer(logs)
    ? logs.toString("utf8")
    : await readStreamToString(logs);

  throw new Error(
    [
      `Sandbox container did not become healthy within ${HEALTH_TIMEOUT_MS}ms.`,
      lastError instanceof Error ? lastError.message : String(lastError ?? ""),
      logText,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function readStreamToString(stream: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
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
