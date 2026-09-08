import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/src/env.mjs";
import handler from "@/src/pages/api/internal/ai-gateway/v1/models";

// `env` is typed readonly, but the route reads it at call time, so overriding
// the field is how a test controls configuration.
const mutableEnv = env as { LANGFUSE_GATEWAY_SERVICE_KEY?: string };
const originalServiceKey = mutableEnv.LANGFUSE_GATEWAY_SERVICE_KEY;

// Without a configured service key the route answers 503 for everything, which
// would hide the 400-vs-401 distinction the assertions below rely on.
beforeAll(() => {
  mutableEnv.LANGFUSE_GATEWAY_SERVICE_KEY = "0".repeat(64);
});

afterAll(() => {
  mutableEnv.LANGFUSE_GATEWAY_SERVICE_KEY = originalServiceKey;
});

// The route reads the raw body itself (`bodyParser: false`), so bodies must be
// strings. A parsed object short-circuits with 400 before the schema runs,
// which would make every assertion below pass for the wrong reason.
const post = async (body: unknown) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    headers: { authorization: "Bearer test-key" },
    body: JSON.stringify(body) as never,
  });

  await handler(req, res);
  return res;
};

describe("POST /api/internal/ai-gateway/v1/models", () => {
  it("rejects malformed requests with no-store headers", async () => {
    const res = await post({ api_format: "unsupported" });

    expect(res.statusCode).toBe(400);
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(res.getHeader("pragma")).toBe("no-cache");
  });

  it.each([
    {
      case: "pagination on openai.responses",
      body: { api_format: "openai.responses", limit: 10 },
    },
    {
      case: "pagination on openai.chat-completions",
      body: { api_format: "openai.chat-completions", after_id: "model-a" },
    },
    {
      case: "before_id and after_id together",
      body: {
        api_format: "anthropic.messages",
        before_id: "model-a",
        after_id: "model-b",
      },
    },
    {
      case: "limit above the maximum",
      body: { api_format: "anthropic.messages", limit: 1001 },
    },
    {
      case: "non-integer limit",
      body: { api_format: "anthropic.messages", limit: 1.5 },
    },
    {
      case: "empty cursor",
      body: { api_format: "anthropic.messages", before_id: "" },
    },
  ])("rejects an invalid body: $case", async ({ body }) => {
    expect((await post(body)).statusCode).toBe(400);
  });

  it.each([
    { case: "openai.responses", body: { api_format: "openai.responses" } },
    {
      case: "openai.chat-completions",
      body: { api_format: "openai.chat-completions" },
    },
    {
      case: "anthropic.messages without pagination",
      body: { api_format: "anthropic.messages" },
    },
    {
      case: "anthropic.messages with a cursor and limit",
      body: { api_format: "anthropic.messages", after_id: "model-a", limit: 5 },
    },
  ])(
    "accepts a valid body and advances to authorization: $case",
    async ({ body }) => {
      // 401 rather than 400 proves the body passed the schema: the route only
      // reaches signature verification after parsing succeeds.
      expect((await post(body)).statusCode).toBe(401);
    },
  );

  it("allows only POST", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("allow")).toBe("POST");
  });

  it("rejects missing bearer authentication", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: JSON.stringify({ api_format: "openai.responses" }) as never,
    });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });
});
