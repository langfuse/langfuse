import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  Client,
  StreamableHTTPClientTransport,
  type ClientCapabilities,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { handleMcpRequest } from "@/src/features/mcp/server/transport";
import type { ServerContext } from "@/src/features/mcp/types";
import { createMcpTestSetup } from "./mcp-helpers";

const UNKNOWN_MODEL = "unknown-model";

describe("MCP URL elicitation", () => {
  let httpServer: HttpServer;
  let url: URL;
  let context: ServerContext;
  let llmServer: HttpServer;
  let llmServerUrl: string;
  const originalWhitelistedHosts =
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalWhitelistedIps =
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS;
  const originalCloudRegion = sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeAll(async () => {
    ({ context } = await createMcpTestSetup());

    // Answers the test call like a provider: an unknown model is not found,
    // every other model is refused because the key is rejected.
    sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["127.0.0.1"];
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = ["127.0.0.1"];
    llmServer = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const { model } = JSON.parse(raw) as { model: string };
      const [status, code] =
        model === UNKNOWN_MODEL
          ? [404, "model_not_found"]
          : [401, "invalid_api_key"];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: code, type: "invalid_request_error", code },
        }),
      );
    });
    await new Promise<void>((resolve) =>
      llmServer.listen(0, "127.0.0.1", resolve),
    );
    llmServerUrl = `http://127.0.0.1:${(llmServer.address() as AddressInfo).port}/v1`;

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
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST =
      originalWhitelistedHosts;
    sharedEnv.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = originalWhitelistedIps;
    sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    await new Promise((resolve) => httpServer.close(resolve));
    await new Promise((resolve) => llmServer.close(resolve));
  });

  type TestClient = {
    pin?: "2026-07-28";
    elicitation: ClientCapabilities["elicitation"];
  };

  /** Calls the tool from a client that accepts every elicitation it gets. */
  async function setDefaultModel(
    provider: string,
    client: TestClient = { pin: "2026-07-28", elicitation: { url: {} } },
    model = "gpt-4o-mini",
  ) {
    const requests: { message: string; url: string }[] = [];
    const mcpClient = new Client(
      { name: "url-elicitation-test", version: "1.0.0" },
      {
        capabilities: { elicitation: client.elicitation },
        ...(client.pin && {
          versionNegotiation: { mode: { pin: client.pin } },
        }),
      },
    );
    mcpClient.setRequestHandler("elicitation/create", async (request) => {
      requests.push({
        message: request.params.message,
        url: request.params.mode === "url" ? request.params.url : "",
      });
      return { action: "accept" };
    });
    await mcpClient.connect(new StreamableHTTPClientTransport(url));
    try {
      const result = await mcpClient.callTool({
        name: "setDefaultEvaluationModel",
        arguments: { provider, model },
      });
      return { requests, result };
    } finally {
      await mcpClient.close();
    }
  }

  it.each<{ label: string; client: TestClient }>([
    {
      label: "2025-era clients",
      client: { elicitation: { url: {} } },
    },
    {
      label: "2026-07-28 clients without URL elicitation",
      client: { pin: "2026-07-28", elicitation: { form: {} } },
    },
  ])("returns the original error to $label", async ({ client }) => {
    const provider = `mcp-url-${randomUUID()}`;
    const { requests, result } = await setDefaultModel(provider, client);

    expect(requests).toEqual([]);
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining(`API key for provider ${provider}`),
      }),
    ]);
  });

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

  async function createConnection(provider: string) {
    return prisma.llmApiKeys.create({
      data: {
        projectId: context.projectId,
        provider,
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("expired-key"),
        displaySecretKey: "...-key",
        baseURL: llmServerUrl,
        customModels: [],
        withDefaultModels: true,
        extraHeaderKeys: [],
      },
    });
  }

  it("opens the connection's edit dialog when the provider rejects its key", async () => {
    const provider = `mcp-url-${randomUUID()}`;
    const connection = await createConnection(provider);

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

  it("returns an unknown model to the agent without a link", async () => {
    const provider = `mcp-url-${randomUUID()}`;
    await createConnection(provider);

    const { requests, result } = await setDefaultModel(
      provider,
      undefined,
      UNKNOWN_MODEL,
    );

    expect(requests).toEqual([]);
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining(
          "Model configuration not valid for evaluation.",
        ),
      }),
    ]);
  });
});
