import type { PrismaClient } from "@langfuse/shared/src/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GatewayApiKeyAuthenticator } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider";
import { GatewayResolveService } from "./resolveService";

const mockEnv = vi.hoisted(() => ({
  LANGFUSE_AI_GATEWAY_DEPLOYED: "true",
  LANGFUSE_AI_GATEWAY_ENABLED: "false",
  LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST: ["org-1"],
  // Caching is covered against real Redis in the control-plane servertest;
  // these cases are about what the service does with a database row.
  LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "false",
  LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY: "private-key" as string | undefined,
  LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY: "public-key" as string | undefined,
  LANGFUSE_AI_GATEWAY_JWT_KEY_ID: "key-id" as string | undefined,
  LANGFUSE_AI_GATEWAY_JWT_ISSUER: "test-issuer",
  LANGFUSE_AI_GATEWAY_JWT_AUDIENCE: "test-audience",
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
}));

vi.mock("@/src/env.mjs", () => ({ env: mockEnv }));

vi.mock("@/src/server/utils/jwt", () => ({
  createEs256JwtSigner: vi.fn(() => ({
    sign: vi.fn(() => "ingestion-token"),
  })),
  createEs256JwtVerifier: vi.fn(() => ({ verify: vi.fn() })),
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "sk-test"),
}));

const serviceWith = (findFirst: () => Promise<unknown>, keyOrgId = "org-1") => {
  const prisma = {
    apiKey: { findFirst },
    roleAssignment: {
      findMany: () =>
        Promise.resolve([
          { systemRole: "AI_GATEWAY", orgId: keyOrgId, projectId: null },
        ]),
    },
  } as unknown as PrismaClient;
  const contextResolver = new GatewayApiKeyAuthenticator(prisma);
  const service = new GatewayResolveService();

  return {
    resolve: async (params: {
      fastHashedSecretKey: string;
      apiFormat: GatewayApiFormat;
    }) => {
      const context = await contextResolver.authenticateRequest({
        ...params,
        model: "Production OpenAI:gpt-4o",
      });
      return service.resolve({ context, apiFormat: params.apiFormat });
    },
  };
};

const row = (overrides: {
  ingestionMode?: string;
  projectOrgId?: string;
  withoutProject?: boolean;
  metadata?: unknown;
  userId?: string | null;
  note?: string | null;
  user?: { name: string | null; email: string | null } | null;
}) => ({
  id: "key-1",
  orgId: "org-1",
  userId: overrides.userId === undefined ? "user-1" : overrides.userId,
  expiresAt: null,
  note: overrides.note === undefined ? "CI key" : overrides.note,
  user:
    overrides.user === undefined
      ? { name: "Alice", email: "alice@example.com" }
      : overrides.user,
  gatewayAssociation:
    overrides.metadata === undefined ? null : { metadata: overrides.metadata },
  organization: {
    gatewayConfig: {
      defaultIngestionProjectId: overrides.withoutProject ? null : "project-1",
      ingestionMode: overrides.ingestionMode ?? "USAGE",
      defaultIngestionProject: overrides.withoutProject
        ? null
        : {
            id: "project-1",
            orgId: overrides.projectOrgId ?? "org-1",
            deletedAt: null,
          },
    },
    gatewayAiConnections: [
      {
        id: "connection-1",
        name: "Production OpenAI",
        provider: "OPENAI",
        encryptedCredential: "encrypted-credential",
        allowedModels: null,
      },
    ],
  },
});

