import { spawn } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import {
  SandboxFileSchema,
  SandboxOperationSchema,
  type BashSandboxOperation,
  type EditSandboxOperation,
  type ReadSandboxOperation,
  type SandboxFile,
  type SandboxOperation,
  type WriteSandboxOperation,
} from "./contracts.js";

const BRIDGE_PORT = Number(process.env.PORT ?? 5000);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/workspace";
const TOOL_CALLS_ROOT = path.join(WORKSPACE_ROOT, "tool_calls");
const TOOL_RUNNER_PATH = "/app/dist/toolRunner.js";
const TOOL_RUNNER_USER = "sandbox-tool";
const TOOL_RUNNER_GROUP = "sandbox-tool";
let requestCounter = 0;

const server = createServer(async (request, response) => {
  const requestId = `req-${++requestCounter}`;
  const startedAt = Date.now();

  try {
    logSandboxServer("request.start", {
      requestId,
      method: request.method ?? "UNKNOWN",
      url: request.url ?? "",
    });

    if (request.method === "GET" && request.url === "/health") {
      logSandboxServer("health.ok", { requestId });
      sendJson(response, 200, { status: "ok" });
      logSandboxServer("request.end", {
        requestId,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (request.method === "POST" && request.url === "/sandbox") {
      const body = SandboxOperationSchema.parse(await readJsonBody(request));
      logSandboxServer("sandbox.request", {
        requestId,
        operation: summarizeOperation(body),
      });
      await syncToolCallFiles(body.toolCallFiles, requestId);

      switch (body.operation) {
        case "read":
          sendJson(response, 200, await readOperation(body, requestId));
          logSandboxServer("request.end", {
            requestId,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
          });
          return;
        case "write":
          sendJson(response, 200, await writeOperation(body, requestId));
          logSandboxServer("request.end", {
            requestId,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
          });
          return;
        case "edit":
          sendJson(response, 200, await editOperation(body, requestId));
          logSandboxServer("request.end", {
            requestId,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
          });
          return;
        case "bash":
          sendJson(response, 200, await bashOperation(body, requestId));
          logSandboxServer("request.end", {
            requestId,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
          });
          return;
      }
    }

    sendJson(response, 404, { error: "Not found" });
    logSandboxServer("request.end", {
      requestId,
      statusCode: 404,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logSandboxServer("request.error", {
      requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(response, 500, {
      error:
        error instanceof Error ? error.message : "Unknown sandbox server error",
    });
  }
});

server.listen(BRIDGE_PORT, () => {
  logSandboxServer("server.listening", {
    port: BRIDGE_PORT,
    workspaceRoot: WORKSPACE_ROOT,
    toolRunnerPath: TOOL_RUNNER_PATH,
    toolRunnerUser: TOOL_RUNNER_USER,
  });
});

async function syncToolCallFiles(toolCallFiles: unknown, requestId: string) {
  await rm(TOOL_CALLS_ROOT, { recursive: true, force: true });
  await mkdir(TOOL_CALLS_ROOT, { recursive: true });

  if (!toolCallFiles) {
    await chmod(TOOL_CALLS_ROOT, 0o555);
    logSandboxServer("toolCalls.sync", { requestId, fileCount: 0 });
    return;
  }

  const files: SandboxFile[] = SandboxFileSchema.array().parse(toolCallFiles);
  logSandboxServer("toolCalls.sync", {
    requestId,
    fileCount: files.length,
    paths: files.map((file) => file.path),
  });

  for (const file of files) {
    const filePath = resolveSandboxPath(file.path);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
    await chmod(filePath, 0o444);
    await chmodToolCallsDirectories(path.dirname(filePath));
  }

  await chmod(TOOL_CALLS_ROOT, 0o555);
}

async function readOperation(body: ReadSandboxOperation, requestId: string) {
  const result = await runToolOperation(body, requestId);
  logSandboxServer("read.complete", {
    requestId,
    path: body.path,
    result: summarizeResult(result),
  });
  return { result };
}

async function writeOperation(body: WriteSandboxOperation, requestId: string) {
  const result = await runToolOperation(body, requestId);
  logSandboxServer("write.complete", {
    requestId,
    path: body.path,
    result: summarizeResult(result),
  });
  return { result };
}

async function editOperation(body: EditSandboxOperation, requestId: string) {
  const result = await runToolOperation(body, requestId);
  logSandboxServer("edit.complete", {
    requestId,
    path: body.path,
    result: summarizeResult(result),
  });
  return { result };
}

async function bashOperation(body: BashSandboxOperation, requestId: string) {
  const result = await runToolOperation(body, requestId);
  logSandboxServer("bash.complete", {
    requestId,
    result: summarizeResult(result),
  });
  return { result };
}

function runToolOperation(operation: SandboxOperation, requestId: string) {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(
      "sudo",
      [
        "-n",
        "-u",
        TOOL_RUNNER_USER,
        "-g",
        TOOL_RUNNER_GROUP,
        "node",
        TOOL_RUNNER_PATH,
      ],
      { cwd: WORKSPACE_ROOT },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    let stdinError: Error | null = null;
    const startedAt = Date.now();

    const fail = (error: Error, logEvent: string) => {
      if (settled) {
        return;
      }

      settled = true;
      logSandboxServer(logEvent, {
        requestId,
        pid: child.pid ?? null,
        operation: summarizeOperation(operation),
        durationMs: Date.now() - startedAt,
        error: error.message,
      });
      reject(error);
    };

    logSandboxServer("toolRunner.start", {
      requestId,
      pid: child.pid ?? null,
      operation: summarizeOperation(operation),
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      fail(error, "toolRunner.error");
    });
    child.stdin.on("error", (error) => {
      stdinError = error;
      const errorCode = "code" in error ? error.code : undefined;

      if (errorCode === "EPIPE") {
        logSandboxServer("toolRunner.stdinClosed", {
          requestId,
          pid: child.pid ?? null,
          operation: summarizeOperation(operation),
          durationMs: Date.now() - startedAt,
          error: error.message,
        });
        return;
      }

      fail(error, "toolRunner.stdinError");
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      logSandboxServer("toolRunner.complete", {
        requestId,
        pid: child.pid ?? null,
        operation: summarizeOperation(operation),
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
      });

      if (stdinError !== null && (code ?? 1) === 0) {
        reject(stdinError);
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(
          new Error(
            stderr ||
              stdout ||
              stdinError?.message ||
              "Sandbox tool runner failed",
          ),
        );
        return;
      }

      try {
        resolve(stdout ? (JSON.parse(stdout) as unknown) : null);
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(operation));
  });
}

async function chmodToolCallsDirectories(startPath: string) {
  let currentPath = startPath;

  while (
    currentPath === TOOL_CALLS_ROOT ||
    currentPath.startsWith(`${TOOL_CALLS_ROOT}${path.sep}`)
  ) {
    await chmod(currentPath, 0o555);

    if (currentPath === TOOL_CALLS_ROOT) {
      return;
    }

    currentPath = path.dirname(currentPath);
  }
}

function logSandboxServer(event: string, details?: Record<string, unknown>) {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[sandbox] ${new Date().toISOString()} ${event}${payload}`);
}

function summarizeOperation(body: SandboxOperation) {
  switch (body.operation) {
    case "read":
      return { operation: body.operation, path: body.path };
    case "write":
      return {
        operation: body.operation,
        path: body.path,
        contentBytes: Buffer.byteLength(body.content, "utf8"),
      };
    case "edit":
      return {
        operation: body.operation,
        path: body.path,
        oldTextLength: body.oldText.length,
        newTextLength: body.newText.length,
      };
    case "bash":
      return {
        operation: body.operation,
        timeoutMs: body.timeoutMs ?? null,
        command: summarizeText(body.command),
      };
  }
}

function summarizeResult(result: unknown) {
  if (result === null || typeof result !== "object") {
    return result;
  }

  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => {
      if (typeof value === "string") {
        return [key, summarizeText(value)];
      }

      return [key, value];
    }),
  );
}

function summarizeText(text: string, maxLength = 500) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function resolveSandboxPath(requestPath: string) {
  const candidate = path.isAbsolute(requestPath)
    ? requestPath
    : path.join(WORKSPACE_ROOT, requestPath);
  const normalized = path.resolve(candidate);

  if (
    normalized === WORKSPACE_ROOT ||
    normalized.startsWith(`${WORKSPACE_ROOT}${path.sep}`)
  ) {
    return normalized;
  }

  throw new Error(`Sandbox path escapes workspace: ${requestPath}`);
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let body = "";

    request.on("data", (chunk: Buffer | string) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as unknown) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}
