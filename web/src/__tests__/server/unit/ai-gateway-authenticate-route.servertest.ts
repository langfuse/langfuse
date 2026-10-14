import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { env } from "@/src/env.mjs";
import handler from "@/src/pages/api/internal/ai-gateway/v1/authenticate";

const mutableEnv = env as { LANGFUSE_AI_GATEWAY_SERVICE_KEY?: string };
const originalServiceKey = mutableEnv.LANGFUSE_AI_GATEWAY_SERVICE_KEY;

beforeAll(() => {
  mutableEnv.LANGFUSE_AI_GATEWAY_SERVICE_KEY = "0".repeat(64);
});

afterAll(() => {
  mutableEnv.LANGFUSE_AI_GATEWAY_SERVICE_KEY = originalServiceKey;
});

describe("GET /api/internal/ai-gateway/v1/authenticate", () => {
  it("validates the API format before signature verification", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: { authorization: "Bearer test-key" },
      query: { api_format: "openai.responses" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.getHeader("cache-control")).toBe("no-store");
  });

  it("rejects malformed requests without reading a body", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: { authorization: "Bearer test-key" },
      query: { api_format: "unsupported" },
      body: new Error("body must not be read"),
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it("allows only GET", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("allow")).toBe("GET");
  });
});