describe("GatewayResolveService", () => {
  it("hands over the provider credential and cannot be told to attribute elsewhere", async () => {
    const service = serviceWith(() =>
      Promise.resolve(
        row({ metadata: { team: "platform", project_id: "spoofed-project" } }),
      ),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toEqual({
      version: 1,
      connection: {
        id: "connection-1",
        name: "Production OpenAI",
        provider: "openai",
        provider_model: "gpt-4o",
        api_format: "openai.responses",
        base_url: "https://api.openai.com/v1",
        auth: { type: "Bearer", token: "sk-test" },
      },
      // Metadata stays in its own object, so a metadata key called project_id
      // cannot redirect attribution.
      attribution: {
        organization_id: "org-1",
        project_id: "project-1",
        key_id: "key-1",
        user_id: "user-1",
        key_name: "CI key",
        user_name: "Alice",
        user_email: "alice@example.com",
        key_metadata: { team: "platform", project_id: "spoofed-project" },
        provider_connection_id: "connection-1",
      },
      ingestion_mode: "usage",
      ingestion: {
        access_token: "ingestion-token",
        token_type: "Bearer",
        expires_at: expect.any(Number),
      },
    });
  });

  it.each([
    { note: "", userId: null, user: null },
    { note: null, userId: "user-1", user: { name: null, email: null } },
    { note: null, userId: "user-1", user: { name: "", email: "" } },
  ])(
    "sends absent key snapshots as null (%o)",
    async ({ note, userId, user }) => {
      const service = serviceWith(() =>
        Promise.resolve(row({ note, userId, user })),
      );

      await expect(
        service.resolve({
          fastHashedSecretKey: "hashed-secret-key",
          apiFormat: "openai.responses",
        }),
      ).resolves.toMatchObject({
        attribution: {
          key_name: null,
          user_id: userId,
          user_name: null,
          user_email: null,
        },
      });
    },
  );

  it("drops key metadata that is not a flat object of scalars", async () => {
    const service = serviceWith(() =>
      Promise.resolve(row({ metadata: [{ team: "platform" }] })),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      attribution: {
        organization_id: "org-1",
        project_id: "project-1",
        key_id: "key-1",
        key_metadata: {},
        provider_connection_id: "connection-1",
      },
    });
  });

  it("resolves a key without a gateway association with empty metadata", async () => {
    const service = serviceWith(() => Promise.resolve(row({})));

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      attribution: { key_id: "key-1", key_metadata: {} },
    });
  });

  it("attributes a key that is not bound to a user to no user", async () => {
    const service = serviceWith(() => Promise.resolve(row({ userId: null })));

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      attribution: { key_id: "key-1", user_id: null },
    });
  });

  it("refuses to resolve when the ingestion project belongs to another organization", async () => {
    const service = serviceWith(() =>
      Promise.resolve(row({ projectOrgId: "org-other" })),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses to resolve USAGE mode without an ingestion project", async () => {
    const service = serviceWith(() =>
      Promise.resolve(row({ withoutProject: true })),
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    { withoutProject: true, projectId: null },
    { withoutProject: false, projectId: "project-1" },
  ])(
    "resolves NONE mode without signing keys (project: $projectId)",
    async ({ withoutProject, projectId }) => {
      const signingKeys = {
        LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY:
          mockEnv.LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY,
        LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY:
          mockEnv.LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY,
        LANGFUSE_AI_GATEWAY_JWT_KEY_ID: mockEnv.LANGFUSE_AI_GATEWAY_JWT_KEY_ID,
      };
      Object.assign(mockEnv, {
        LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY: undefined,
        LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY: undefined,
        LANGFUSE_AI_GATEWAY_JWT_KEY_ID: undefined,
      });
      try {
        const service = serviceWith(() =>
          Promise.resolve(row({ ingestionMode: "NONE", withoutProject })),
        );

        await expect(
          service.resolve({
            fastHashedSecretKey: "hashed-secret-key",
            apiFormat: "openai.responses",
          }),
        ).resolves.toMatchObject({
          connection: { id: "connection-1", provider_model: "gpt-4o" },
          attribution: { organization_id: "org-1", project_id: projectId },
          ingestion_mode: "none",
          ingestion: null,
        });
      } finally {
        Object.assign(mockEnv, signingKeys);
      }
    },
  );

  describe("on Langfuse Cloud", () => {
    beforeEach(() => {
      mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    });
    afterEach(() => {
      mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    });

    it("resolves a stored NONE mode as USAGE with an ingestion grant", async () => {
      const service = serviceWith(() =>
        Promise.resolve(row({ ingestionMode: "NONE" })),
      );

      await expect(
        service.resolve({
          fastHashedSecretKey: "hashed-secret-key",
          apiFormat: "openai.responses",
        }),
      ).resolves.toMatchObject({
        attribution: { project_id: "project-1" },
        ingestion_mode: "usage",
        ingestion: { access_token: "ingestion-token", token_type: "Bearer" },
      });
    });

    it("refuses to resolve a stored NONE mode without an ingestion project", async () => {
      const service = serviceWith(() =>
        Promise.resolve(row({ ingestionMode: "NONE", withoutProject: true })),
      );

      await expect(
        service.resolve({
          fastHashedSecretKey: "hashed-secret-key",
          apiFormat: "openai.responses",
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  it("rejects an unknown or expired gateway key", async () => {
    const service = serviceWith(() => Promise.resolve(null));

    await expect(
      service.resolve({
        fastHashedSecretKey: "invalid-hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects gateway keys from organizations outside the allowlist", async () => {
    const service = serviceWith(
      () =>
        Promise.resolve({
          id: "key-1",
          orgId: "org-not-allowed",
          expiresAt: null,
          gatewayAssociation: null,
          organization: { gatewayConfig: null, gatewayAiConnections: [] },
        }),
      "org-not-allowed",
    );

    await expect(
      service.resolve({
        fastHashedSecretKey: "hashed-secret-key",
        apiFormat: "openai.responses",
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Gateway is not enabled for this organization",
    });
  });
});
