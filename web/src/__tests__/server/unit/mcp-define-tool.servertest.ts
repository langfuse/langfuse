import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InternalServerError } from "@langfuse/shared";
import { recordIncrement } from "@langfuse/shared/src/server";
import { defineTool } from "../../../features/mcp/core/define-tool";
import type { ServerContext } from "../../../features/mcp/types";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal()),
  recordIncrement: vi.fn(),
}));

const externalContext = {
  projectId: "project-id",
  orgId: "org-id",
  apiKeyId: "api-key-id",
  accessLevel: "project",
  publicKey: "public-key",
} satisfies ServerContext;

const inAppAgentContext = {
  ...externalContext,
  inAppAgent: { permissions: "read" },
} satisfies ServerContext;

describe("defineTool", () => {
  beforeEach(() => {
    vi.mocked(recordIncrement).mockClear();
  });

  it("records successful external tool calls", async () => {
    const schema = z.object({ name: z.string() });
    const [, handler] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    await handler({ name: "Langfuse" }, externalContext);

    expect(recordIncrement).toHaveBeenCalledOnce();
    expect(recordIncrement).toHaveBeenCalledWith("langfuse.mcp.tool_call", 1, {
      tool: "plainTool",
      outcome: "success",
      client: "external",
    });
  });

  it("records in-app agent validation failures as client errors", async () => {
    const schema = z.object({ name: z.string() });
    const [, handler] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    await expect(
      handler({ name: 42 } as unknown as { name: string }, inAppAgentContext),
    ).rejects.toThrow("Validation failed");

    expect(recordIncrement).toHaveBeenCalledOnce();
    expect(recordIncrement).toHaveBeenCalledWith("langfuse.mcp.tool_call", 1, {
      tool: "plainTool",
      outcome: "client_error",
      client: "in-app-agent",
    });
  });

  it("records unexpected handler failures as server errors", async () => {
    const schema = z.object({ name: z.string() });
    const [, handler] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async () => {
        throw new Error("Database unavailable");
      },
    });

    await expect(
      handler({ name: "Langfuse" }, externalContext),
    ).rejects.toThrow("An unexpected error occurred");

    expect(recordIncrement).toHaveBeenCalledOnce();
    expect(recordIncrement).toHaveBeenCalledWith("langfuse.mcp.tool_call", 1, {
      tool: "plainTool",
      outcome: "server_error",
      client: "external",
    });
  });

  it("records 5xx BaseError handler failures as server errors", async () => {
    const schema = z.object({ name: z.string() });
    const [, handler] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async () => {
        throw new InternalServerError("Database row corrupted");
      },
    });

    await expect(
      handler({ name: "Langfuse" }, externalContext),
    ).rejects.toThrow("Database row corrupted");

    expect(recordIncrement).toHaveBeenCalledOnce();
    expect(recordIncrement).toHaveBeenCalledWith("langfuse.mcp.tool_call", 1, {
      tool: "plainTool",
      outcome: "server_error",
      client: "external",
    });
  });

  it("rejects intersection schemas", () => {
    const schema = z.object({ id: z.string() }).and(
      z.object({
        dataType: z.literal("NUMERIC"),
        value: z.number(),
      }),
    );

    expect(() =>
      defineTool({
        name: "createScore",
        description: "Create a score",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("preserves root type: 'object' for plain object schemas", () => {
    const schema = z.object({ name: z.string() });

    const [tool] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.type).toBe("object");
  });

  it("allows plain object fields named like JSON Schema combinators", () => {
    const schema = z.object({
      anyOf: z.string(),
      oneOf: z.string(),
      allOf: z.string(),
    });

    const [tool] = defineTool({
      name: "combinatorNamedFieldsTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.properties).toEqual(
      expect.objectContaining({
        anyOf: expect.objectContaining({ type: "string" }),
        oneOf: expect.objectContaining({ type: "string" }),
        allOf: expect.objectContaining({ type: "string" }),
      }),
    );
  });

  it("rejects union schemas", () => {
    const schema = z.union([z.string(), z.object({ id: z.string() })]);

    expect(() =>
      defineTool({
        name: "mixedUnionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects nested union schemas", () => {
    const schema = z.object({
      filter: z.union([z.string(), z.number()]),
    });

    expect(() =>
      defineTool({
        name: "nestedUnionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects nested intersection schemas", () => {
    const schema = z.object({
      filter: z.object({ id: z.string() }).and(z.object({ name: z.string() })),
    });

    expect(() =>
      defineTool({
        name: "nestedIntersectionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("preserves ASCII-safe patterns", () => {
    const schema = z.object({
      label: z.string().regex(/^[a-z0-9_\-.]+$/),
    });

    const [tool] = defineTool({
      name: "asciiPatternTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.properties).toEqual(
      expect.objectContaining({
        label: expect.objectContaining({ pattern: "^[a-z0-9_\\-.]+$" }),
      }),
    );
  });
});
