import { describe, expect, it } from "vitest";

import {
  summarizeBashResult,
  summarizeOperation,
  summarizeReadResult,
} from "./logging.js";

describe("sandbox log metadata", () => {
  it("does not include file contents or bash commands and output", () => {
    const readContent = "customer-file-content";
    const command = "printf customer-command";
    const stdout = "customer-stdout";
    const stderr = "customer-stderr";

    const metadata = JSON.stringify({
      read: summarizeReadResult("/workspace/file.txt", readContent),
      operation: summarizeOperation({
        operation: "bash",
        command,
        timeoutMs: 1_000,
      }),
      bash: summarizeBashResult({
        stdout,
        stderr,
        exitCode: 0,
        startedAt: "2026-08-19T00:00:00.000Z",
        completedAt: "2026-08-19T00:00:01.000Z",
      }),
    });

    expect(metadata).not.toContain(readContent);
    expect(metadata).not.toContain(command);
    expect(metadata).not.toContain(stdout);
    expect(metadata).not.toContain(stderr);
    expect(JSON.parse(metadata)).toEqual({
      read: {
        path: "/workspace/file.txt",
        found: true,
        contentBytes: Buffer.byteLength(readContent, "utf8"),
      },
      operation: {
        operation: "bash",
        timeoutMs: 1_000,
        commandBytes: Buffer.byteLength(command, "utf8"),
      },
      bash: {
        exitCode: 0,
        startedAt: "2026-08-19T00:00:00.000Z",
        completedAt: "2026-08-19T00:00:01.000Z",
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
      },
    });
  });
});
