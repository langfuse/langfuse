import { describe, expect, it } from "vitest";

import {
  MAX_BASH_TIMEOUT_MS,
  SandboxFileSchema,
  SandboxOperationSchema,
} from "./contracts.js";

describe("SandboxOperationSchema", () => {
  it("accepts each supported sandbox operation", () => {
    expect(
      SandboxOperationSchema.parse({
        operation: "read",
        path: "/workspace/notes.txt",
      }),
    ).toMatchObject({ operation: "read", path: "/workspace/notes.txt" });

    expect(
      SandboxOperationSchema.parse({
        operation: "write",
        path: "output.txt",
        content: "hello",
      }),
    ).toMatchObject({
      operation: "write",
      path: "output.txt",
      content: "hello",
    });

    expect(
      SandboxOperationSchema.parse({
        operation: "edit",
        path: "output.txt",
        oldText: "hello",
        newText: "hello world",
      }),
    ).toMatchObject({
      operation: "edit",
      oldText: "hello",
      newText: "hello world",
    });

    expect(
      SandboxOperationSchema.parse({
        operation: "bash",
        command: "echo hi",
        timeoutMs: 1_000,
      }),
    ).toMatchObject({
      operation: "bash",
      command: "echo hi",
      timeoutMs: 1_000,
    });
  });

  it("defaults an omitted bash timeout so the runtime always arms a kill timer", () => {
    // `bashOperation` forwards `body.timeoutMs` directly to `runCommand`, which
    // arms its kill timer only when that value is defined. Parsing must supply a
    // finite default, otherwise a long-running command is never terminated.
    expect(
      SandboxOperationSchema.parse({
        operation: "bash",
        command: "while true; do sleep 1; done",
      }),
    ).toMatchObject({ operation: "bash", timeoutMs: MAX_BASH_TIMEOUT_MS });

    // Control: an explicit caller value is respected unchanged.
    expect(
      SandboxOperationSchema.parse({
        operation: "bash",
        command: "sleep 1",
        timeoutMs: 200,
      }),
    ).toMatchObject({ operation: "bash", timeoutMs: 200 });
  });

  it("accepts optional toolCallFiles on operations", () => {
    const parsed = SandboxOperationSchema.parse({
      operation: "bash",
      command: "cat /workspace/tool_calls/note.txt",
      toolCallFiles: [
        {
          path: "/workspace/tool_calls/note.txt",
          content: "prior tool output",
        },
      ],
    });

    expect(parsed.toolCallFiles).toEqual([
      {
        path: "/workspace/tool_calls/note.txt",
        content: "prior tool output",
      },
    ]);
  });

  it("rejects unknown operations and invalid bash timeouts", () => {
    expect(
      SandboxOperationSchema.safeParse({
        operation: "delete",
        path: "/workspace/notes.txt",
      }).success,
    ).toBe(false);

    expect(
      SandboxOperationSchema.safeParse({
        operation: "bash",
        command: "echo hi",
        timeoutMs: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);

    for (const timeoutMs of [0, -1, 1.5, 120_001, 2 ** 31]) {
      expect(
        SandboxOperationSchema.safeParse({
          operation: "bash",
          command: "echo hi",
          timeoutMs,
        }).success,
      ).toBe(false);
    }

    expect(
      SandboxOperationSchema.safeParse({
        operation: "bash",
        command: "echo hi",
        timeoutMs: 120_000,
      }).success,
    ).toBe(true);

    expect(
      SandboxFileSchema.safeParse({ path: "/workspace/a.txt" }).success,
    ).toBe(false);
  });
});
