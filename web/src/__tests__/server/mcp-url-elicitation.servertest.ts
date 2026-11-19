import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import "@/src/features/mcp/server/bootstrap";
import { handleMcpRequest } from "@/src/features/mcp/server/transport";
import type { ServerContext } from "@/src/features/mcp/types";
import { createMcpTestSetup } from "./mcp-helpers";

describe("MCP URL elicitation", () => {
  let httpServer: HttpServer;
  let url: URL;
  let context: ServerContext;

  beforeAll(async () => {
    ({ context } = await createMcpTestSetup());

    // Mounts the transport the way the API route does after authentication.
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

  /** Calls the tool from a client that accepts every URL elicitation. */
  async function setDefaultModel(provider: string) {
    const requests: { message: string; url: string }[] = [];
    const client = new Client(
      { name: "url-elicitation-test", version: "1.0.0" },
      {
        capabilities: { elicitation: { url: {} } },
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );
    client.setRequestHandler("elicitation/create", async (request) => {
      if (request.params.mode === "url") {
        requests.push({
          message: request.params.message,
          url: request.params.url,
        });
      }
      return { action: "accept" };
    });
    await client.connect(new StreamableHTTPClientTransport(url));
    try {
      const result = await client.callTool({
        name: "setDefaultEvaluationModel",
        arguments: { provider, model: "gpt-4o-mini" },
      });
      return { requests, result };
    } finally {
      await client.close();
    }
  }

  it("opens the create dialog with the name for a missing connection", async () => {
    const provider = `mcp-url-${randomUUID()}`;
    const { requests, result } = await setDefaultModel(provider);

    expect(requests).toEqual([
      {
        message: `Add an LLM connection named "${provider}" in Langfuse, then continue.`,
        url: expect.stringMatching(
          new RegExp(
            `/project/${context.projectId}/settings/llm-connections\\?createConnection=${provider}$`,
          ),
        ),
      },
    ]);
    // Accepting only says the user is done; the tool checks again.
    expect(result.isError).toBe(true);
  });

  it("opens the connection's edit dialog when its test call fails", async () => {
    const provider = `mcp-url-${randomUUID()}`;
    // An unreachable base URL fails the test call like a rejected key does.
    const connection = await prisma.llmApiKeys.create({
      data: {
        projectId: context.projectId,
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("expired-key"),
        displaySecretKey: "...-key",
        baseURL: "http://127.0.0.1:1/v1",
        customModels: [],
        withDefaultModels: true,
        extraHeaderKeys: [],
      },
    });

    const { requests, result } = await setDefaultModel(provider);

    expect(requests).toEqual([
      {
        message: expect.stringContaining(
          `The test call with LLM connection "${provider}" failed with "`,
        ),
        url: expect.stringMatching(
          new RegExp(
            `/project/${context.projectId}/settings/llm-connections\\?editConnection=${connection.id}$`,
          ),
        ),
      },
    ]);
    expect(result.isError).toBe(true);
  });
});
