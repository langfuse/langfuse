import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { signHmacSha256 } from "@/src/server/utils/hmac";
import { createEs256JwtSigner } from "@/src/server/utils/jwt";
import { UnauthorizedError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";

import { verifyGatewayIngestionAuthorization } from "./ingestionTokenVerifier";

const { privateKey, publicKey } = vi.hoisted(() => ({
  privateKey: `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgO9UaI+6vJ8r+i6e9
Jq+IyijVtDDlhQm9po9oUWBL9aWhRANCAASKwbdc48K11rY2hLvCTdeKwqxyefeH
jeV98Ug14YPox+zv3DAVejtbyJEsLK6lRzWuMiYUmR2zZD0Ow/bVHs7a
-----END PRIVATE KEY-----
`,
  publicKey: `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEisG3XOPCtda2NoS7wk3XisKscnn3
h43lffFINeGD6Mfs79wwFXo7W8iRLCyupUc1rjImFJkds2Q9DsP21R7O2g==
-----END PUBLIC KEY-----
`,
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_GATEWAY_JWT_PUBLIC_KEY: publicKey,
    LANGFUSE_GATEWAY_JWT_KEY_ID: "current",
    LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID: undefined,
    LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY: undefined,
    LANGFUSE_GATEWAY_JWT_ISSUER: "test-issuer",
    LANGFUSE_GATEWAY_JWT_AUDIENCE: "test-audience",
    LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST: ["org-1"],
    LANGFUSE_GATEWAY_SERVICE_KEY: "current-service-key",
    LANGFUSE_GATEWAY_SERVICE_KEY_PREVIOUS: "previous-service-key",
  },
}));

const signer = createEs256JwtSigner({
  privateKey,
  keyId: "current",
  issuer: "test-issuer",
  audience: "test-audience",
});

function token(organizationId = "org-1") {
  return signer.sign({
    expiresInSeconds: 60,
    claims: {
      version: 1,
      organization_id: organizationId,
      project_id: "project-1",
      api_key_id: "gateway-api-key-1",
      ingestion_mode: "full",
      scope: "gateway-ingest",
    },
  });
}

function gatewayAuthorization(
  ingestionToken: string,
  overrides: { timestamp?: number; secret?: string } = {},
) {
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const tokenHash = createHash("sha256")
    .update(ingestionToken, "utf8")
    .digest("hex");
  const signature = signHmacSha256(
    ["gateway-web-v1", timestamp.toString(), tokenHash].join("\n"),
    overrides.secret ?? "current-service-key",
  );
  return `HMAC timestamp=${timestamp},signature=${signature}`;
}

function signedRequest(
  organizationId = "org-1",
  overrides: { timestamp?: number; secret?: string } = {},
) {
  const ingestionToken = token(organizationId);
  return {
    authorization: `Bearer ${ingestionToken}`,
    gatewayAuthorization: gatewayAuthorization(ingestionToken, overrides),
  };
}

function database(input: { project?: object | null } = {}) {
  return {
    project: {
      findFirst: vi.fn().mockResolvedValue(
        input.project === undefined
          ? {
              id: "project-1",
              organization: {
                id: "org-1",
                cloudConfig: null,
                cloudFreeTierUsageThresholdState: "OK",
              },
            }
          : input.project,
      ),
    },
  } as unknown as PrismaClient;
}

describe("verifyGatewayIngestionAuthorization without signing keys", () => {
  it("rejects a public key without its stable key ID", async () => {
    vi.resetModules();
    vi.doMock("@/src/env.mjs", () => ({
      env: {
        LANGFUSE_GATEWAY_JWT_PUBLIC_KEY: publicKey,
        LANGFUSE_GATEWAY_JWT_KEY_ID: undefined,
        LANGFUSE_GATEWAY_JWT_PREVIOUS_KEY_ID: undefined,
        LANGFUSE_GATEWAY_JWT_PREVIOUS_PUBLIC_KEY: undefined,
        LANGFUSE_GATEWAY_JWT_ISSUER: "test-issuer",
        LANGFUSE_GATEWAY_JWT_AUDIENCE: "test-audience",
      },
    }));

    await expect(import("./ingestionTokenVerifier")).rejects.toThrow(
      "LANGFUSE_GATEWAY_JWT_KEY_ID and LANGFUSE_GATEWAY_JWT_PUBLIC_KEY must be set together",
    );

    vi.doUnmock("@/src/env.mjs");
    vi.resetModules();
  });

  it("stays inert so the regular API-key verifier still sees the header", async () => {
    // Every deployment that never enabled the gateway is in this state. If the
    // verifier rejected here, any three-part bearer token would 401 before the
    // normal auth path ever ran.
    vi.resetModules();
    vi.doMock("@/src/env.mjs", () => ({
      env: { LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST: [] },
    }));
    const { verifyGatewayIngestionAuthorization: verifyWithoutKeys } =
      await import("./ingestionTokenVerifier");

    await expect(
      verifyWithoutKeys(
        `Bearer ${token()}`,
        undefined,
        {} as unknown as PrismaClient,
      ),
    ).resolves.toBeNull();

    vi.doUnmock("@/src/env.mjs");
    vi.resetModules();
  });
});

