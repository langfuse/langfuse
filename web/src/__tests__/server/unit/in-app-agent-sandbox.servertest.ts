import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { getSandboxToolCallFiles } from "@/src/ee/features/in-app-agent/server/persistence";
import { createInAppAgentSandbox } from "@/src/ee/features/in-app-agent/server/sandbox";

describe("in-app agent sandbox", () => {
  it("persists sandbox session state when a turn ends", async () => {
    const sandboxSession = {
      async syncReadonlyFiles() {},
      async read() {
        return { path: "notes.txt", content: null };
      },
      async write() {
        return { path: "notes.txt", bytesWritten: 0 };
      },
      async edit() {
        return { path: "notes.txt", replaced: false };
      },
      async bash() {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    };
    const provider = {
      async ensureSession() {
        return { sessionId: "session-1", sandbox: sandboxSession };
      },
    };
    const savedStates: Array<Record<string, unknown>> = [];
    const sandbox = await createInAppAgentSandbox({
      conversationId: "conversation-1",
      projectId: "project-1",
      provider,
      getToolCallFiles: async () => [],
      saveState: async (state) => {
        savedStates.push(state);
      },
    });

    await sandbox.sandbox.write({ path: "notes.txt", content: "hello" });
    await sandbox.onTurnEnded();

    expect(savedStates[0]).toEqual({
      providerSessionId: "session-1",
    });
    expect(savedStates[1]).toEqual({
      providerSessionId: "session-1",
    });
  });

  it("exports prior non-sandbox tool calls into tool_calls files", () => {
    const files = getSandboxToolCallFiles([
      {
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-1",
          toolCallName: "langfuse_getHealth",
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.100Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-1",
          delta: '{"projectId":"project-1"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.200Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-1",
          content: '{"status":"ok"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.000Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-2",
          toolCallName: "read",
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.100Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-2",
          delta: '{"path":"tool_calls/file.json"}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:01.200Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-2",
          content: '{"content":"ignored"}',
        },
      },
    ]);

    expect(files).toEqual([
      {
        path: "tool_calls/2026-07-02T12-00-00.000Z_langfuse_getHealth_tool-call-1.json",
        content: JSON.stringify(
          {
            request: { projectId: "project-1" },
            response: { status: "ok" },
            error: null,
          },
          null,
          2,
        ),
      },
    ]);
  });

  it("keeps repeated same-name tool calls with identical timestamps", () => {
    const createdAt = new Date("2026-07-02T12:00:00.000Z");
    const files = getSandboxToolCallFiles([
      {
        createdAt,
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-1",
          toolCallName: "langfuse_getHealth",
        },
      },
      {
        createdAt,
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-1",
          content: '{"status":"ok"}',
        },
      },
      {
        createdAt,
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-2",
          toolCallName: "langfuse_getHealth",
        },
      },
      {
        createdAt,
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-2",
          content: '{"status":"ok"}',
        },
      },
    ]);

    expect(files.map((file) => file.path)).toEqual([
      "tool_calls/2026-07-02T12-00-00.000Z_langfuse_getHealth_tool-call-1.json",
      "tool_calls/2026-07-02T12-00-00.000Z_langfuse_getHealth_tool-call-2.json",
    ]);
  });
});
