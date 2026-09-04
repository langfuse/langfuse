import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { describe, expect, it } from "vitest";

import handler from "@/src/pages/api/internal/ai-gateway/v1/resolve";

describe("POST /api/internal/ai-gateway/v1/resolve", () => {
  it("rejects malformed requests with no-store headers", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { authorization: "Bearer test-key" },
      body: { api_format: "unsupported" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.getHeader("cache-control")).toBe("no-store");
    expect(res.getHeader("pragma")).toBe("no-cache");
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
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { api_format: "openai.responses" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });
});
