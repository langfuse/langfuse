// Never use fixed delays to establish operation ordering in these tests.
// Synchronize through observable state; timeouts are failure bounds only.
import { readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Docker from "dockerode";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  let container: Docker.Container;
  let baseUrl = "";

  beforeAll(async () => {
    await buildSandboxImage(docker);
  }, 300_000);

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await container.remove({ force: true }).catch(() => undefined);
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

      const sensitiveFileContent = "customer-read-content-must-not-be-logged";
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "write",
          path: "sensitive.txt",
          content: sensitiveFileContent,
        }),
      });
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "read",
          path: "sensitive.txt",
        }),
      });

      const sensitiveOldText = "customer-edit-old-text-must-not-be-logged";
      const sensitiveNewText = "customer-edit-new-text-must-not-be-logged";
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "write",
          path: "edit-sensitive.txt",
          content: sensitiveOldText,
        }),
      });
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "edit",
          path: "edit-sensitive.txt",
          oldText: sensitiveOldText,
          newText: sensitiveNewText,
        }),
      });

      const sensitiveToolCallContent =
        "customer-tool-call-content-must-not-be-logged";
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: "true",
          toolCallFiles: [
            {
              path: "/workspace/tool_calls/sensitive.txt",
              content: sensitiveToolCallContent,
            },
          ],
        }),
      });

      const sensitiveCommand =
        "printf customer-stdout-must-not-be-logged; printf customer-stderr-must-not-be-logged >&2 # customer-command-must-not-be-logged";
      await requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: sensitiveCommand,
        }),
      });

      const logs = await getContainerLogs(container!);
      expect(logs).not.toContain(sensitiveFileContent);
      expect(logs).not.toContain(sensitiveOldText);
      expect(logs).not.toContain(sensitiveNewText);
      expect(logs).not.toContain(sensitiveToolCallContent);
      expect(logs).not.toContain("customer-command-must-not-be-logged");
      expect(logs).not.toContain("customer-stdout-must-not-be-logged");
      expect(logs).not.toContain("customer-stderr-must-not-be-logged");
      expect(logs).toContain(
        `"contentBytes":${Buffer.byteLength(sensitiveFileContent, "utf8")}`,
      );
      expect(logs).toContain(
        `"oldTextLength":${sensitiveOldText.length},"newTextLength":${sensitiveNewText.length}`,
      );
      expect(logs).toContain(
        `"commandBytes":${Buffer.byteLength(sensitiveCommand, "utf8")}`,
      );
      expect(logs).toContain(
        `"stdoutBytes":${Buffer.byteLength("customer-stdout-must-not-be-logged", "utf8")}`,
      );
      expect(logs).toContain(
        `"stderrBytes":${Buffer.byteLength("customer-stderr-must-not-be-logged", "utf8")}`,
      );

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

  it(
    "queues concurrent sandbox operations in request order",
    { timeout: 60_000 },
    async () => {
      const first = requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command: [
            "rm -f queue-active queue-release queue-order.txt",
            "touch queue-active",
            "while [ ! -e queue-release ]; do sleep 0.05; done",
            "printf 'first\\n' >> queue-order.txt",
            "rm queue-active",
          ].join("; "),
        }),
      });
      void first.catch(() => undefined);
      let second: Promise<JsonResponse> | undefined;

      try {
        await waitForContainerFile(container, "/workspace/queue-active");

        second = requestJson(baseUrl, "/sandbox", {
          method: "POST",
          body: JSON.stringify({
            operation: "bash",
            command: [
              "test ! -e queue-active",
              "printf 'second\\n' >> queue-order.txt",
            ].join("; "),
          }),
        });
        void second.catch(() => undefined);

        const releaseExec = await container.exec({
          Cmd: ["touch", "/workspace/queue-release"],
        });
        await readStreamToString(await releaseExec.start({}));

        const [firstResponse, secondResponse] = await Promise.all([
          first,
          second,
        ]);
        expect(firstResponse).toEqual({
          status: 200,
          body: { result: expect.objectContaining({ exitCode: 0 }) },
        });
        expect(secondResponse).toEqual({
          status: 200,
          body: { result: expect.objectContaining({ exitCode: 0 }) },
        });

        const order = await requestJson(baseUrl, "/sandbox", {
          method: "POST",
          body: JSON.stringify({
            operation: "read",
            path: "queue-order.txt",
          }),
        });
        expect(order).toEqual({
          status: 200,
          body: {
            result: {
              path: "/workspace/queue-order.txt",
              content: "first\nsecond\n",
            },
          },
        });
      } finally {
        let released = false;
        try {
          const releaseExec = await container.exec({
            Cmd: ["touch", "/workspace/queue-release"],
          });
          await readStreamToString(await releaseExec.start({}));
          released = true;
        } catch {
          // Teardown will reject the already-observed requests if release failed.
        }
        if (released) {
          await Promise.allSettled(second ? [first, second] : [first]);
        }
      }

      const timedOut = requestJson(baseUrl, "/sandbox", {
        method: "POST",
        body: JSON.stringify({
          operation: "bash",
          command:
            "setsid sh -c 'echo $$ > timeout-process.pid; sleep 10' & wait",
          timeoutMs: 200,
        }),
      });
      void timedOut.catch(() => undefined);
      let afterTimeout: Promise<JsonResponse> | undefined;

      try {
        await waitForContainerFile(container, "/workspace/timeout-process.pid");

        afterTimeout = requestJson(baseUrl, "/sandbox", {
          method: "POST",
          body: JSON.stringify({
            operation: "bash",
            command: [
              "test -d /proc/$(cat timeout-process.pid)",
              "printf 'continued\\n' > after-timeout.txt",
            ].join(" && "),
          }),
        });
        void afterTimeout.catch(() => undefined);

        const [timedOutResponse, afterTimeoutResponse] = await Promise.all([
          timedOut,
          afterTimeout,
        ]);
        expect(timedOutResponse).toEqual({
          status: 200,
          body: { result: expect.objectContaining({ exitCode: 124 }) },
        });
        expect(afterTimeoutResponse).toEqual({
          status: 200,
          body: { result: expect.objectContaining({ exitCode: 0 }) },
        });
      } finally {
        await Promise.allSettled(
          afterTimeout ? [timedOut, afterTimeout] : [timedOut],
        );
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

  const logText = await getContainerLogs(container);

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

async function waitForContainerFile(
  container: Docker.Container,
  filePath: string,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    const exec = await container.exec({ Cmd: ["test", "-e", filePath] });
    await readStreamToString(await exec.start({}));
    if ((await exec.inspect()).ExitCode === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Container file did not appear: ${filePath}`);
}

async function getContainerLogs(container: Docker.Container) {
  const logs = await container
    .logs({ stdout: true, stderr: true, tail: 50 })
    .catch(() => Buffer.from(""));
  return Buffer.isBuffer(logs)
    ? logs.toString("utf8")
    : await readStreamToString(logs);
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
