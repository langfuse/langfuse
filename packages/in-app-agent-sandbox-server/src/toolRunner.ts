import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  SandboxOperationSchema,
  type BashSandboxOperation,
  type EditSandboxOperation,
  type ReadSandboxOperation,
  type WriteSandboxOperation,
} from "./contracts.js";

type BashResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
};

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/workspace";

void main();

async function main() {
  try {
    const body = SandboxOperationSchema.parse(await readJsonFromStdin());

    switch (body.operation) {
      case "read":
        process.stdout.write(JSON.stringify(await readOperation(body)));
        return;
      case "write":
        process.stdout.write(JSON.stringify(await writeOperation(body)));
        return;
      case "edit":
        process.stdout.write(JSON.stringify(await editOperation(body)));
        return;
      case "bash":
        process.stdout.write(JSON.stringify(await bashOperation(body)));
        return;
    }
  } catch (error) {
    process.stderr.write(
      error instanceof Error ? error.message : "Unknown tool runner error",
    );
    process.exit(1);
  }
}

async function readOperation(body: ReadSandboxOperation) {
  const filePath = resolveSandboxPath(body.path);

  try {
    const content = await readFile(filePath, "utf8");
    return { path: filePath, content };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { path: filePath, content: null };
    }

    throw error;
  }
}

async function writeOperation(body: WriteSandboxOperation) {
  const filePath = resolveSandboxPath(body.path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body.content, "utf8");

  return {
    path: filePath,
    bytesWritten: Buffer.byteLength(body.content, "utf8"),
  };
}

async function editOperation(body: EditSandboxOperation) {
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

  return { path: filePath, replaced };
}

async function bashOperation(body: BashSandboxOperation) {
  return await runCommand(body.command, body.timeoutMs);
}

function runCommand(command: string, timeoutMs?: number) {
  return new Promise<BashResult>((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], { cwd: WORKSPACE_ROOT });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const startedAt = new Date().toISOString();

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
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

async function readJsonFromStdin() {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? (JSON.parse(input) as unknown) : {};
}

function isMissingFileError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
