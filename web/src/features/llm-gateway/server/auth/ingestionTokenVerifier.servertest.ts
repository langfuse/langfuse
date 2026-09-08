import { describe, expect, it, vi } from "vitest";

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
      key_id: "key-1",
      instrumentation_mode: "full",
      scope: "gateway-ingest",
    },
  });
}

function database(
  input: { project?: object | null; association?: object | null } = {},
) {
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
    gatewayApiKeyAssociation: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.association === undefined
            ? { apiKeyId: "key-1" }
            : input.association,
        ),
    },
  } as unknown as PrismaClient;
}

describe("verifyGatewayIngestionAuthorization without signing keys", () => {
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
      verifyWithoutKeys(`Bearer ${token()}`, {} as unknown as PrismaClient),
    ).resolves.toBeNull();

    vi.doUnmock("@/src/env.mjs");
    vi.resetModules();
  });
});

describe("verifyGatewayIngestionAuthorization", () => {
  it("rejects tokens for organizations outside the allowlist", async () => {
    const db = database();

    await expect(
      verifyGatewayIngestionAuthorization(
        `Bearer ${token("org-not-allowed")}`,
        db,
      ),
    ).rejects.toThrow("LLM Gateway is not enabled for this organization");
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
      verifyGatewayIngestionAuthorization(authorization, db),
    ).resolves.toBeNull();
    expect(db.project.findFirst).not.toHaveBeenCalled();
  });

  it("returns project authorization for a live key association", async () => {
    const db = database();

    await expect(
      verifyGatewayIngestionAuthorization(`  Bearer   ${token()}  `, db),
    ).resolves.toMatchObject({
      validKey: true,
      scope: {
        projectId: "project-1",
        orgId: "org-1",
        apiKeyId: "key-1",
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
    expect(db.gatewayApiKeyAssociation.findFirst).toHaveBeenCalledWith({
      where: { apiKeyId: "key-1", apiKey: { orgId: "org-1" } },
      select: { apiKeyId: true },
    });
  });

  it.each([{ project: null }, { association: null }])(
    "rejects stale token context: %o",
    async (missing) => {
      await expect(
        verifyGatewayIngestionAuthorization(
          `Bearer ${token()}`,
          database(missing),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    },
  );

  it("rejects a malformed JWT", async () => {
    await expect(
      verifyGatewayIngestionAuthorization(
        "Bearer header.payload.signature",
        database(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
