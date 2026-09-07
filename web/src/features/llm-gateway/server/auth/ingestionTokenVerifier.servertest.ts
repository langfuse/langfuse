import { describe, expect, it, vi } from "vitest";

import { createEd25519JwtSigner } from "@/src/server/utils/jwt";
import { UnauthorizedError } from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";

import { verifyGatewayIngestionAuthorization } from "./ingestionTokenVerifier";

const { privateKey, publicKey } = vi.hoisted(() => ({
  privateKey: `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEILrtV4AwkFG9CqtDazO99CkO5yxiOKHhCcfIWF3vvOSz
-----END PRIVATE KEY-----
`,
  publicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANHNV5VqgO9My3bkWvHc6oXdsstmalnhjePUfq9Ao168=
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
  },
}));

const signer = createEd25519JwtSigner({
  privateKey,
  keyId: "current",
  issuer: "test-issuer",
  audience: "test-audience",
});

function token() {
  return signer.sign({
    expiresInSeconds: 60,
    claims: {
      version: 1,
      organizationId: "org-1",
      projectId: "project-1",
      keyId: "key-1",
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

describe("verifyGatewayIngestionAuthorization", () => {
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
