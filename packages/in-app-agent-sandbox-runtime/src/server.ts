import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { z } from "zod";

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

const SERVER_PORT = Number(process.env.PORT ?? 5000);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/workspace";
const TOOL_CALLS_ROOT = path.join(WORKSPACE_ROOT, "tool_calls");
const LIFECYCLE_STATE_PATH = path.join(
  WORKSPACE_ROOT,
  ".langfuse-microvm-lifecycle-state.json",
);
const MICROVM_RUNTIME_HOOKS_ROOT = "/aws/lambda-microvms/runtime/v1";
let requestCounter = 0;

const RunHookPayloadSchema = z.object({
  snapshotBucket: z.string().optional(),
  snapshotKey: z.string().optional(),
  snapshotPrefix: z.string().optional(),
  snapshotRegion: z.string().optional(),
});

const LifecycleStateSchema = RunHookPayloadSchema;

type LifecycleState = z.infer<typeof LifecycleStateSchema>;

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

    if (
      request.method === "POST" &&
      request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/ready`
    ) {
      sendJson(response, 200, await readyHook(requestId));
      logSandboxServer("request.end", {
        requestId,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/run`
    ) {
      sendJson(response, 200, await runHook(requestId, request));
      logSandboxServer("request.end", {
        requestId,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/suspend`
    ) {
      sendJson(response, 200, await suspendHook(requestId));
      logSandboxServer("request.end", {
        requestId,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/resume`
    ) {
      sendJson(response, 200, await resumeHook(requestId));
      logSandboxServer("request.end", {
        requestId,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `${MICROVM_RUNTIME_HOOKS_ROOT}/terminate`
    ) {
      sendJson(response, 200, await terminateHook(requestId));
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
    result: summarizeResult(result),
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
    result: summarizeResult(result),
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

  const replaced = current.includes(body.oldText);
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
    result: summarizeResult(result),
  });
  return { result };
}

async function bashOperation(body: BashSandboxOperation, requestId: string) {
  const result = await runCommand(body.command, body.timeoutMs, requestId);
  logSandboxServer("bash.complete", {
    requestId,
    result: summarizeResult(result),
  });
  return { result };
}

async function runHook(requestId: string, request: IncomingMessage) {
  const payload = RunHookPayloadSchema.parse(await readJsonBody(request));
  logSandboxServer("hook.run.start", {
    requestId,
    snapshotBucket: payload.snapshotBucket,
    snapshotKey: payload.snapshotKey,
    snapshotPrefix: payload.snapshotPrefix,
  });

  await ensureWorkspaceRoots();

  const snapshot = await readSnapshotFromS3(payload);
  if (snapshot) {
    await clearWorkspace();
    await extractWorkspaceSnapshot(snapshot);
    logSandboxServer("hook.run.restoredSnapshot", {
      requestId,
      snapshotBytes: snapshot.length,
      snapshotKey: payload.snapshotKey,
    });
  } else {
    logSandboxServer("hook.run.noSnapshot", {
      requestId,
      snapshotKey: payload.snapshotKey,
    });
  }

  await ensureWorkspaceRoots();
  await writeLifecycleState(payload);

  return {
    restoredSnapshot: Boolean(snapshot),
    snapshotBytes: snapshot?.length ?? 0,
  };
}

async function readyHook(requestId: string) {
  await ensureWorkspaceRoots();
  logSandboxServer("hook.ready", { requestId });
  return { ready: true };
}

async function suspendHook(requestId: string) {
  const state = await readLifecycleState();
  logSandboxServer("hook.suspend.start", {
    requestId,
    snapshotBucket: state?.snapshotBucket,
    snapshotKey: state?.snapshotKey,
    snapshotPrefix: state?.snapshotPrefix,
  });

  await ensureWorkspaceRoots();

  if (!state?.snapshotBucket || !state.snapshotKey) {
    logSandboxServer("hook.suspend.noSnapshotConfig", { requestId });
    return { uploadedSnapshot: false, snapshotBytes: 0 };
  }

  const snapshot = await createWorkspaceSnapshot();
  await writeSnapshotToS3(state, snapshot);
  logSandboxServer("hook.suspend.uploadedSnapshot", {
    requestId,
    snapshotBytes: snapshot.length,
    snapshotKey: state.snapshotKey,
  });

  return {
    uploadedSnapshot: true,
    snapshotBytes: snapshot.length,
  };
}

async function resumeHook(requestId: string) {
  await ensureWorkspaceRoots();
  const state = await readLifecycleState();
  logSandboxServer("hook.resume", {
    requestId,
    snapshotKey: state?.snapshotKey,
  });
  return { resumed: true };
}

async function terminateHook(requestId: string) {
  const state = await readLifecycleState();
  logSandboxServer("hook.terminate", {
    requestId,
    snapshotKey: state?.snapshotKey,
  });
  return { terminated: true };
}

async function ensureWorkspaceRoots() {
  await mkdir(WORKSPACE_ROOT, { recursive: true });
  await mkdir(TOOL_CALLS_ROOT, { recursive: true });
}

async function clearWorkspace() {
  const entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of entries) {
    if (entry.name === path.basename(TOOL_CALLS_ROOT)) {
      continue;
    }

    await rm(path.join(WORKSPACE_ROOT, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

async function createWorkspaceSnapshot() {
  return await runBinaryCommand([
    "tar",
    "-C",
    WORKSPACE_ROOT,
    "--exclude=./tool_calls",
    "-cf",
    "-",
    ".",
  ]);
}

async function extractWorkspaceSnapshot(snapshot: Uint8Array) {
  await runBinaryCommand(["tar", "-C", WORKSPACE_ROOT, "-xf", "-"], snapshot);
}

async function writeLifecycleState(
  payload: z.infer<typeof RunHookPayloadSchema>,
) {
  const state = LifecycleStateSchema.parse({
    snapshotBucket: payload.snapshotBucket,
    snapshotKey: payload.snapshotKey,
    snapshotPrefix: payload.snapshotPrefix,
    snapshotRegion: payload.snapshotRegion,
  });

  await writeFile(LIFECYCLE_STATE_PATH, JSON.stringify(state), "utf8");
}

async function readLifecycleState() {
  try {
    return LifecycleStateSchema.parse(
      JSON.parse(await readFile(LIFECYCLE_STATE_PATH, "utf8")) as unknown,
    );
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function readSnapshotFromS3(
  payload: z.infer<typeof RunHookPayloadSchema>,
) {
  if (!payload.snapshotBucket || !payload.snapshotKey) {
    return null;
  }

  const response = await createSnapshotS3Client(payload)
    .send(
      new GetObjectCommand({
        Bucket: payload.snapshotBucket,
        Key: toSnapshotObjectKey(payload.snapshotPrefix, payload.snapshotKey),
      }),
    )
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        return null;
      }

      throw error;
    });

  if (!response?.Body) {
    return null;
  }

  return await response.Body.transformToByteArray();
}

async function writeSnapshotToS3(state: LifecycleState, snapshot: Uint8Array) {
  if (!state.snapshotBucket || !state.snapshotKey) {
    throw new Error("Missing snapshot bucket or key for suspend hook upload");
  }

  await createSnapshotS3Client(state).send(
    new PutObjectCommand({
      Bucket: state.snapshotBucket,
      Key: toSnapshotObjectKey(state.snapshotPrefix, state.snapshotKey),
      Body: snapshot,
      ContentType: "application/x-tar",
    }),
  );
}

function createSnapshotS3Client(
  config: Pick<LifecycleState, "snapshotRegion">,
) {
  return new S3Client({
    ...(config.snapshotRegion ? { region: config.snapshotRegion } : {}),
  });
}

function toSnapshotObjectKey(prefix: string | undefined, key: string) {
  const trimmedPrefix = prefix?.replace(/\/+$/u, "") ?? "";
  return trimmedPrefix ? `${trimmedPrefix}/${key}` : key;
}

function runBinaryCommand(command: string[], stdin?: Uint8Array) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command[0] ?? "", command.slice(1), {
      cwd: WORKSPACE_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      if ((code ?? 1) !== 0) {
        reject(new Error(stderr || `Command failed: ${command.join(" ")}`));
        return;
      }

      resolve(Buffer.concat(stdout));
    });

    child.stdin.end(stdin ? Buffer.from(stdin) : undefined);
  });
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
      command: summarizeText(command),
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

function isMissingFileError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
