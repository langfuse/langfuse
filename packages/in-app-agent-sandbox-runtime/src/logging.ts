import type { SandboxOperation } from "./contracts.js";

type BashResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  completedAt: string;
};

export function summarizeReadResult(path: string, content: string | null) {
  return {
    path,
    found: content !== null,
    contentBytes: content === null ? 0 : Buffer.byteLength(content, "utf8"),
  };
}

export function summarizeBashResult(result: BashResult) {
  return {
    exitCode: result.exitCode,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
    stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
  };
}

export function summarizeOperation(body: SandboxOperation) {
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
        commandBytes: Buffer.byteLength(body.command, "utf8"),
      };
  }
}
