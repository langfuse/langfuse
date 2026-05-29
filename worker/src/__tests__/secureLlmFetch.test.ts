import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
import { env } from "../../../packages/shared/src/env";
import {
  ChatMessageType,
  LLMAdapter,
} from "../../../packages/shared/src/server/llm/types";
import { fetchLLMCompletion } from "../../../packages/shared/src/server/llm/fetchLLMCompletion";
import {
  createSecureLlmFetch,
  fetchSecureLlmUrl,
} from "../../../packages/shared/src/server/llm/secureLlmFetch";
import { RedirectValidationError } from "../../../packages/shared/src/server/outbound-url";
import {
  startLocalLlmServer,
  type LocalLlmServer,
} from "./helpers/localLlmServer";

// These tests replace the previous mock-heavy unit tests for the secure LLM
// fetch path. The happy-path wiring is now proven against a real local HTTP
// server (so a regression in the SDK -> secureLlmFetch handoff is caught
// without provider credentials), and the security-boundary cases use the
// validator directly to avoid coupling to provider SDK error wrapping.
// Production end-to-end coverage continues to live in llmConnections.test.ts.

const OPENAI_RESPONSE_BODY = JSON.stringify({
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

describe("secure LLM fetch", () => {
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  // env is the zod-validated object: read from process.env at module load and
  // not refreshed afterward. Mutating process.env later is a no-op for the
  // code under test, so we mutate `env.*` directly and restore in afterEach.
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const servers: LocalLlmServer[] = [];

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["127.0.0.1"];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((s) => s.close()));
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  async function spinUp(handler: Parameters<typeof startLocalLlmServer>[0]) {
    const server = await startLocalLlmServer(handler);
    servers.push(server);
    return server;
  }

  describe("end-to-end SDK wiring", () => {
    // Allow ample headroom for first-run module import + SDK warmup; the
    // actual request to 127.0.0.1 is sub-second.
    test(
      "OpenAI SDK routes through secureLlmFetch and reaches the configured base URL",
      { timeout: 30_000 },
      async () => {
        const server = await spinUp((_req, _body, res) => {
          res.setHeader("content-type", "application/json");
          res.end(OPENAI_RESPONSE_BODY);
        });

        const completion = await fetchLLMCompletion({
          streaming: false,
          messages: [
            {
              role: "user",
              content: "What is 2+2? Answer only with the number.",
              type: ChatMessageType.PublicAPICreated,
            },
          ],
          modelParams: {
            provider: "openai",
            adapter: LLMAdapter.OpenAI,
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 10,
          },
          llmConnection: {
            secretKey: encrypt("openai-api-key"),
            baseURL: `${server.url}/v1`,
          },
        });

        expect(completion).toBe("4");
        expect(server.requests).toHaveLength(1);
        const [request] = server.requests;
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/v1/chat/completions");
        expect(request.headers.authorization).toBe("Bearer openai-api-key");
        // Body is buffered (not streamed) so redirect retry stays possible.
        expect(JSON.parse(request.body)).toMatchObject({
          model: "gpt-4o-mini",
        });
      },
    );
  });

  describe("SSRF protection", () => {
    test("ignores caller-supplied dispatchers so connection validation can install its own", async () => {
      const leakedDispatcher = { name: "sdk-dispatcher" };
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok"));

      await expect(
        fetchSecureLlmUrl(
          "https://example.com/v1/chat/completions",
          {
            method: "POST",
            dispatcher: leakedDispatcher,
          } as RequestInit & { dispatcher: unknown },
          {
            logContext: "Test LLM endpoint",
            whitelist: { hosts: ["example.com"], ips: [], ip_ranges: [] },
          },
        ),
      ).resolves.toBeInstanceOf(Response);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, fetchOptions] = fetchSpy.mock.calls[0] as Parameters<
        typeof fetch
      >;
      expect(
        (fetchOptions as { dispatcher?: unknown }).dispatcher,
      ).toBeDefined();
      expect((fetchOptions as { dispatcher?: unknown }).dispatcher).not.toBe(
        leakedDispatcher,
      );
    });

    test("rejects link-local metadata hostnames before opening a socket", async () => {
      env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = [];

      await expect(
        fetchSecureLlmUrl(
          // Cloud metadata IPs are in the static hostname deny list, so this
          // throws "Blocked hostname detected" before any DNS or IP check.
          "http://169.254.169.254/v1/chat/completions",
          { method: "POST" },
          { logContext: "Test LLM endpoint" },
        ),
      ).rejects.toThrow(/Blocked hostname detected/);
    });

    test("rejects HTTP base URLs when running on Langfuse Cloud", async () => {
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";

      await expect(
        fetchSecureLlmUrl(
          "http://example.com/v1/chat/completions",
          { method: "POST" },
          { logContext: "Test LLM endpoint" },
        ),
      ).rejects.toThrow(/Only HTTPS base URLs are allowed/);
    });
  });

  describe("redirect validation", () => {
    test("rejects redirects pointing at a blocked target", async () => {
      const server = await spinUp((_req, _body, res) => {
        res.statusCode = 302;
        res.setHeader("location", "http://169.254.169.254/v1/chat/completions");
        res.end();
      });

      const secureFetch = createSecureLlmFetch({
        logContext: "Test LLM endpoint",
      });

      await expect(
        secureFetch(`${server.url}/v1/chat/completions`, {
          method: "POST",
          headers: { authorization: "Bearer leakable-token" },
          body: JSON.stringify({ messages: [] }),
        }),
      ).rejects.toBeInstanceOf(RedirectValidationError);
    });

    test("strips additional sensitive headers on cross-origin redirects", async () => {
      const target = await spinUp((_req, _body, res) => {
        res.setHeader("content-type", "application/json");
        res.end(OPENAI_RESPONSE_BODY);
      });
      const redirector = await spinUp((_req, _body, res) => {
        res.statusCode = 302;
        res.setHeader("location", `${target.url}/v1/chat/completions`);
        res.end();
      });

      const secureFetch = createSecureLlmFetch({
        logContext: "Test LLM endpoint",
        additionalSensitiveHeaders: ["x-api-key"],
      });

      await secureFetch(`${redirector.url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: "Bearer leakable-token",
          "x-api-key": "leakable-key",
          "x-non-sensitive": "keep-me",
        },
        body: JSON.stringify({ messages: [] }),
      });

      expect(target.requests).toHaveLength(1);
      const forwarded = target.requests[0];
      // Default + caller-provided sensitive headers are stripped across origins.
      expect(forwarded.headers.authorization).toBeUndefined();
      expect(forwarded.headers["x-api-key"]).toBeUndefined();
      // Non-sensitive headers survive the redirect.
      expect(forwarded.headers["x-non-sensitive"]).toBe("keep-me");
    });
  });
});