describe("verifyGatewayIngestionAuthorization", () => {
  it("rejects tokens for organizations outside the allowlist", async () => {
    const db = database();

    const request = signedRequest("org-not-allowed");
    await expect(
      verifyGatewayIngestionAuthorization(
        request.authorization,
        request.gatewayAuthorization,
        db,
      ),
    ).rejects.toThrow("AI Gateway is not enabled for this organization");
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "Basic token",
    "Bearer",
    "Bearer   ",
    "bearer token",
    "Bearer token extra",
  ])("ignores a non-gateway Bearer header: %s", async (authorization) => {
    const db = database();

    await expect(
      verifyGatewayIngestionAuthorization(authorization, undefined, db),
    ).resolves.toBeNull();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it("returns project authorization for the originating gateway API key", async () => {
    const db = database();

    const request = signedRequest();
    const result = await verifyGatewayIngestionAuthorization(
      `  ${request.authorization.replace("Bearer", "Bearer   ")}  `,
      request.gatewayAuthorization,
      db,
    );
    expect(result).toMatchObject({
      validKey: true,
      scope: {
        projectId: "project-1",
        orgId: "org-1",
        apiKeyId: "gateway-api-key-1",
        publicKey: expect.stringMatching(/^gateway:/),
        accessLevel: "project",
      },
    });
    expect(db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "project-1",
          orgId: "org-1",
          deletedAt: null,
        },
      }),
    );
  });

  it("rejects a token for a missing project", async () => {
    const request = signedRequest();
    await expect(
      verifyGatewayIngestionAuthorization(
        request.authorization,
        request.gatewayAuthorization,
        database({ project: null }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("accepts a signature from the previous service key", async () => {
    const request = signedRequest("org-1", {
      secret: "previous-service-key",
    });

    await expect(
      verifyGatewayIngestionAuthorization(
        request.authorization,
        request.gatewayAuthorization,
        database(),
      ),
    ).resolves.toMatchObject({ validKey: true });
  });

  it.each([
    ["missing", undefined],
    ["malformed", "HMAC timestamp=123,signature=invalid"],
  ])("rejects %s gateway authorization", async (_label, authorization) => {
    const ingestionToken = token();

    await expect(
      verifyGatewayIngestionAuthorization(
        `Bearer ${ingestionToken}`,
        authorization,
        database(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects stale gateway authorization", async () => {
    const request = signedRequest("org-1", {
      timestamp: Math.floor(Date.now() / 1000) - 301,
    });

    await expect(
      verifyGatewayIngestionAuthorization(
        request.authorization,
        request.gatewayAuthorization,
        database(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a gateway signature for another ingestion token", async () => {
    const signed = signedRequest();

    await expect(
      verifyGatewayIngestionAuthorization(
        `Bearer ${token()}`,
        signed.gatewayAuthorization,
        database(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([
    ["a malformed JWT", "header.payload.signature"],
    [
      "a JWT without an API key ID",
      signer.sign({
        expiresInSeconds: 60,
        claims: {
          version: 1,
          organization_id: "org-1",
          project_id: "project-1",
          ingestion_mode: "full",
          scope: "gateway-ingest",
        },
      }),
    ],
  ])("rejects %s", async (_label, ingestionToken) => {
    await expect(
      verifyGatewayIngestionAuthorization(
        `Bearer ${ingestionToken}`,
        gatewayAuthorization(ingestionToken),
        database(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
