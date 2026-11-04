import { generateKeyPairSync } from "node:crypto";
import type { ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
import { env } from "../../../packages/shared/src/env";
import type { OAuth2Config } from "../../../packages/shared/src/interfaces/oauth2Providers";
import {
  embedLLMText,
  generateLLMText,
  streamLLMText,
} from "../../../packages/shared/src/server/llm/llmText";
import { resolveOAuth2Connection } from "../../../packages/shared/src/server/llm/oauth2/connection";
import { OAuth2TokenError } from "../../../packages/shared/src/server/llm/oauth2/errors";
import { clearOAuth2TokenCache } from "../../../packages/shared/src/server/llm/oauth2/tokenCache";
import { LLMAdapter } from "../../../packages/shared/src/server/llm/types";
import {
  startLocalLlmServer,
  type LocalLlmServer,
} from "./helpers/localLlmServer";

// OAuth2 client credentials LLM connections end to end against local HTTP
// servers: a fake token endpoint that hands out `token-1`, `token-2`, ...
// and a fake LLM gateway that records the bearer token it receives.

const OPENAI_CHAT_BODY = JSON.stringify({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1,
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "4" },
      finish_reason: "stop",
    },
  ],
});

const ANTHROPIC_MESSAGES_BODY = JSON.stringify({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-4-5",
  content: [{ type: "text", text: "4" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 1 },
});

const OPENAI_EMBEDDINGS_BODY = JSON.stringify({
  object: "list",
  data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
  model: "text-embedding-3-small",
  usage: { prompt_tokens: 1, total_tokens: 1 },
});

const CLIENT_SECRET = "client-secret-that-is-at-least-32-bytes-long";

function generatePrivateJwk(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return JSON.stringify({ ...privateKey.export({ format: "jwk" }), kid: "k1" });
}

function writeChatCompletionStream(res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const chunk = (delta: Record<string, unknown>, finishReason: string | null) =>
    `data: ${JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 1,
      model: "gpt-4o-mini",
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    })}\n\n`;
  res.write(chunk({ role: "assistant", content: "pong" }, null));
  res.write(chunk({}, "stop"));
  res.write("data: [DONE]\n\n");
  res.end();
}

function writeUnauthorized(res: ServerResponse) {
  res.statusCode = 401;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      error: { message: "invalid token", type: "invalid_request_error" },
    }),
  );
}

