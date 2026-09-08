import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/src/env.mjs";
import handler from "@/src/pages/api/internal/ai-gateway/v1/resolve";

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
const post = async (body: unknown, authorization = "Bearer test-key") => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    headers: { authorization },
    body: JSON.stringify(body) as never,
  });

  await handler(req, res);
  return res;
};

describe("POST /api/internal/ai-gateway/v1/resolve", () => {
  it("rejects malformed requests with no-store headers", async () => {
    const res = await post({ api_format: "unsupported" });

    expect(res.statusCode).toBe(400);
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(res.getHeader("pragma")).toBe("no-cache");
  });

  it.each([
    { case: "unknown api format", body: { api_format: "openai.completions" } },
    { case: "missing api format", body: {} },
    {
      case: "unknown extra field",
      body: { api_format: "openai.responses", limit: 10 },
    },
    { case: "not an object", body: "openai.responses" },
  ])("rejects an invalid body: $case", async ({ body }) => {
    expect((await post(body)).statusCode).toBe(400);
  });

  it.each([
    "openai.responses",
    "openai.chat-completions",
    "anthropic.messages",
  ])("accepts api format %s and advances to authorization", async (format) => {
    // 401 rather than 400 proves the body passed the schema: the route only
    // reaches signature verification after parsing succeeds.
    expect((await post({ api_format: format })).statusCode).toBe(401);
  });

  it("accepts a model without using it for resolution", async () => {
    expect(
      (
        await post({
          api_format: "openai.responses",
          model: "gpt-4o-mini",
        })
      ).statusCode,
    ).toBe(401);
  });

  it("rejects a body that is not valid JSON", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { authorization: "Bearer test-key" },
      body: "{not-json" as never,
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it("allows only POST", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("allow")).toBe("POST");
  });

  it("rejects missing bearer authentication", async () => {
    expect(
      (await post({ api_format: "openai.responses" }, "")).statusCode,
    ).toBe(401);
  });
});
