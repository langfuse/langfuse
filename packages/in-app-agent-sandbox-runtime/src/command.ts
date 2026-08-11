import { spawn } from "node:child_process";

export function runCommand(
  command: string,
  timeoutMs: number | undefined,
  requestId: string,
  cwd = "/workspace",
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    startedAt: string;
    completedAt: string;
  }>((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], {
      cwd,
      detached: true,
    });
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
            killProcessGroup(child);
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

function killProcessGroup(child: ReturnType<typeof spawn>) {
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      child.kill("SIGKILL");
    }
  }
}

function isNoSuchProcessError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function logSandboxServer(event: string, details?: Record<string, unknown>) {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[sandbox] ${new Date().toISOString()} ${event}${payload}`);
}