describe("OAuth2 client credentials LLM connections", () => {
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalWhitelistedIps = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalAllowedTokenEndpoints =
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const servers: LocalLlmServer[] = [];
  let tokenServer: LocalLlmServer;
  let tokenUrl: string;

  async function spinUp(handler: Parameters<typeof startLocalLlmServer>[0]) {
    const server = await startLocalLlmServer(handler);
    servers.push(server);
    return server;
  }

  // env is the zod-validated object read once at module load, so tests
  // mutate `env.*` directly and restore it in afterEach.
  beforeEach(async () => {
    clearOAuth2TokenCache();
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["127.0.0.1"];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = ["127.0.0.1"];

    let issued = 0;
    tokenServer = await spinUp((_req, _body, res) => {
      issued += 1;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          access_token: `token-${issued}`,
          token_type: "Bearer",
          expires_in: 3600,
        }),
      );
    });
    tokenUrl = `${tokenServer.url}/oauth2/token`;
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [tokenUrl];
  });

  afterEach(async () => {
    clearOAuth2TokenCache();
    await Promise.all(servers.splice(0).map((s) => s.close()));
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = originalWhitelistedIps;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS =
      originalAllowedTokenEndpoints;
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    }
  });

  function customOAuth2Config(
    authMethod: OAuth2Config["authMethod"] = "client_secret_post",
  ): { oauth2: OAuth2Config } {
    return {
      oauth2: {
        provider: "custom",
        clientId: "langfuse-client",
        authMethod,
        tokenEndpoint: tokenUrl,
        scope: "llm.invoke",
      },
    };
  }

  function generateOpenAI(gateway: LocalLlmServer, secret = CLIENT_SECRET) {
    return generateLLMText({
      messages: [{ role: "user", content: "What is 2+2?" }],
      model: { adapter: LLMAdapter.OpenAI, id: "gpt-4o-mini" },
      maxOutputTokens: 10,
      connection: {
        secretKey: encrypt(secret),
        baseURL: `${gateway.url}/v1`,
        config: customOAuth2Config(),
      },
    });
  }

  describe("openai adapter sends the access token as bearer", () => {
    test.each([
      {
        authMethod: "client_secret_basic" as const,
        secret: CLIENT_SECRET,
        assertTokenRequest: (
          headers: Record<string, unknown>,
          body: string,
        ) => {
          expect(headers.authorization).toMatch(/^Basic /);
          expect(body).not.toContain("client_secret=");
        },
      },
      {
        authMethod: "client_secret_post" as const,
        secret: CLIENT_SECRET,
        assertTokenRequest: (
          _headers: Record<string, unknown>,
          body: string,
        ) => {
          expect(new URLSearchParams(body).get("client_secret")).toBe(
            CLIENT_SECRET,
          );
        },
      },
      {
        authMethod: "client_secret_jwt" as const,
        secret: CLIENT_SECRET,
        assertTokenRequest: (
          _headers: Record<string, unknown>,
          body: string,
        ) => {
          expect(
            new URLSearchParams(body).get("client_assertion"),
          ).toBeTruthy();
          expect(body).not.toContain(CLIENT_SECRET);
        },
      },
      {
        authMethod: "private_key_jwt" as const,
        secret: generatePrivateJwk(),
        assertTokenRequest: (
          _headers: Record<string, unknown>,
          body: string,
        ) => {
          expect(
            new URLSearchParams(body).get("client_assertion"),
          ).toBeTruthy();
        },
      },
    ])(
      "$authMethod",
      { timeout: 30_000 },
      async ({ authMethod, secret, assertTokenRequest }) => {
        const gateway = await spinUp((_req, _body, res) => {
          res.setHeader("content-type", "application/json");
          res.end(OPENAI_CHAT_BODY);
        });

        const completion = await generateLLMText({
          messages: [{ role: "user", content: "What is 2+2?" }],
          model: { adapter: LLMAdapter.OpenAI, id: "gpt-4o-mini" },
          maxOutputTokens: 10,
          connection: {
            secretKey: encrypt(secret),
            baseURL: `${gateway.url}/v1`,
            config: customOAuth2Config(authMethod),
          },
        });

        expect(completion.text).toBe("4");
        expect(tokenServer.requests).toHaveLength(1);
        const [tokenRequest] = tokenServer.requests;
        expect(tokenRequest.url).toBe("/oauth2/token");
        assertTokenRequest(tokenRequest.headers, tokenRequest.body);

        expect(gateway.requests).toHaveLength(1);
        expect(gateway.requests[0].url).toBe("/v1/chat/completions");
        expect(gateway.requests[0].headers.authorization).toBe(
          "Bearer token-1",
        );
        expect(JSON.stringify(gateway.requests[0])).not.toContain(secret);
      },
    );
  });

  test(
    "anthropic adapter sends the access token as bearer and no x-api-key",
    { timeout: 30_000 },
    async () => {
      process.env.ANTHROPIC_API_KEY = "leak";
      const gateway = await spinUp((_req, _body, res) => {
        res.setHeader("content-type", "application/json");
        res.end(ANTHROPIC_MESSAGES_BODY);
      });

      const completion = await generateLLMText({
        messages: [{ role: "user", content: "What is 2+2?" }],
        model: { adapter: LLMAdapter.Anthropic, id: "claude-sonnet-4-5" },
        maxOutputTokens: 10,
        connection: {
          secretKey: encrypt(CLIENT_SECRET),
          baseURL: gateway.url,
          config: customOAuth2Config(),
        },
      });

      expect(completion.text).toBe("4");
      expect(gateway.requests).toHaveLength(1);
      const [request] = gateway.requests;
      expect(request.url).toBe("/v1/messages");
      expect(request.headers.authorization).toBe("Bearer token-1");
      expect(request.headers["x-api-key"]).toBeUndefined();
      expect(JSON.stringify(request.headers)).not.toContain("leak");
    },
  );

  test(
    "an invalid stored oauth2 config fails closed without any request",
    { timeout: 30_000 },
    async () => {
      // Anthropic does not parse the connection config on the way in, so the
      // fail-closed check in the transport is what rejects it.
      const gateway = await spinUp((_req, _body, res) => {
        res.setHeader("content-type", "application/json");
        res.end(ANTHROPIC_MESSAGES_BODY);
      });

      const error = await generateLLMText({
        messages: [{ role: "user", content: "What is 2+2?" }],
        model: { adapter: LLMAdapter.Anthropic, id: "claude-sonnet-4-5" },
        maxOutputTokens: 10,
        connection: {
          secretKey: encrypt(CLIENT_SECRET),
          baseURL: `${gateway.url}/v1`,
          config: { oauth2: { provider: "custom" } },
        },
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OAuth2TokenError);
      expect(error).toMatchObject({ kind: "config" });
      expect(gateway.requests).toHaveLength(0);
      expect(tokenServer.requests).toHaveLength(0);
    },
  );

  describe("gateway 401", () => {
    test(
      "refreshes the token once and re-sends the request",
      { timeout: 30_000 },
      async () => {
        let calls = 0;
        const gateway = await spinUp((_req, _body, res) => {
          calls += 1;
          if (calls === 1) return writeUnauthorized(res);
          res.setHeader("content-type", "application/json");
          res.end(OPENAI_CHAT_BODY);
        });

        const completion = await generateOpenAI(gateway);

        expect(completion.text).toBe("4");
        expect(tokenServer.requests).toHaveLength(2);
        expect(gateway.requests).toHaveLength(2);
        expect(gateway.requests[0].headers.authorization).toBe(
          "Bearer token-1",
        );
        expect(gateway.requests[1].headers.authorization).toBe(
          "Bearer token-2",
        );
        expect(gateway.requests[1].body).toBe(gateway.requests[0].body);
      },
    );

    test(
      "returns a second 401 to the caller",
      { timeout: 30_000 },
      async () => {
        const gateway = await spinUp((_req, _body, res) =>
          writeUnauthorized(res),
        );

        await expect(generateOpenAI(gateway)).rejects.toMatchObject({
          statusCode: 401,
        });
        expect(tokenServer.requests).toHaveLength(2);
        expect(gateway.requests).toHaveLength(2);
      },
    );

    test(
      "streaming call recovers after one 401",
      { timeout: 30_000 },
      async () => {
        let calls = 0;
        const gateway = await spinUp((_req, _body, res) => {
          calls += 1;
          if (calls === 1) return writeUnauthorized(res);
          writeChatCompletionStream(res);
        });

        const stream = await streamLLMText({
          messages: [{ role: "user", content: "Say pong" }],
          model: { adapter: LLMAdapter.OpenAI, id: "gpt-4o-mini" },
          maxOutputTokens: 10,
          connection: {
            secretKey: encrypt(CLIENT_SECRET),
            baseURL: `${gateway.url}/v1`,
            config: customOAuth2Config(),
          },
        });

        let text = "";
        for await (const chunk of stream.textStream) {
          text += chunk;
        }

        expect(text).toBe("pong");
        expect(tokenServer.requests).toHaveLength(2);
        expect(gateway.requests).toHaveLength(2);
        expect(gateway.requests[1].headers.authorization).toBe(
          "Bearer token-2",
        );
      },
    );
    test("returns the 401 unchanged when the request body is a stream", async () => {
      const gateway = await spinUp((_req, _body, res) =>
        writeUnauthorized(res),
      );
      const { accessToken, wrapFetch } = await resolveOAuth2Connection({
        config: customOAuth2Config(),
        decryptedSecret: CLIENT_SECRET,
      });

      const response = await wrapFetch(fetch)(`${gateway.url}/v1/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("payload"));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit);

      expect(response.status).toBe(401);
      expect(tokenServer.requests).toHaveLength(1);
      expect(gateway.requests).toHaveLength(1);
    });
  });

  test(
    "embedLLMText sends the access token as bearer",
    { timeout: 30_000 },
    async () => {
      const gateway = await spinUp((_req, _body, res) => {
        res.setHeader("content-type", "application/json");
        res.end(OPENAI_EMBEDDINGS_BODY);
      });

      const result = await embedLLMText({
        model: { adapter: LLMAdapter.OpenAI, id: "text-embedding-3-small" },
        connection: {
          secretKey: encrypt(CLIENT_SECRET),
          baseURL: `${gateway.url}/v1`,
          config: customOAuth2Config(),
        },
        values: ["hello"],
      });

      expect(result.embeddings).toEqual([[0.1, 0.2]]);
      expect(gateway.requests).toHaveLength(1);
      expect(gateway.requests[0].url).toBe("/v1/embeddings");
      expect(gateway.requests[0].headers.authorization).toBe("Bearer token-1");
    },
  );

  test(
    "fails with a disabled error when the allowlist is unset",
    { timeout: 30_000 },
    async () => {
      env.LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS = [];
      const gateway = await spinUp((_req, _body, res) => {
        res.setHeader("content-type", "application/json");
        res.end(OPENAI_CHAT_BODY);
      });

      const error = await generateOpenAI(gateway).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OAuth2TokenError);
      expect((error as OAuth2TokenError).kind).toBe("disabled");
      expect(tokenServer.requests).toHaveLength(0);
      expect(gateway.requests).toHaveLength(0);
    },
  );
});
