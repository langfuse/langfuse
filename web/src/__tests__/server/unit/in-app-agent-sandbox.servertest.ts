import { EventType } from "@ag-ui/core";
import { standardSchemaToJSONSchema } from "@mastra/core/schema";
import { Tool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createSandboxToolCallFileAccumulator,
  getConversationMessagesForDisplay,
  getSandboxToolCallFiles,
} from "@langfuse/shared/in-app-agent/server/persistence";
import { createInAppAgentSandbox } from "@langfuse/shared/in-app-agent/server/sandbox";
import { withOptionalSilentMcpOutput } from "@langfuse/shared/in-app-agent/server/tools";
import { listObservationsTool } from "@/src/features/mcp/features/observations/tools/listObservations";

describe("in-app agent sandbox", () => {
  it("redacts silent MCP output from persisted conversation display", async () => {
    const silentResult = JSON.stringify({
      type: "silent-mcp-output",
      output: { data: [{ id: "observation-1" }] },
    });
    const events = [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-call-1",
        toolCallName: "listObservations",
        parentMessageId: "assistant-1",
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: "{}",
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: "tool-call-1",
      },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: "result-1",
        toolCallId: "tool-call-1",
        content: silentResult,
        role: "tool",
      },
    ];
    const messages = await getConversationMessagesForDisplay({
      prisma: {
        inAppAgentEvent: {
          findMany: async () =>
            events.map((event) => ({
              event,
              runId: "run-1",
              createdAt: new Date("2026-07-27T10:00:00.000Z"),
            })),
        },
      } as never,
      projectId: "project-1",
      conversationId: "conversation-1",
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        role: "tool",
        content: "Output saved to /workspace/tool_calls",
      }),
    );
    expect(events[3]?.content).toBe(silentResult);
  });

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

  it("syncs same-turn silent tool output into sandbox tool-call files", async () => {
    const files = new Map<string, string>();
    const toolCallFiles = createSandboxToolCallFileAccumulator([]);
    const sandbox = await createInAppAgentSandbox({
      conversationId: "conversation-1",
      projectId: "project-1",
      provider: {
        async ensureSession() {
          return {
            sessionId: "session-1",
            sandbox: {
              async syncReadonlyFiles({ files: nextFiles }) {
                for (const key of Array.from(files.keys())) {
                  if (key.startsWith("tool_calls/")) {
                    files.delete(key);
                  }
                }

                for (const file of nextFiles) {
                  files.set(file.path, file.content);
                }
              },
              async read({ path }) {
                return { path, content: files.get(path) ?? null };
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
            },
          };
        },
      },
      getToolCallFiles: async () => toolCallFiles.getFiles(),
      saveState: async () => undefined,
    });
    const tools = withOptionalSilentMcpOutput({
      tools: {
        listObservations: new Tool({
          id: "listObservations",
          description: "List observations",
          inputSchema: z.object({}),
          execute: async () => ({ data: [{ id: "observation-1" }] }),
        }),
      },
      sandbox: sandbox.sandbox,
      onToolCallCompleted: toolCallFiles.processToolCall,
    });

    await tools.listObservations.execute?.({ silent: true }, {
      agent: { toolCallId: "tool-call-1" },
    } as never);

    const path = toolCallFiles.getFiles()[0]?.path;
    if (!path) {
      throw new Error("Expected completed tool call file");
    }

    const result = await sandbox.sandbox.read({
      path,
    });

    expect(JSON.parse((result as { content: string }).content)).toEqual({
      request: { silent: true },
      response: { data: [{ id: "observation-1" }] },
      error: null,
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

  it("returns the sandbox tool-call directory for silent MCP output", async () => {
    const execute = async (input: { query: string }) => ({
      result: input.query,
    });
    const tools = withOptionalSilentMcpOutput({
      tools: {
        search: new Tool({
          id: "search",
          description: "Search",
          inputSchema: z.object({ query: z.string() }),
          execute,
        }),
      },
      sandbox: {
        async read() {
          return null;
        },
        async write() {
          return null;
        },
        async edit() {
          return null;
        },
        async bash() {
          return null;
        },
      },
    });
    const tool = tools.search;

    if (!(tool.inputSchema instanceof z.ZodObject)) {
      throw new Error("Expected a Zod object input schema");
    }

    expect(
      tool.inputSchema.safeParse({ query: "test", silent: true }).success,
    ).toBe(true);

    const output = await tool.execute?.(
      { query: "test", silent: true },
      {} as never,
    );

    expect(output).toEqual({
      type: "silent-mcp-output",
      output: { result: "test" },
    });
    expect(tool.toModelOutput?.(output)).toBe(
      "Output saved to /workspace/tool_calls",
    );
  });

  it("supports silent output for the listObservations JSON Schema", async () => {
    let receivedInput: unknown;
    const tools = withOptionalSilentMcpOutput({
      tools: {
        // MCP tools can originate from a different @mastra/core module instance.
        listObservations: {
          ...new Tool({
            id: "listObservations",
            description: listObservationsTool.description,
            inputSchema: listObservationsTool.inputSchema,
            execute: async (input) => {
              receivedInput = input;
              return { data: [] };
            },
          }),
        },
      },
      sandbox: {
        async read() {
          return null;
        },
        async write() {
          return null;
        },
        async edit() {
          return null;
        },
        async bash() {
          return null;
        },
      },
    });

    if (!tools.listObservations.inputSchema) {
      throw new Error("Expected an input schema");
    }

    expect(
      standardSchemaToJSONSchema(tools.listObservations.inputSchema),
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        silent: {
          type: "boolean",
          description:
            "Suppress the tool output from the conversation and save the full result to /workspace/tool_calls.",
        },
      },
    });

    await expect(
      tools.listObservations.execute?.(
        { limit: 10, silent: true },
        {} as never,
      ),
    ).resolves.toEqual({
      type: "silent-mcp-output",
      output: { data: [] },
    });
    expect(receivedInput).toEqual({ limit: 10 });
  });

  it("returns normal MCP output when silent is omitted", async () => {
    const tools = withOptionalSilentMcpOutput({
      tools: {
        search: new Tool({
          id: "search",
          description: "Search",
          inputSchema: z.object({ query: z.string() }),
          execute: async (input) => ({ result: input.query }),
        }),
      },
    });

    const output = await tools.search.execute?.({ query: "test" }, {} as never);

    expect(output).toEqual({ result: "test" });
  });

  it("does not advertise silent MCP output without a sandbox", () => {
    const tools = withOptionalSilentMcpOutput({
      tools: {
        search: new Tool({
          id: "search",
          description: "Search",
          inputSchema: z.object({ query: z.string() }),
          execute: async (input) => ({ result: input.query }),
        }),
      },
    });

    if (!(tools.search.inputSchema instanceof z.ZodObject)) {
      throw new Error("Expected a Zod object input schema");
    }

    expect("silent" in tools.search.inputSchema.shape).toBe(false);
  });
});
