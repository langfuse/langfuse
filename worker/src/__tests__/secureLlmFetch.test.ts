import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
import { env } from "../../../packages/shared/src/env";
import { LLMAdapter } from "../../../packages/shared/src/server/llm/types";
import {
  generateLLMText,
  streamLLMText,
} from "../../../packages/shared/src/server/llm/llmText";
import {
  createSecureLlmFetch,
  fetchSecureLlmUrl,
} from "../../../packages/shared/src/server/llm/secureLlmFetch";
import { LLMValidationError } from "../../../packages/shared/src/server/llm/errors";
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

const OPENAI_RESPONSES_BODY = JSON.stringify({
  id: "resp_test",
  object: "response",
  created_at: 1,
  status: "completed",
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  model: "gpt-4o-mini",
  output: [
    {
      id: "msg_test",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "4",
          annotations: [],
        },
      ],
    },
  ],
  parallel_tool_calls: true,
  previous_response_id: null,
  reasoning: null,
  store: true,
  temperature: 0,
  text: { format: { type: "text" } },
  tool_choice: "auto",
  tools: [],
  top_p: 1,
  truncation: "disabled",
  usage: {
    input_tokens: 10,
    output_tokens: 1,
    total_tokens: 11,
  },
  user: null,
  metadata: {},
});
const OPENAI_RESPONSES_RESPONSE = JSON.parse(OPENAI_RESPONSES_BODY);

