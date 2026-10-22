import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { isoDateTime } from "@langfuse/shared";
import { mockServerContext } from "../mcp-helpers";

import { __dangerouslySkipAuthz } from "@/src/features/public-api/server";
import { defineTool } from "../../../features/mcp/core/define-tool";
import type { ServerContext } from "../../../features/mcp/types";

describe("defineTool", () => {
  it("publishes and validates both ISO timestamp precisions without a union", async () => {
    const schema = z.object({ timestamp: isoDateTime({ offset: true }) });
    const handler = vi.fn(async (input: z.infer<typeof schema>) => input);
    const [tool, run] = defineTool({
      name: "timestampTool",
      description: "",
      action: __dangerouslySkipAuthz,
      baseSchema: schema,
      inputSchema: schema,
      handler,
    });
    const property = (
      tool.inputSchema.properties as Record<
        string,
        { type: string; pattern: string }
      >
    ).timestamp;
    expect(property).toEqual({ type: "string", pattern: expect.any(String) });
    const pattern = new RegExp(property.pattern);
    const context = mockServerContext();
    for (const timestamp of [
      "2024-02-29T06:15Z",
      "2024-02-29T06:15:00.123+02:30",
    ]) {
      expect(pattern.test(timestamp)).toBe(true);
      await run({ timestamp }, context);
      expect(handler).toHaveBeenLastCalledWith({ timestamp }, context);
    }
    const invalid = "2024-02-30T06:15Z";
    expect(pattern.test(invalid)).toBe(false);
    await expect(run({ timestamp: invalid }, context)).rejects.toThrow(
      "Validation failed",
    );
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("rejects intersections that emit allOf", () => {
    const schema = z
      .object({ id: z.string() })
      .describe("Score identifier")
      .and(
        z.object({
          dataType: z.literal("NUMERIC"),
          value: z.number(),
        }),
      );

    expect(() =>
      defineTool({
        name: "createScore",
        description: "Create a score",
        action: __dangerouslySkipAuthz,
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("publishes flattened schemas and still validates tool inputs", async () => {
    const schema = z.object({ id: z.string().min(1) }).and(
      z.object({
        filter: z
          .object({ name: z.string().min(1) })
          .and(z.object({ count: z.number().min(0) })),
        value: z.union([z.string(), z.number()]),
      }),
    );
    const handler = vi.fn(async (input: z.infer<typeof schema>) => input);
    const [tool, run] = defineTool({
      name: "flattenedTool",
      description: "",
      action: __dangerouslySkipAuthz,
      baseSchema: schema,
      inputSchema: schema,
      handler,
    });
    const context: ServerContext = {
      projectId: "project-id",
      orgId: "org-id",
      apiKeyId: "api-key-id",
      accessLevel: "project",
      publicKey: "pk-lf-test",
      plan: "oss",
      rateLimitOverrides: [],
    };
    const input = {
      id: "score-id",
      filter: { name: "score", count: 1 },
      value: 1,
    };

    expect(ToolSchema.safeParse(tool).success).toBe(true);
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      required: ["id", "filter", "value"],
      properties: {
        id: { type: "string", minLength: 1 },
        filter: {
          type: "object",
          required: ["name", "count"],
          properties: {
            name: { type: "string", minLength: 1 },
            count: { type: "number", minimum: 0 },
          },
        },
        value: { type: ["string", "number"] },
      },
    });
    await expect(run(input, context)).resolves.toEqual(input);

    for (const invalid of [
      { filter: input.filter, value: input.value },
      { ...input, id: "" },
      { ...input, filter: { name: "score" } },
      { ...input, filter: { name: "score", count: -1 } },
      { ...input, value: true },
    ]) {
      // MCP clients submit unvalidated JSON to the typed handler.
      await expect(
        run(invalid as Parameters<typeof run>[0], context),
      ).rejects.toThrow("Validation failed");
    }
    expect(handler).toHaveBeenCalledExactlyOnceWith(input, context);
  });

  it("preserves root type: 'object' for plain object schemas", () => {
    const schema = z.object({ name: z.string() });

    const [tool] = defineTool({
      name: "plainTool",
      description: "",
      action: __dangerouslySkipAuthz,
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
      action: __dangerouslySkipAuthz,
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
        action: __dangerouslySkipAuthz,
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects constrained nested unions that emit anyOf", () => {
    const schema = z.object({
      filter: z.union([z.string().min(1), z.number()]),
    });

    expect(() =>
      defineTool({
        name: "nestedUnionTool",
        description: "",
        action: __dangerouslySkipAuthz,
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects nested intersections that emit allOf", () => {
    const schema = z.object({
      filter: z
        .object({ id: z.string() })
        .describe("Score identifier")
        .and(z.object({ name: z.string() })),
    });

    expect(() =>
      defineTool({
        name: "nestedIntersectionTool",
        description: "",
        action: __dangerouslySkipAuthz,
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
      action: __dangerouslySkipAuthz,
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
