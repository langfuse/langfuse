import { createHash, createHmac, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createEd25519JwtSigner,
  createEd25519JwtVerifier,
} from "@/src/server/utils/jwt";

import {
  GatewayIngestionClaimsSchema,
  issueGatewayIngestionToken,
} from "./ingestionToken";
import { verifyGatewayHmacAuthorization } from "./auth";

function createTestGatewayHmacSignature(input: {
  timestamp: number;
  virtualSecretKey: string;
  requestBody: string;
  serviceKey: string;
}) {
  const sha256 = (value: string) =>
    createHash("sha256").update(value, "utf8").digest("hex");
  const canonicalMessage = [
    input.timestamp.toString(),
    sha256(input.virtualSecretKey),
    "/api/internal/ai-gateway/v1/resolve",
    "POST",
    sha256(input.requestBody),
  ].join("\n");
  return createHmac("sha256", input.serviceKey)
    .update(canonicalMessage, "utf8")
    .digest("base64url");
}

describe("LLM gateway authentication", () => {
  it("uses a deterministic canonical message and verifies current/previous keys", () => {
    const input = {
      timestamp: 1_788_430_200,
      virtualSecretKey: "sk-lf-user-key",
      requestBody: '{"api_format":"openai.responses"}',
    };

    const signature = createTestGatewayHmacSignature({
      ...input,
      serviceKey: "previous-service-key",
    });

    expect(
      verifyGatewayHmacAuthorization({
        header: `HMAC timestamp=${input.timestamp},signature=${signature}`,
        virtualSecretKey: input.virtualSecretKey,
        requestBody: input.requestBody,
        now: new Date(input.timestamp * 1000),
        keys: [
          { secret: "current-service-key" },
          { secret: "previous-service-key" },
        ],
      }),
    ).toBe(true);
    expect(
      verifyGatewayHmacAuthorization({
        header: `HMAC timestamp=${input.timestamp},signature=${signature}`,
        virtualSecretKey: input.virtualSecretKey,
        requestBody: '{"api_format":"anthropic.messages"}',
        now: new Date(input.timestamp * 1000),
        keys: [{ secret: "previous-service-key" }],
      }),
    ).toBe(false);
  });

  it("applies gateway claims and a 15-minute ingestion token lifetime", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const now = new Date("2026-09-04T15:00:00.000Z");
    const privateKeyPem = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const publicKeyPem = publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    const signer = createEd25519JwtSigner({
      privateKey: privateKeyPem,
      keyId: "current",
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
    });
    const verifier = createEd25519JwtVerifier({
      publicKeys: [{ id: "current", publicKey: publicKeyPem }],
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
      claimsSchema: GatewayIngestionClaimsSchema,
    });

    const token = issueGatewayIngestionToken({
      signer,
      now,
      claims: {
        organizationId: "org-1",
        projectId: "project-1",
        keyId: "gateway-key-1",
        instrumentation_mode: "full",
      },
    });

    const verified = verifier.verify({
      token,
      now,
    });

    expect(verified).toMatchObject({
      version: 1,
      organizationId: "org-1",
      projectId: "project-1",
      keyId: "gateway-key-1",
      instrumentation_mode: "full",
      scope: "gateway-ingest",
      iss: "langfuse-control-plane",
      aud: "langfuse-ingestion",
    });
    expect(verified.exp - verified.iat).toBe(15 * 60);
    expect(verified.jti).toEqual(expect.any(String));

    const wrongScopeToken = createEd25519JwtSigner({
      privateKey: privateKeyPem,
      keyId: "current",
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
    }).sign({
      expiresInSeconds: 15 * 60,
      now,
      claims: {
        version: 1,
        organizationId: "org-1",
        projectId: "project-1",
        keyId: "gateway-key-1",
        instrumentation_mode: "usage",
        scope: "unrelated-api",
      },
    });
    expect(() =>
      verifier.verify({
        token: wrongScopeToken,
        now,
      }),
    ).toThrow();
  });
});
