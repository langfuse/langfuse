import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WIDGET_APP_RESOURCE_URI } from "@/src/features/mcp/server/apps/resources";
import { handleMcpRequest } from "@/src/features/mcp/server/transport";
import type { ServerContext } from "@/src/features/mcp/types";
import { createMcpTestSetup } from "./mcp-helpers";

describe("MCP protocol versions", () => {
  let httpServer: HttpServer;
  let url: URL;
  let context: ServerContext;

  beforeAll(async () => {
    ({ context } = await createMcpTestSetup());

    // Mounts the transport the way the API route does after authentication:
    // a parsed JSON body on req.body and the resolved context.
    httpServer = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const nextReq = req as NextApiRequest;
      nextReq.body = raw ? JSON.parse(raw) : undefined;
      await handleMcpRequest(context, nextReq, res as NextApiResponse);
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = new URL(`http://127.0.0.1:${port}/api/public/mcp`);
  });

  afterAll(async () => {
    await new Promise((resolve) => httpServer.close(resolve));
  });

  it.each([
    {
      era: "legacy",
      version: "2025-11-25",
      negotiation: undefined,
      // The SDK's stateless legacy fallback streams every response.
      contentType: "text/event-stream",
    },
    {
      era: "modern",
      version: "2026-07-28",
      negotiation: { mode: { pin: "2026-07-28" } },
      contentType: "application/json",
    },
  ] as const)(
    "serves $version clients the same tools as $contentType",
    async ({ era, version, negotiation, contentType: expectedType }) => {
      const contentTypes: string[] = [];
      const client = new Client(
        { name: "protocol-versions-test", version: "1.0.0" },
        negotiation ? { versionNegotiation: negotiation } : undefined,
      );
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          fetch: async (input, init) => {
            const response = await fetch(input, init);
            if (init?.method === "POST" && response.status === 200) {
              contentTypes.push(response.headers.get("content-type") ?? "");
            }
            return response;
          },
        }),
      );

      try {
        expect(client.getProtocolEra()).toBe(era);
        expect(client.getNegotiatedProtocolVersion()).toBe(version);
        expect(client.getServerCapabilities()?.extensions).toEqual({
          "io.modelcontextprotocol/skills": { directoryRead: true },
          "io.modelcontextprotocol/ui": {},
        });

        const { tools } = await client.listTools();
        expect(tools.map((tool) => tool.name)).toContain("listPrompts");

        const result = await client.callTool({
          name: "listPrompts",
          arguments: { page: 1, limit: 1 },
        });
        expect(result.isError).toBeFalsy();
        expect(result.content).toEqual([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining('"totalItems": 0'),
          }),
        ]);

        expect(contentTypes.length).toBeGreaterThan(0);
        for (const contentType of contentTypes) {
          expect(contentType).toContain(expectedType);
        }
      } finally {
        await client.close();
      }
    },
  );

  it.each([
    {
      case: "a 2026-07-28 client that renders MCP Apps",
      negotiation: { mode: { pin: "2026-07-28" } },
      ui: { mimeTypes: ["text/html;profile=mcp-app"] as string[] },
      listed: true,
    },
    {
      case: "a 2026-07-28 client without MCP Apps support",
      negotiation: { mode: { pin: "2026-07-28" } },
      ui: undefined,
      listed: false,
    },
    {
      case: "a 2026-07-28 client with malformed MCP Apps capabilities",
      negotiation: { mode: { pin: "2026-07-28" } },
      ui: { mimeTypes: 1 },
      listed: false,
    },
    {
      // Its capabilities stay with `initialize`, so tools/list cannot tell.
      case: "a 2025-era client",
      negotiation: undefined,
      ui: undefined,
      listed: true,
    },
  ] as const)(
    "lists app tools and resources to $case: $listed",
    async ({ negotiation, ui, listed }) => {
      const client = new Client(
        { name: "protocol-versions-test", version: "1.0.0" },
        {
          ...(negotiation && { versionNegotiation: negotiation }),
          ...(ui && {
            capabilities: {
              extensions: { "io.modelcontextprotocol/ui": ui },
            },
          }),
        },
      );
      await client.connect(new StreamableHTTPClientTransport(url));
      try {
        const { tools } = await client.listTools();
        const names = tools.map((tool) => tool.name);
        expect(names).toContain("listPrompts");
        expect(names.includes("renderWidget")).toBe(listed);

        const { resources } = await client.listResources();
        const uris = resources.map((resource) => resource.uri);
        expect(uris.includes(WIDGET_APP_RESOURCE_URI)).toBe(listed);
      } finally {
        await client.close();
      }
    },
  );
});
