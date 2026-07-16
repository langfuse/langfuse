import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

const SERVER_PORT = 5000;
const WORKSPACE_ROOT = "/workspace";
const TOOL_CALLS_ROOT = path.join(WORKSPACE_ROOT, "tool_calls");
const MICROVM_RUNTIME_HOOKS_ROOT = "/aws/lambda-microvms/runtime/v1";
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;
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

    const result = await routeRequest(request, requestId);
    sendJson(response, result.statusCode, result.body);
    logSandboxServer("request.end", {
      requestId,
      statusCode: result.statusCode,
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
    logSandboxServer("request.end", {
      requestId,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
    });
  }
});

server.listen(SERVER_PORT, () => {
  logSandboxServer("server.listening", {
    port: SERVER_PORT,
    workspaceRoot: WORKSPACE_ROOT,
  });
});

async function syncToolCallFiles(toolCallFiles: unknown, requestId: string) {
  await rm(TOOL_CALLS_ROOT, { recursive: true, force: true });
  await mkdir(TOOL_CALLS_ROOT, { recursive: true });

  if (!toolCallFiles) {
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
  }
}

async function routeRequest(request: IncomingMessage, requestId: string) {
  if (request.method === "GET" && request.url === "/health") {
    logSandboxServer("health.ok", { requestId });
    return { statusCode: 200, body: { status: "ok" } };
  }

  if (
    request.method === "POST" &&
    request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/ready`
  ) {
    return { statusCode: 200, body: await readyHook(requestId) };
  }

  if (
    request.method === "POST" &&
    request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/run`
  ) {
    return { statusCode: 200, body: await runHook(requestId, request) };
  }

  if (
    request.method === "POST" &&
    request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/suspend`
  ) {
    return { statusCode: 200, body: await suspendHook(requestId) };
  }

  if (
    request.method === "POST" &&
    request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/resume`
  ) {
    return { statusCode: 200, body: await resumeHook(requestId) };
  }

  if (
    request.method === "POST" &&
    request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/terminate`
  ) {
    return { statusCode: 200, body: await terminateHook(requestId) };
  }

  if (request.method === "POST" && request.url === "/sandbox") {
    const body = SandboxOperationSchema.parse(await readJsonBody(request));
    logSandboxServer("sandbox.request", {
      requestId,
      operation: summarizeOperation(body),
    });
    await syncToolCallFiles(body.toolCallFiles, requestId);

    if (body.operation === "read") {
      return { statusCode: 200, body: await readOperation(body, requestId) };
    }

    if (body.operation === "write") {
      return { statusCode: 200, body: await writeOperation(body, requestId) };
    }

    if (body.operation === "edit") {
      return { statusCode: 200, body: await editOperation(body, requestId) };
    }

    return { statusCode: 200, body: await bashOperation(body, requestId) };
  }

  return { statusCode: 404, body: { error: "Not found" } };
}

async function readOperation(body: ReadSandboxOperation, requestId: string) {
  const filePath = resolveSandboxPath(body.path);
  let content: string | null;

  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    content = null;
  }

  const result = { path: filePath, content };
  logSandboxServer("read.complete", {
    requestId,
    path: body.path,
    result,
  });
  return { result };
}

async function writeOperation(body: WriteSandboxOperation, requestId: string) {
  const filePath = resolveSandboxPath(body.path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body.content, "utf8");

  const result = {
    path: filePath,
    bytesWritten: Buffer.byteLength(body.content, "utf8"),
  };
  logSandboxServer("write.complete", {
    requestId,
    path: body.path,
    result,
  });
  return { result };
}

async function editOperation(body: EditSandboxOperation, requestId: string) {
  const filePath = resolveSandboxPath(body.path);
  let current = "";

  try {
    current = await readFile(filePath, "utf8");
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const firstMatch = current.indexOf(body.oldText);
  const replaced = firstMatch !== -1;
  if (
    replaced &&
    current.indexOf(body.oldText, firstMatch + body.oldText.length) !== -1
  ) {
    throw new Error(`Sandbox edit target is ambiguous: ${body.path}`);
  }

  if (replaced) {
    await writeFile(
      filePath,
      current.replace(body.oldText, body.newText),
      "utf8",
    );
  }

  const result = { path: filePath, replaced };
  logSandboxServer("edit.complete", {
    requestId,
    path: body.path,
    result,
  });
  return { result };
}

async function bashOperation(body: BashSandboxOperation, requestId: string) {
  const result = await runCommand(body.command, body.timeoutMs, requestId);
  logSandboxServer("bash.complete", {
    requestId,
    result,
  });
  return { result };
}

async function runHook(requestId: string, request: IncomingMessage) {
  await readJsonBody(request);

  logSandboxServer("hook.run.start", {
    requestId,
  });

  await ensureWorkspaceRoots();

  return { ready: true };
}

async function readyHook(requestId: string) {
  await ensureWorkspaceRoots();
  logSandboxServer("hook.ready", { requestId });
  return { ready: true };
}

async function suspendHook(requestId: string) {
  await ensureWorkspaceRoots();
  logSandboxServer("hook.suspend.start", {
    requestId,
  });

  return { suspended: true };
}

async function resumeHook(requestId: string) {
  await ensureWorkspaceRoots();
  logSandboxServer("hook.resume", {
    requestId,
  });
  return { resumed: true };
}

async function terminateHook(requestId: string) {
  await ensureWorkspaceRoots();
  logSandboxServer("hook.terminate.start", {
    requestId,
  });

  return { terminated: true };
}

async function ensureWorkspaceRoots() {
  await mkdir(WORKSPACE_ROOT, { recursive: true });
  await mkdir(TOOL_CALLS_ROOT, { recursive: true });
}

function runCommand(
  command: string,
  timeoutMs: number | undefined,
  requestId: string,
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    startedAt: string;
    completedAt: string;
  }>((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], { cwd: WORKSPACE_ROOT });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    logSandboxServer("bash.start", {
      requestId,
      pid: child.pid ?? null,
      command,
      timeoutMs: timeoutMs ?? null,
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      logSandboxServer("bash.error", {
        requestId,
        pid: child.pid ?? null,
        durationMs: Date.now() - startedAtMs,
        error: error.message,
      });
      reject(error);
    });

    const timeoutId =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (settled) {
              return;
            }

            settled = true;
            child.kill("SIGKILL");
            resolve({
              stdout,
              stderr: `${stderr}Sandbox command timed out after ${timeoutMs}ms`,
              exitCode: 124,
              startedAt,
              completedAt: new Date().toISOString(),
            });
          }, timeoutMs);

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      logSandboxServer("bash.processComplete", {
        requestId,
        pid: child.pid ?? null,
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAtMs,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
      });

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
  });
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
        command: body.command,
      };
  }
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
    let bytesRead = 0;
    let rejected = false;

    request.on("data", (chunk: Buffer | string) => {
      if (rejected) {
        return;
      }

      bytesRead += Buffer.byteLength(chunk);
      if (bytesRead > MAX_REQUEST_BODY_BYTES) {
        rejected = true;
        reject(
          new Error(
            `Sandbox request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`,
          ),
        );
        request.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      if (rejected) {
        return;
      }

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

function isMissingFileError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
