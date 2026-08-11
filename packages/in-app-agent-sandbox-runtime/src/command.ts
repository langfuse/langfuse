import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

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
            killProcessTree(child);
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

function killProcessTree(child: ReturnType<typeof spawn>) {
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    return;
  }

  stopProcessGroup(child.pid);
  const descendantPids = getDescendantProcessIds(child.pid);
  for (const pid of descendantPids.reverse()) {
    killProcess(pid);
  }
  killProcessGroup(child);
}

function stopProcessGroup(pid: number) {
  try {
    process.kill(-pid, "SIGSTOP");
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      logSignalError("bash.stopProcessGroupError", pid, error);
    }
  }
}

function getDescendantProcessIds(rootPid: number) {
  const childrenByParent = new Map<number, number[]>();
  const entries = readProcessEntries();

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }

    const pid = Number(entry.name);
    try {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      const parentPid = Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
      if (!Number.isInteger(parentPid)) {
        continue;
      }

      const children = childrenByParent.get(parentPid) ?? [];
      children.push(pid);
      childrenByParent.set(parentPid, children);
    } catch {
      // Processes can exit while /proc is being scanned.
    }
  }

  const descendantPids: number[] = [];
  const pendingParentPids = [rootPid];
  const seenPids = new Set(pendingParentPids);
  while (pendingParentPids.length > 0) {
    const parentPid = pendingParentPids.pop();
    if (parentPid === undefined) {
      break;
    }

    for (const childPid of childrenByParent.get(parentPid) ?? []) {
      if (seenPids.has(childPid)) {
        continue;
      }

      seenPids.add(childPid);
      descendantPids.push(childPid);
      pendingParentPids.push(childPid);
    }
  }

  return descendantPids;
}

function readProcessEntries() {
  try {
    return readdirSync("/proc", { withFileTypes: true });
  } catch {
    return [];
  }
}

function killProcess(pid: number) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      logSignalError("bash.killDescendantError", pid, error);
    }
  }
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

function logSignalError(event: string, pid: number, error: unknown) {
  logSandboxServer(event, {
    pid,
    error: error instanceof Error ? error.message : String(error),
  });
}

function isNoSuchProcessError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function logSandboxServer(event: string, details?: Record<string, unknown>) {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[sandbox] ${new Date().toISOString()} ${event}${payload}`);
}