describe("secure LLM fetch", () => {
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalWhitelistedIps = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS;
  // env is the zod-validated object: read from process.env at module load and
  // not refreshed afterward. Mutating process.env later is a no-op for the
  // code under test, so we mutate `env.*` directly and restore in afterEach.
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const servers: LocalLlmServer[] = [];

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = ["127.0.0.1"];
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = ["127.0.0.1"];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(servers.splice(0).map((s) => s.close()));
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_IPS = originalWhitelistedIps;
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

        const completion = await generateLLMText({
          messages: [
            {
              role: "user",
              content: "What is 2+2? Answer only with the number.",
            },
          ],
          model: {
            adapter: LLMAdapter.OpenAI,
            id: "gpt-4o-mini",
          },
          temperature: 0,
          maxOutputTokens: 10,
          connection: {
            secretKey: encrypt("openai-api-key"),
            baseURL: `${server.url}/v1`,
          },
        });

        expect(completion.text).toBe("4");
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

    test(
      "OpenAI Responses API config routes through the responses endpoint",
      { timeout: 30_000 },
      async () => {
        const server = await spinUp((_req, _body, res) => {
          res.setHeader("content-type", "application/json");
          res.end(OPENAI_RESPONSES_BODY);
        });

        const completion = await generateLLMText({
          messages: [
            {
              role: "user",
              content: "What is 2+2? Answer only with the number.",
            },
          ],
          model: {
            adapter: LLMAdapter.OpenAI,
            id: "gpt-4o-mini",
          },
          temperature: 0,
          maxOutputTokens: 10,
          connection: {
            secretKey: encrypt("openai-api-key"),
            baseURL: `${server.url}/v1`,
            config: {
              useResponsesApi: true,
            },
          },
        });

        expect(completion.text).toBe("4");
        expect(server.requests).toHaveLength(1);
        const [request] = server.requests;
        expect(request.method).toBe("POST");
        expect(request.url).toBe("/v1/responses");
        expect(request.headers.authorization).toBe("Bearer openai-api-key");
        expect(JSON.parse(request.body)).toMatchObject({
          model: "gpt-4o-mini",
        });
      },
    );

    test(
      "OpenAI Responses API streaming returns text instead of content block arrays",
      { timeout: 30_000 },
      async () => {
        const server = await spinUp((_req, _body, res) => {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });

          const writeEvent = (event: Record<string, unknown>) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          };

          writeEvent({
            type: "response.created",
            response: {
              id: "resp_test",
              model: "gpt-4o-mini",
            },
          });
          writeEvent({
            type: "response.output_item.added",
            output_index: 0,
            item: {
              id: "msg_test",
              type: "message",
              status: "in_progress",
              role: "assistant",
              content: [],
              phase: "final_answer",
            },
          });
          writeEvent({
            type: "response.output_text.delta",
            item_id: "msg_test",
            output_index: 0,
            content_index: 0,
            delta: "pong",
          });
          writeEvent({
            type: "response.completed",
            response: OPENAI_RESPONSES_RESPONSE,
          });
          res.write("data: [DONE]\n\n");
          res.end();
        });

        const stream = await streamLLMText({
          messages: [
            {
              role: "user",
              content: "What is 2+2? Answer only with the number.",
            },
          ],
          model: {
            adapter: LLMAdapter.OpenAI,
            id: "gpt-4o-mini",
          },
          temperature: 0,
          maxOutputTokens: 10,
          connection: {
            secretKey: encrypt("openai-api-key"),
            baseURL: `${server.url}/v1`,
            config: {
              useResponsesApi: true,
            },
          },
        });

        let text = "";
        for await (const chunk of stream.textStream) {
          text += chunk;
        }

        expect(text).toBe("pong");
        expect(server.requests).toHaveLength(1);
        expect(server.requests[0].url).toBe("/v1/responses");
      },
    );

    test(
      "strips encrypted connection headers from cross-origin redirects",
      { timeout: 30_000 },
      async () => {
        const target = await spinUp((_req, _body, res) => {
          res.setHeader("content-type", "application/json");
          res.end(OPENAI_RESPONSE_BODY);
        });
        const redirector = await spinUp((_req, _body, res) => {
          res.statusCode = 307;
          res.setHeader("location", `${target.url}/v1/chat/completions`);
          res.end();
        });

        const completion = await generateLLMText({
          messages: [{ role: "user", content: "Say 4" }],
          model: {
            adapter: LLMAdapter.OpenAI,
            id: "gpt-4o-mini",
          },
          connection: {
            secretKey: encrypt("openai-api-key"),
            baseURL: `${redirector.url}/v1`,
            extraHeaders: encrypt(
              JSON.stringify({ "x-gateway-token": "gateway-secret" }),
            ),
          },
        });

        expect(completion.text).toBe("4");
        expect(redirector.requests).toHaveLength(1);
        expect(redirector.requests[0].headers["x-gateway-token"]).toBe(
          "gateway-secret",
        );
        expect(target.requests).toHaveLength(1);
        expect(target.requests[0].headers["x-gateway-token"]).toBeUndefined();
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
      ).rejects.toEqual(
        expect.objectContaining<Partial<LLMValidationError>>({
          name: "LLMValidationError",
          code: "invalid-connection",
        }),
      );
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

  describe("abort signal propagation", () => {
    test("forwards the caller's signal instance to the underlying fetch", async () => {
      // Identity matters, not just abort wiring: undici links init.signal to
      // a derived request.signal through a WeakRef'd AbortController owned by
      // the temporary Request used for input normalization. Once GC collects
      // that Request, abort propagation silently stops and runtime timeouts
      // (e.g. the AI SDK engine's native timeout) never cancel the HTTP
      // request. Forwarding the caller's own signal is the only GC-safe wiring.
      const receivedSignals: Array<AbortSignal | null | undefined> = [];
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (_input, init) => {
          receivedSignals.push(init?.signal);
          return new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        });

      const controller = new AbortController();
      const secureFetch = createSecureLlmFetch({
        logContext: "Test LLM endpoint",
      });

      await secureFetch("http://127.0.0.1:65535/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
        signal: controller.signal,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(receivedSignals[0]).toBe(controller.signal);
    });

    test("aborting the caller's signal cancels an in-flight body read", async () => {
      const server = await spinUp((_req, _body, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"id":"chatcmpl-test","choices":[');
        // Never end the body: only signal propagation can terminate the read.
      });

      const secureFetch = createSecureLlmFetch({
        logContext: "Test LLM endpoint",
      });

      const start = Date.now();
      await expect(async () => {
        const response = await secureFetch(
          `${server.url}/v1/chat/completions`,
          {
            method: "POST",
            body: JSON.stringify({ messages: [] }),
            signal: AbortSignal.timeout(1_000),
          },
        );
        await response.text();
      }).rejects.toThrow(/timeout|abort/i);
      // Well below the 10s test timeout: proves the abort ended the read
      // instead of the request running until the server gives up.
      expect(Date.now() - start).toBeLessThan(5_000);
    }, 10_000);
  });
});
