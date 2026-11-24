import { createHash } from "node:crypto";
import { LANGFUSE_SKILLS } from "@repo/langfuse-skills";
import {
  Client,
  InMemoryTransport,
  ProtocolError,
  ProtocolErrorCode,
} from "@modelcontextprotocol/client";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  ClickHouseResourceError,
  getProductBaseUrl,
} from "@langfuse/shared/src/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { appToolResult } from "@/src/features/mcp/core/mcp-app";
import { WIDGET_APP_RESOURCE_URI } from "@/src/features/mcp/server/apps/resources";
import { createMcpServer } from "@/src/features/mcp/server/mcpServer";
import { toolRegistry } from "@/src/features/mcp/server/registry";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server/enforceAuth";
import type { ServerContext } from "@/src/features/mcp/types";

vi.mock("@/src/features/mcp/server/registry", () => ({
  toolRegistry: { getEnabledTool: vi.fn() },
}));

const context: ServerContext = {
  projectId: "project-1",
  orgId: "org-1",
  apiKeyId: "key-1",
  accessLevel: "project",
  publicKey: "pk-lf-test",
  plan: "oss",
  rateLimitOverrides: [],
  accessAuditLogEnabled: false,
};

describe("MCP tool results", () => {
  it.each([
    {
      name: "timeout",
      error: new ClickHouseResourceError(
        "TIMEOUT",
        new Error("internal query"),
      ),
      input: "valid",
      message:
        "The ClickHouse query timed out. Narrow the query by shortening the date range or adding more specific filters before trying again.",
    },
    {
      name: "missing resource",
      error: new LangfuseNotFoundError("Prompt 'example' not found"),
      input: "valid",
      message: "Prompt 'example' not found",
    },
    {
      name: "validation",
      error: undefined,
      input: "",
      message: "Validation failed: name: Name is required",
    },
    ...[
      new Error("internal secret"),
      new ProtocolError(ProtocolErrorCode.InternalError, "internal secret"),
    ].map((error) => ({
      name: error.constructor.name,
      error,
      input: "valid",
      message: "An unexpected error occurred. Please try again later.",
    })),
    { name: "success", error: undefined, input: "valid", message: "ok" },
  ])(
    "preserves safe output for $name through defineTool",
    async ({ error, input, message }) => {
      const schema = z.object({ name: z.string().min(1, "Name is required") });
      const [definition, handler] = defineTool({
        name: "test-tool",
        description: "test",
        action: __dangerouslySkipAuthz,
        baseSchema: schema,
        inputSchema: schema,
        handler: async () => {
          if (error) throw error;
          return "ok";
        },
      });
      vi.mocked(toolRegistry.getEnabledTool).mockImplementation(async (name) =>
        name === definition.name ? { definition, handler } : undefined,
      );
      const server = createMcpServer(context);
      const client = new Client({ name: "test", version: "1.0.0" });
      const [serverTransport, clientTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const result = await client.callTool({
          name: definition.name,
          arguments: { name: input },
        });
        expect(result.content).toEqual([{ type: "text", text: message }]);
        expect(result.isError).toBe(message === "ok" ? undefined : true);
        await expect(
          client.callTool({ name: "unknown", arguments: {} }),
        ).rejects.toMatchObject({ code: ProtocolErrorCode.InvalidParams });
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});

describe("MCP Apps", () => {
  it("announces the UI resource, serves it, and passes result _meta through", async () => {
    const schema = z.object({});
    const [definition, handler] = defineTool({
      name: "app-tool",
      description: "test",
      action: __dangerouslySkipAuthz,
      baseSchema: schema,
      inputSchema: schema,
      ui: { resourceUri: WIDGET_APP_RESOURCE_URI },
      handler: async () =>
        appToolResult({ text: "summary", meta: { widget: { name: "Cost" } } }),
    });
    vi.mocked(toolRegistry.getEnabledTool).mockImplementation(async (name) =>
      name === definition.name ? { definition, handler } : undefined,
    );
    expect(definition._meta?.ui.resourceUri).toBe(WIDGET_APP_RESOURCE_URI);
    const server = createMcpServer(context);
    const client = new Client({ name: "app-test", version: "1.0.0" });
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: definition.name,
        arguments: {},
      });
      expect(result.content).toEqual([{ type: "text", text: "summary" }]);
      expect(result._meta).toEqual({ widget: { name: "Cost" } });
      // The resource is the widget page's HTML, fetched from the app itself.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              '<!doctype html><html><head><script src="/_next/static/chunks/app.js"></script></head></html>',
            ),
        ),
      );
      const read = await client.request(
        { method: "resources/read", params: { uri: WIDGET_APP_RESOURCE_URI } },
        z.object({
          contents: z.array(
            z.object({
              mimeType: z.string(),
              text: z.string(),
              _meta: z.object({
                ui: z.object({
                  csp: z.object({ resourceDomains: z.array(z.string()) }),
                }),
              }),
            }),
          ),
        }),
      );
      // The page's root-relative assets must load from Langfuse, not from
      // the host's sandbox origin.
      const origin = getProductBaseUrl().origin;
      expect(read.contents[0]?.mimeType).toBe(RESOURCE_MIME_TYPE);
      expect(read.contents[0]?.text).toContain(
        `<script src="${origin}/_next/static/chunks/app.js">`,
      );
      expect(read.contents[0]?._meta.ui.csp.resourceDomains).toEqual([origin]);
    } finally {
      vi.unstubAllGlobals();
      await client.close();
      await server.close();
    }
  });
});

describe("MCP skill resources", () => {
  it("exposes manifests separately from resource contents without leaking bundle fields", async () => {
    const server = createMcpServer(context);
    const client = new Client({ name: "skill-test", version: "1.0.0" });
    const [serverTransport, clientTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const expected = LANGFUSE_SKILLS.map(
        ({ uri, frontmatter, resources }) => ({
          uri,
          frontmatter,
          resources: resources.map((resource) => {
            const bytes = Buffer.from(resource.text);
            return {
              uri: resource.uri,
              digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
              size: bytes.length,
            };
          }),
        }),
      );
      const listed = await client.request(
        { method: "skills/list" },
        z.object({ skills: z.array(z.unknown()) }),
      );
      expect(listed.skills).toEqual(expected);
      const selected = await client.request(
        { method: "skills/get", params: { uri: expected[0]!.uri } },
        z.object({ skill: z.unknown() }),
      );
      expect(selected.skill).toEqual(expected[0]);
      for (const resource of LANGFUSE_SKILLS.flatMap(
        ({ resources }) => resources,
      )) {
        const result = await client.request(
          { method: "resources/read", params: { uri: resource.uri } },
          z.object({ contents: z.array(z.unknown()) }),
        );
        expect(result.contents).toEqual([
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.text,
          },
        ]);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
