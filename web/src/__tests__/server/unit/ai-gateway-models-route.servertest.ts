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

const get = async (query: Record<string, string | string[] | undefined>) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    headers: { authorization: "Bearer test-key" },
    query,
  });

  await handler(req, res);
  return res;
};

describe("GET /api/internal/ai-gateway/v1/models", () => {
  it("rejects malformed requests with no-store headers", async () => {
    const res = await get({ api_format: "unsupported" });

    expect(res.statusCode).toBe(400);
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(res.getHeader("pragma")).toBe("no-cache");
  });

  it.each([
    { case: "missing api_format", query: {} },
    {
      case: "repeated api_format",
      query: { api_format: ["openai.responses", "anthropic.messages"] },
    },
    {
      case: "unexpected query parameter",
      query: { api_format: "anthropic.messages", limit: "10" },
    },
  ])("rejects an invalid query: $case", async ({ query }) => {
    expect((await get(query)).statusCode).toBe(400);
  });

  it.each([
    "openai.responses",
    "openai.chat-completions",
    "anthropic.messages",
  ])(
    "accepts api_format=%s and advances to authorization",
    async (apiFormat) => {
      // 401 rather than 400 proves the query passed the schema: the route only
      // reaches signature verification after parsing succeeds.
      expect((await get({ api_format: apiFormat })).statusCode).toBe(401);
    },
  );

  it("allows only GET", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("allow")).toBe("GET");
  });

  it("rejects missing bearer authentication", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { api_format: "openai.responses" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });
});
