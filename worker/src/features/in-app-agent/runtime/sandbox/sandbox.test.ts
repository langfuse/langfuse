import { EventType } from "@ag-ui/core";
import {
  standardSchemaToJSONSchema,
  toStandardSchema,
} from "@mastra/core/schema";
import { Tool } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createSandboxToolCallFileAccumulator } from "@langfuse/shared/in-app-agent/server/persistence";
import { createInAppAgentSandbox } from ".";
import { withOptionalSilentMcpOutput } from "../tools";

// Only presence matters for the tests below: it is what makes
// withOptionalSilentMcpOutput advertise the `silent` parameter.
const dummySandbox = {
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
};

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

  it("returns the exact sandbox file for silent MCP output", async () => {
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
      sandbox: dummySandbox,
    });
    const tool = tools.search;

    if (!(tool.inputSchema instanceof z.ZodObject)) {
      throw new Error("Expected a Zod object input schema");
    }

    expect(
      tool.inputSchema.safeParse({ query: "test", silent: true }).success,
    ).toBe(true);

    const output = await tool.execute?.({ query: "test", silent: true }, {
      agent: { toolCallId: "tool-call-1" },
    } as never);

    expect(output).toEqual({
      type: "silent-mcp-output",
      output: { result: "test" },
      toolCallId: "tool-call-1",
      toolName: "search",
    });
    expect(tool.toModelOutput?.(output)).toEqual({
      type: "text",
      value: "Output saved to /workspace/tool_calls/search_tool-call-1.json",
    });
  });

  it("supports silent output for the listObservations JSON Schema", async () => {
    let receivedInput: unknown;
    const tools = withOptionalSilentMcpOutput({
      tools: {
        // MCP tools can originate from a different @mastra/core module instance.
        listObservations: {
          ...new Tool({
            id: "listObservations",
            description: "List observations",
            inputSchema: toStandardSchema({
              type: "object",
              additionalProperties: false,
              properties: { limit: { type: "number" } },
            }),
            execute: async (input) => {
              receivedInput = input;
              return { data: [] };
            },
          }),
        },
      },
      sandbox: dummySandbox,
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
      tools.listObservations.execute?.({ limit: 10, silent: true }, {
        agent: { toolCallId: "tool-call-2" },
      } as never),
    ).resolves.toEqual({
      type: "silent-mcp-output",
      output: { data: [] },
      toolCallId: "tool-call-2",
      toolName: "listObservations",
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

  it("does not silence an MCP result that reports its own error", async () => {
    // Verbatim shape of a real failure from the langfuse docs MCP server: the
    // `isError` marker sits on the envelope and the text is not JSON, so
    // classifying the unwrapped content alone reads it as a success.
    const mcpErrorResult = {
      isError: true,
      content: [
        {
          type: "text",
          text: "Error fetching docs page markdown: Failed to fetch https://langfuse.com/not-a-real-page.md: 404",
        },
      ],
    };
    const toolCallFiles = createSandboxToolCallFileAccumulator([]);
    const tools = withOptionalSilentMcpOutput({
      tools: {
        search: new Tool({
          id: "search",
          description: "Search",
          inputSchema: z.object({ query: z.string() }),
          execute: async () => mcpErrorResult,
        }),
      },
      sandbox: dummySandbox,
      onToolCallCompleted: toolCallFiles.processToolCall,
    });

    const output = await tools.search.execute?.(
      { query: "test", silent: true },
      { agent: { toolCallId: "tool-call-1" } } as never,
    );

    // Not wrapped, so the model reads the failure inline rather than being
    // pointed at a tool_calls file that is never written for failures.
    expect(output).toEqual(mcpErrorResult);
    expect(tools.search.toModelOutput?.(output)).toEqual({
      type: "json",
      value: mcpErrorResult,
    });
    expect(toolCallFiles.getFiles()).toEqual([]);
  });

  it("rethrows a thrown silent MCP error and writes no sandbox file", async () => {
    const toolCallFiles = createSandboxToolCallFileAccumulator([]);
    const tools = withOptionalSilentMcpOutput({
      tools: {
        search: new Tool({
          id: "search",
          description: "Search",
          inputSchema: z.object({ query: z.string() }),
          execute: async () => {
            throw new Error(
              "McpError -32602: Validation failed: Required at view",
            );
          },
        }),
      },
      sandbox: dummySandbox,
      onToolCallCompleted: toolCallFiles.processToolCall,
    });

    // The throw must survive the wrapper: the adapter's tool-error rewrite
    // feeds it back to the model, and approved-tool failures are classified
    // from it.
    await expect(
      tools.search.execute?.({ query: "test", silent: true }, {
        agent: { toolCallId: "tool-call-2" },
      } as never),
    ).rejects.toThrow("McpError -32602: Validation failed: Required at view");
    expect(toolCallFiles.getFiles()).toEqual([]);
  });

  it("does not export failed tool calls into sandbox tool_calls files", () => {
    const files = createSandboxToolCallFileAccumulator([
      {
        createdAt: new Date("2026-07-02T12:00:00.000Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_START,
          toolCallId: "tool-call-1",
          toolCallName: "langfuse_queryMetrics",
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.100Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "tool-call-1",
          delta: '{"silent":true}',
        },
      },
      {
        createdAt: new Date("2026-07-02T12:00:00.200Z"),
        runId: "run-1",
        event: {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: "tool-call-1",
          content: JSON.stringify({
            error: true,
            message:
              "Tool input validation failed for langfuse_queryMetrics. Please fix the following errors and try again:\n- root: must have required property 'view'",
          }),
        },
      },
    ]).getFiles();

    expect(files).toEqual([]);
  });
});
