import { Readable } from "node:stream";

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
  it.each([
    undefined,
    "Basic sk-gateway",
    "Bearer",
    "Bearer   ",
    "bearer sk-gateway",
  ])("rejects an invalid Bearer header: %s", async (authorization) => {
    const req = {
      method: "POST",
      headers: { authorization },
      body: { api_format: "openai.responses" },
    } as unknown as NextApiRequest;
    const res = response();
    const authenticate = vi.fn();

    await withGatewayResolveAuth(vi.fn(), authenticate)(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(authenticate).not.toHaveBeenCalled();
  });

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
      requestBody: '{"api_format":"openai.responses"}',
      gatewayAuthorization: "HMAC signed",
    });
    expect(handler).toHaveBeenCalledWith({
      req,
      res,
      auth: { organizationId: "org-1", apiKeyId: "key-1" },
      apiFormat: "openai.responses",
    });
  });

  it("passes the exact raw request body to HMAC verification", async () => {
    const requestBody = '{ "api_format": "openai.responses" }\n';
    const req = Object.assign(Readable.from([requestBody]), {
      method: "POST",
      headers: {
        authorization: "Bearer sk-gateway",
        "langfuse-gateway-authorization": "HMAC signed",
      },
      body: undefined,
    }) as unknown as NextApiRequest;
    const authenticate = vi.fn().mockResolvedValue({
      organizationId: "org-1",
      apiKeyId: "key-1",
    });

    await withGatewayResolveAuth(
      vi.fn().mockResolvedValue(undefined),
      authenticate,
    )(req, response());

    expect(authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody }),
    );
  });
});
