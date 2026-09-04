import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildGatewayHmacCanonicalMessage,
  createGatewayHmacSignature,
  issueGatewayIngestionToken,
  verifyGatewayHmacAuthorization,
  verifyGatewayIngestionToken,
} from "@/src/features/llm-gateway/server/auth";

describe("LLM gateway authentication", () => {
  it("uses a deterministic canonical message and verifies current/previous keys", () => {
    const input = {
      timestamp: 1_788_430_200,
      virtualSecretKey: "sk-lf-not-a-real-secret",
      apiFormat: "openai.responses" as const,
    };

    expect(buildGatewayHmacCanonicalMessage(input)).toBe(
      "POST\n/api/internal/ai-gateway/v1/resolve\n1788430200\n" +
        "b1274a522d31ebb91aacc5fac0b7cf2264289c73c8f4390176277125c0603081\n" +
        "openai.responses",
    );

    const signature = createGatewayHmacSignature({
      ...input,
      serviceKey: "previous-service-key",
    });

    expect(
      verifyGatewayHmacAuthorization({
        header: `HMAC keyId=previous,timestamp=${input.timestamp},signature=${signature}`,
        virtualSecretKey: input.virtualSecretKey,
        apiFormat: input.apiFormat,
        keys: [
          { id: "current", secret: "current-service-key" },
          { id: "previous", secret: "previous-service-key" },
        ],
      }),
    ).toBe(true);
    expect(
      verifyGatewayHmacAuthorization({
        header: `HMAC keyId=previous,timestamp=${input.timestamp},signature=${signature}`,
        virtualSecretKey: "different",
        apiFormat: input.apiFormat,
        keys: [{ id: "previous", secret: "previous-service-key" }],
      }),
    ).toBe(false);
  });

  it("issues and verifies a 15-minute Ed25519 ingestion token by kid", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const previous = generateKeyPairSync("ed25519");
    const now = new Date("2026-09-04T15:00:00.000Z");

    const token = issueGatewayIngestionToken({
      privateKey: privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      keyId: "current",
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
      now,
      claims: {
        organizationId: "org-1",
        projectId: "project-1",
        keyId: "gateway-key-1",
        instrumentation_mode: "full",
      },
    });

    const verified = verifyGatewayIngestionToken({
      token,
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
      now,
      publicKeys: [
        {
          id: "previous",
          publicKey: previous.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
        {
          id: "current",
          publicKey: publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      ],
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

    const previousToken = issueGatewayIngestionToken({
      privateKey: previous.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      keyId: "previous",
      issuer: "langfuse-control-plane",
      audience: "langfuse-ingestion",
      now,
      claims: {
        organizationId: "org-1",
        projectId: "project-1",
        keyId: "gateway-key-1",
        instrumentation_mode: "usage",
      },
    });
    expect(
      verifyGatewayIngestionToken({
        token: previousToken,
        issuer: "langfuse-control-plane",
        audience: "langfuse-ingestion",
        now,
        publicKeys: [
          {
            id: "previous",
            publicKey: previous.publicKey
              .export({ format: "pem", type: "spki" })
              .toString(),
          },
        ],
      }).instrumentation_mode,
    ).toBe("usage");

    expect(() =>
      verifyGatewayIngestionToken({
        token,
        issuer: "langfuse-control-plane",
        audience: "langfuse-ingestion",
        now: new Date(now.getTime() + 15 * 60 * 1000),
        publicKeys: [
          {
            id: "current",
            publicKey: publicKey
              .export({ format: "pem", type: "spki" })
              .toString(),
          },
        ],
      }),
    ).toThrow("claims");

    const [header, payload] = token.split(".");
    const wrongScopePayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
        scope: "unrelated-api",
      }),
    ).toString("base64url");
    const signingInput = `${header}.${wrongScopePayload}`;
    const wrongScopeToken = `${signingInput}.${sign(
      null,
      Buffer.from(signingInput),
      privateKey,
    ).toString("base64url")}`;
    expect(() =>
      verifyGatewayIngestionToken({
        token: wrongScopeToken,
        issuer: "langfuse-control-plane",
        audience: "langfuse-ingestion",
        now,
        publicKeys: [
          {
            id: "current",
            publicKey: publicKey
              .export({ format: "pem", type: "spki" })
              .toString(),
          },
        ],
      }),
    ).toThrow();
  });
});
