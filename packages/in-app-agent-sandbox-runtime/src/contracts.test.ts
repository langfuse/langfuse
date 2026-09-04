import { describe, expect, it } from "vitest";

import { SandboxFileSchema, SandboxOperationSchema } from "./contracts.js";

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

    expect(
      SandboxFileSchema.safeParse({ path: "/workspace/a.txt" }).success,
    ).toBe(false);
  });
});
