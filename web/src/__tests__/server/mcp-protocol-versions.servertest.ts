import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "@/src/features/mcp/server/bootstrap";
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
    { era: "legacy", version: "2025-11-25", negotiation: undefined },
    {
      era: "modern",
      version: "2026-07-28",
      negotiation: { mode: { pin: "2026-07-28" } },
    },
  ] as const)(
    "serves $version clients the same tools with JSON responses",
    async ({ era, version, negotiation }) => {
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
          "io.modelcontextprotocol/skills": {},
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
          expect(contentType).toContain("application/json");
        }
      } finally {
        await client.close();
      }
    },
  );
});
