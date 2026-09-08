import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { NextApiRequest, NextApiResponse } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signHmacSha256 } from "@/src/server/utils/hmac";
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

import {
  withGatewayModelsAuth,
  withGatewayResolveAuth,
} from "./gatewayAuthVerifier";

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_GATEWAY_SERVICE_KEY: "current-service-secret",
    LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS: "previous-service-secret",
    LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST: ["org-1"],
    SALT: "test-salt",
  },
}));

const now = new Date("2026-09-07T12:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

function request(input: {
  authorization?: string;
  gatewayAuthorization?: string;
  body?: string;
}) {
  return Object.assign(Readable.from([input.body ?? ""]), {
    method: "POST",
    headers: {
      authorization: input.authorization,
      "langfuse-gateway-authorization": input.gatewayAuthorization,
    },
    body: undefined,
  }) as unknown as NextApiRequest;
}

function gatewayAuthorization(input: {
  secret: string;
  timestamp?: number;
  key?: string;
}) {
  const timestamp = input.timestamp ?? Math.floor(now.getTime() / 1000);
  const sha256 = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");
  const canonicalMessage = [
    "gateway-web-v1",
    timestamp.toString(),
    sha256(input.key ?? "sk-gateway"),
  ].join("\n");
  return `HMAC timestamp=${timestamp},signature=${signHmacSha256(
    canonicalMessage,
    input.secret,
  )}`;
}

describe("withGatewayResolveAuth", () => {
  it.each([
    undefined,
    "Basic sk-gateway",
    "Bearer",
    "Bearer   ",
    "bearer sk-gateway",
    "Bearer sk-gateway extra",
  ])("rejects an invalid Bearer header: %s", async (authorization) => {
    const handler = vi.fn();
    const res = response();

    await withGatewayResolveAuth(handler)(
      request({
        authorization,
        body: '{"api_format":"openai.responses"}',
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["current-service-secret", "previous-service-secret"])(
    "verifies the RFC payload with configured secret %s",
    async (secret) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const body = '{ "api_format": "openai.responses" }\n';
      const req = request({
        authorization: "  Bearer   sk-gateway  ",
        gatewayAuthorization: gatewayAuthorization({ secret }),
        body,
      });
      const res = response();
      const handler = vi.fn().mockResolvedValue(undefined);

      await withGatewayResolveAuth(handler)(req, res);

      expect(handler).toHaveBeenCalledWith({
        req,
        res,
        fastHashedSecretKey: createShaHash("sk-gateway", "test-salt"),
        apiFormat: "openai.responses",
      });
    },
  );

  it("accepts the same signature on the models endpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const body = '{"api_format":"anthropic.messages","limit":10}';
    const handler = vi.fn().mockResolvedValue(undefined);
    const req = request({
      authorization: "Bearer sk-gateway",
      gatewayAuthorization: gatewayAuthorization({
        secret: "current-service-secret",
      }),
      body,
    });
    const res = response();

    await withGatewayModelsAuth(handler)(req, res);

    expect(handler).toHaveBeenCalledWith({
      req,
      res,
      fastHashedSecretKey: createShaHash("sk-gateway", "test-salt"),
      apiFormat: "anthropic.messages",
      limit: 10,
    });
  });

  it("rejects a signature made for a different gateway key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const handler = vi.fn();
    const res = response();

    await withGatewayResolveAuth(handler)(
      request({
        authorization: "Bearer sk-gateway",
        gatewayAuthorization: gatewayAuthorization({
          secret: "current-service-secret",
          key: "sk-other-gateway",
        }),
        body: '{"api_format":"openai.responses"}',
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects stale signatures and headers containing a key id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const body = '{"api_format":"openai.responses"}';
    const staleHeader = gatewayAuthorization({
      secret: "current-service-secret",
      timestamp: Math.floor(now.getTime() / 1000) - 301,
    });

    for (const header of [staleHeader, `${staleHeader},keyid=current`]) {
      const handler = vi.fn();
      const res = response();
      await withGatewayResolveAuth(handler)(
        request({
          authorization: "Bearer sk-gateway",
          gatewayAuthorization: header,
          body,
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(handler).not.toHaveBeenCalled();
    }
  });
});
