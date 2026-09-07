import type { NextApiRequest, NextApiResponse } from "next";
import { describe, expect, it, vi } from "vitest";

import { withGatewayResolveAuth } from "./gatewayResolveAuth";

function response() {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as NextApiResponse;
}

describe("withGatewayResolveAuth", () => {
  it("authenticates the request and injects the trusted gateway context", async () => {
    const req = {
      method: "POST",
      headers: {
        authorization: "Bearer sk-gateway",
        "langfuse-gateway-authorization": "HMAC signed",
      },
      body: { api_format: "openai.responses" },
    } as unknown as NextApiRequest;
    const res = response();
    const authenticate = vi.fn().mockResolvedValue({
      organizationId: "org-1",
      apiKeyId: "key-1",
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    await withGatewayResolveAuth(handler, authenticate)(req, res);

    expect(authenticate).toHaveBeenCalledWith({
      virtualSecretKey: "sk-gateway",
      apiFormat: "openai.responses",
      gatewayAuthorization: "HMAC signed",
    });
    expect(handler).toHaveBeenCalledWith({
      req,
      res,
      auth: { organizationId: "org-1", apiKeyId: "key-1" },
      apiFormat: "openai.responses",
    });
  });
});
