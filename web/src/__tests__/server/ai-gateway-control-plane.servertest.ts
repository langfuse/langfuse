import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { generateKeyPairSync, randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as SharedServer from "@langfuse/shared/src/server";
import { z } from "zod/v4";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    testModelCall: vi.fn().mockResolvedValue(undefined),
  };
});

import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import {
  createInnerTRPCContext,
  type OrgAuthedContext,
} from "@/src/server/api/trpc";
import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";
import { GatewayApiKeyAuthenticator } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import {
  type GatewayResolveError,
  GatewayResolveService,
} from "@/src/features/ai-gateway/server/resolve/resolveService";
import { GatewayModelsService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelsService";
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import {
  GatewayModelCatalogService,
  GatewayProviderService,
} from "@/src/features/ai-gateway/server/provider";
import { createEs256JwtVerifier } from "@/src/server/utils/jwt";
import { prisma, Role } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  createApiKey,
  createShaHash,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];
const originalGatewayOrganizationAllowlist = [
  ...env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];
const originalGatewayJwtConfig = {
  privateKey: env.LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY,
  publicKey: env.LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY,
  keyId: env.LANGFUSE_AI_GATEWAY_JWT_KEY_ID,
  issuer: env.LANGFUSE_AI_GATEWAY_JWT_ISSUER,
  audience: env.LANGFUSE_AI_GATEWAY_JWT_AUDIENCE,
};
const gatewaySigningKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const gatewayPrivateKey = gatewaySigningKeys.privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();
const gatewayPublicKey = gatewaySigningKeys.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

function configureGatewayJwtSigning() {
  Object.assign(env, {
    LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY: gatewayPrivateKey,
    LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY: gatewayPublicKey,
    LANGFUSE_AI_GATEWAY_JWT_KEY_ID: "current",
    LANGFUSE_AI_GATEWAY_JWT_ISSUER: "test-issuer",
    LANGFUSE_AI_GATEWAY_JWT_AUDIENCE: "test-audience",
  });
}

const GatewayIngestionClaimsSchema = z.object({
  version: z.literal(1),
  organization_id: z.string(),
  project_id: z.string(),
  scope: z.literal("gateway-ingest"),
  exp: z.number().int(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  jti: z.string(),
});

afterEach(async () => {
  await prisma.organization.deleteMany({
    where: { id: { in: cleanupOrganizations.splice(0) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: cleanupUsers.splice(0) } },
  });
  env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
    0,
    env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.length,
    ...originalGatewayOrganizationAllowlist,
  );
  Object.assign(env, {
    LANGFUSE_AI_GATEWAY_JWT_PRIVATE_KEY: originalGatewayJwtConfig.privateKey,
    LANGFUSE_AI_GATEWAY_JWT_PUBLIC_KEY: originalGatewayJwtConfig.publicKey,
    LANGFUSE_AI_GATEWAY_JWT_KEY_ID: originalGatewayJwtConfig.keyId,
    LANGFUSE_AI_GATEWAY_JWT_ISSUER: originalGatewayJwtConfig.issuer,
    LANGFUSE_AI_GATEWAY_JWT_AUDIENCE: originalGatewayJwtConfig.audience,
  });
  vi.clearAllMocks();
});

async function authenticateRequest(
  params: Parameters<GatewayApiKeyAuthenticator["authenticateRequest"]>[0],
) {
  const context = await new GatewayApiKeyAuthenticator(
    prisma,
  ).authenticateRequest(params);
  return new GatewayResolveService().resolve({
    context,
    apiFormat: params.apiFormat,
  });
}

async function prepare(role: Role = Role.OWNER) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { email: `gateway-${suffix}@example.test`, name: "Gateway tester" },
  });
  const org = await prisma.organization.create({
    data: { name: `Gateway org ${suffix}` },
  });
  const project = await prisma.project.create({
    data: { name: "Gateway ingestion", orgId: org.id },
  });
  await prisma.organizationMembership.create({
    data: { orgId: org.id, userId: user.id, role },
  });
  cleanupOrganizations.push(org.id);
  cleanupUsers.push(user.id);
  env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(org.id);

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags({ templateFlag: false }),
      organizations: [
        {
          id: org.id,
          name: org.name,
          role,
          cloudConfig: undefined,
          plan: "oss",
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: project.id,
              role,
              retentionDays: 0,
              deletedAt: null,
              hasTraces: false,
              name: project.name,
              metadata: {},
              createdAt: project.createdAt.toISOString(),
            },
          ],
        },
      ],
    },
    environment: {} as Session["environment"],
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const orgSession = {
    ...session,
    user: session.user!,
    orgId: org.id,
    orgRole: role,
  } satisfies OrgAuthedContext["session"];
  return {
    org,
    project,
    user,
    session: orgSession,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

async function createCallerForOrganizationRole(
  setup: Awaited<ReturnType<typeof prepare>>,
  role: Role,
) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `gateway-role-${suffix}@example.test`,
      name: `Gateway ${role.toLowerCase()}`,
    },
  });
  await prisma.organizationMembership.create({
    data: { orgId: setup.org.id, userId: user.id, role },
  });
  cleanupUsers.push(user.id);

  const session: Session = {
    ...setup.session,
    user: {
      ...setup.session.user,
      id: user.id,
      name: user.name,
      organizations: setup.session.user.organizations.map((organization) =>
        organization.id === setup.org.id
          ? {
              ...organization,
              role,
              projects: organization.projects.map((project) => ({
                ...project,
                role,
              })),
            }
          : organization,
      ),
    },
  };
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("AI gateway control plane", () => {
  it.each([
    {
      productUrl: "https://staging.langfuse.com",
      gatewayUrl: "https://staging.langfuse.com",
    },
    {
      productUrl: "http://localhost:3000",
      gatewayUrl: "http://localhost:8080/v1",
    },
  ])(
    "returns the gateway endpoint for $productUrl",
    async ({ productUrl, gatewayUrl }) => {
      const { caller, org } = await prepare();
      const originalNextAuthUrl = env.NEXTAUTH_URL;
      (env as { NEXTAUTH_URL: string }).NEXTAUTH_URL = productUrl;

      try {
        await expect(
          caller.aiGateway.getConfig({ orgId: org.id }),
        ).resolves.toMatchObject({ gatewayBaseUrl: gatewayUrl });
      } finally {
        (env as { NEXTAUTH_URL: string }).NEXTAUTH_URL = originalNextAuthUrl;
      }
    },
  );

  it("applies the environment-specific organization allowlist", async () => {
    const { caller, org } = await prepare();
    env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
      env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.indexOf(org.id),
      1,
    );

    const request = caller.aiGateway.getConfig({ orgId: org.id });
    if (env.NODE_ENV === "development") {
      await expect(request).resolves.toMatchObject({ config: null });
    } else {
      await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("enforces admin scope and validates the ingestion project organization", async () => {
    const owner = await prepare();
    const member = await prepare(Role.MEMBER);

    await expect(
      member.caller.aiGateway.updateConfig({
        orgId: member.org.id,
        defaultIngestionProjectId: member.project.id,
        ingestionMode: "USAGE",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      owner.caller.aiGateway.updateConfig({
        orgId: owner.org.id,
        defaultIngestionProjectId: member.project.id,
        ingestionMode: "USAGE",
      }),
    ).rejects.toThrow("active project in the organization");
  });

  it.each([Role.MEMBER, Role.VIEWER])(
    "allows %s to read models without granting gateway management",
    async (role) => {
      const { caller, org } = await prepare(role);

      await expect(
        caller.aiGateway.listModelConnections({ orgId: org.id }),
      ).resolves.toEqual([]);
      await expect(
        caller.aiGateway.refreshModels({ orgId: org.id }),
      ).resolves.toEqual([]);
      await expect(
        caller.aiGateway.listConnections({ orgId: org.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.aiGateway.getConfig({ orgId: org.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it.each([
    { adminRole: Role.OWNER, readRole: Role.MEMBER },
    { adminRole: Role.ADMIN, readRole: Role.VIEWER },
  ])(
    "returns the full model catalog to $adminRole and filters disabled models for $readRole",
    async ({ adminRole, readRole }) => {
      const setup = await prepare(adminRole);
      const connection = await setup.caller.aiGateway.createConnection({
        orgId: setup.org.id,
        name: "OpenAI",
        provider: "OPENAI",
        credential: "sk-test-openai",
      });
      await setup.caller.aiGateway.updateConnectionModels({
        orgId: setup.org.id,
        id: connection.id,
        allowedModels: ["enabled-model"],
        expectedUpdatedAt: connection.updatedAt,
      });
      const readCaller = await createCallerForOrganizationRole(setup, readRole);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
          data: [
            { id: "disabled-model", created: 10 },
            { id: "enabled-model", created: 20 },
          ],
        }),
      );

      try {
        await expect(
          setup.caller.aiGateway.refreshModels({ orgId: setup.org.id }),
        ).resolves.toEqual([
          {
            connectionId: connection.id,
            success: true,
            models: ["disabled-model", "enabled-model"],
          },
        ]);
        await new GatewayModelCatalogService(prisma).clearModelCache(
          setup.org.id,
          connection.id,
        );
        fetchSpy.mockClear();
        await expect(
          readCaller.aiGateway.refreshModels({ orgId: setup.org.id }),
        ).resolves.toEqual([
          {
            connectionId: connection.id,
            success: true,
            models: ["enabled-model"],
          },
        ]);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it("blocks an auto-granted demo organization VIEWER from gateway catalog metadata", async () => {
    const setup = await prepare();
    const connection = await setup.caller.aiGateway.createConnection({
      orgId: setup.org.id,
      name: "Shared-OpenAI",
      provider: "OPENAI",
      credential: "sk-shared-openai",
    });
    await setup.caller.aiGateway.updateConnectionModels({
      orgId: setup.org.id,
      id: connection.id,
      allowedModels: ["enabled-model"],
      expectedUpdatedAt: connection.updatedAt,
    });
    const viewerCaller = await createCallerForOrganizationRole(
      setup,
      Role.VIEWER,
    );
    const originalDemoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
    Object.assign(env, { NEXT_PUBLIC_DEMO_ORG_ID: setup.org.id });

    try {
      await expect(
        setup.caller.aiGateway.listModelConnections({
          orgId: setup.org.id,
        }),
      ).resolves.toEqual([
        {
          id: connection.id,
          name: "Shared-OpenAI",
          provider: "OPENAI",
          allowedModels: ["enabled-model"],
        },
      ]);
      await expect(
        viewerCaller.aiGateway.listModelConnections({ orgId: setup.org.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      Object.assign(env, {
        NEXT_PUBLIC_DEMO_ORG_ID: originalDemoOrgId,
      });
    }
  });

  it("blocks an auto-granted demo organization VIEWER from model refresh side effects", async () => {
    const setup = await prepare();
    const connection = await setup.caller.aiGateway.createConnection({
      orgId: setup.org.id,
      name: "Shared-OpenAI",
      provider: "OPENAI",
      credential: "sk-shared-openai",
    });
    const viewerCaller = await createCallerForOrganizationRole(
      setup,
      Role.VIEWER,
    );
    const originalDemoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
    Object.assign(env, { NEXT_PUBLIC_DEMO_ORG_ID: setup.org.id });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    try {
      const refreshOutcome = await viewerCaller.aiGateway
        .refreshModels({ orgId: setup.org.id })
        .then(
          () => "fulfilled" as const,
          () => "rejected" as const,
        );
      const storedConnection =
        await prisma.gatewayAiConnection.findUniqueOrThrow({
          where: { id: connection.id },
          select: { status: true },
        });

      expect({
        refreshOutcome,
        providerCalls: fetchSpy.mock.calls.length,
        connectionStatus: storedConnection.status,
      }).toEqual({
        refreshOutcome: "rejected",
        providerCalls: 0,
        connectionStatus: "ENABLED",
      });
    } finally {
      fetchSpy.mockRestore();
      Object.assign(env, {
        NEXT_PUBLIC_DEMO_ORG_ID: originalDemoOrgId,
      });
    }
  });

  it("stores provider credentials encrypted and never returns them", async () => {
    const { caller, org } = await prepare();
    const credential = "sk-test-gateway-redaction";
    const created = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-primary",
      provider: "OPENAI",
      credential,
    });

    expect(SharedServer.testModelCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: expect.objectContaining({
          baseURL: "https://api.openai.com/v1",
          secretKey: expect.not.stringContaining(credential),
        }),
      }),
    );
    expect(created).not.toHaveProperty("encryptedCredential");
    expect(created).not.toHaveProperty("credential");
    const listed = await caller.aiGateway.listConnections({ orgId: org.id });
    expect(listed.data[0]).not.toHaveProperty("encryptedCredential");
    expect(JSON.stringify(listed)).not.toContain(credential);
    await expect(
      caller.aiGateway.listModelConnections({ orgId: org.id }),
    ).resolves.toEqual([
      {
        id: created.id,
        name: "OpenAI-primary",
        provider: "OPENAI",
        allowedModels: null,
      },
    ]);

    const stored = await prisma.gatewayAiConnection.findUniqueOrThrow({
      where: { id: created.id },
      select: { encryptedCredential: true },
    });
    expect(stored.encryptedCredential).not.toBe(credential);
    expect(decrypt(stored.encryptedCredential)).toBe(credential);
  });

  it("tests provider credentials without saving a connection", async () => {
    const { caller, org } = await prepare();
    const credential = "sk-test-only";

    await caller.aiGateway.testConnection({
      orgId: org.id,
      provider: "OPENAI",
      credential,
    });

    expect(SharedServer.testModelCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        apiKey: expect.objectContaining({
          secretKey: expect.not.stringContaining(credential),
        }),
      }),
    );
    await expect(
      prisma.gatewayAiConnection.count({
        where: { organizationId: org.id },
      }),
    ).resolves.toBe(0);
  });

  it("validates new and updated Anthropic credentials with an active compatible model", async () => {
    const { caller, org } = await prepare();

    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Anthropic-primary",
      provider: "ANTHROPIC",
      credential: "sk-ant-test-gateway",
    });
    await caller.aiGateway.updateConnection({
      orgId: org.id,
      id: connection.id,
      credential: "sk-ant-test-gateway-updated",
    });

    expect(SharedServer.testModelCall).toHaveBeenCalledTimes(2);
    expect(SharedServer.testModelCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        apiKey: expect.objectContaining({
          adapter: "anthropic",
          baseURL: "https://api.anthropic.com/v1",
        }),
      }),
    );
  });

  it("creates, lists, and revokes only associated organization keys", async () => {
    const { caller, org } = await prepare();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await caller.aiGateway.createApiKey({
      orgId: org.id,
      name: "Production gateway",
      metadata: { environment: "production", costCenter: 42 },
      expiresAt,
    });
    expect(created.secretKey).toMatch(/^sk-lf-/);

    const listed = await caller.aiGateway.listApiKeys({ orgId: org.id });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      apiKey: { id: created.id, note: "Production gateway", expiresAt },
      metadata: { environment: "production", costCenter: 42 },
    });
    expect(JSON.stringify(listed)).not.toContain(created.secretKey);

    await expect(
      caller.aiGateway.createApiKey({
        orgId: org.id,
        metadata: { nested: { rejected: true } } as never,
      }),
    ).rejects.toThrow();

    await expect(
      caller.aiGateway.revokeApiKey({ orgId: org.id, id: created.id }),
    ).resolves.toEqual({ success: true });
    expect(
      await prisma.gatewayApiKeyAssociation.findUnique({
        where: { apiKeyId: created.id },
      }),
    ).toBeNull();

    await expect(
      caller.aiGateway.revokeApiKey({ orgId: org.id, id: created.id }),
    ).rejects.toThrow("Gateway API key not found");
  });

  it("rejects gateway API key expiration dates in the past", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.aiGateway.createApiKey({
        orgId: org.id,
        metadata: {},
        expiresAt: new Date(Date.now() - 1_000),
      }),
    ).rejects.toThrow("Expiration date must be in the future");
  });

  it("owns successful and failed mutation auditing in gateway services", async () => {
    const { org, project, session } = await prepare();
    const gatewayService = new GatewayConfigService(prisma);
    const providerService = new GatewayProviderService(prisma);
    const apiKeyService = new GatewayApiKeyService(prisma);

    await gatewayService.updateConfig({
      organizationId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
      session,
    });
    await providerService.create({
      organizationId: org.id,
      name: "Audited-provider",
      provider: "OPENAI",
      credential: "sk-audited-provider",
      session,
    });
    const key = await apiKeyService.create({
      organizationId: org.id,
      metadata: {},
      session,
    });

    expect(
      await prisma.auditLog.findMany({
        where: { orgId: org.id },
        select: { resourceType: true, action: true },
        orderBy: { createdAt: "asc" },
      }),
    ).toEqual([
      { resourceType: "gatewayConfig", action: "create" },
      { resourceType: "gatewayAiConnection", action: "create" },
      { resourceType: "apiKey", action: "create" },
    ]);

    await apiKeyService.revoke({
      organizationId: org.id,
      apiKeyId: key.id,
      session,
    });
    const auditCountAfterSuccess = await prisma.auditLog.count({
      where: { orgId: org.id },
    });
    await expect(
      apiKeyService.revoke({
        organizationId: org.id,
        apiKeyId: key.id,
        session,
      }),
    ).rejects.toThrow("Gateway API key not found");
    expect(await prisma.auditLog.count({ where: { orgId: org.id } })).toBe(
      auditCountAfterSuccess,
    );

    const failingProviderService = new GatewayProviderService(
      prisma,
      vi.fn().mockRejectedValue(new Error("invalid credential")),
    );
    await expect(
      failingProviderService.create({
        organizationId: org.id,
        name: "Rejected-provider",
        provider: "OPENAI",
        credential: "sk-rejected",
        session,
      }),
    ).rejects.toThrow("invalid credential");
    expect(await prisma.auditLog.count({ where: { orgId: org.id } })).toBe(
      auditCountAfterSuccess,
    );
  });

  it("cursor-paginates provider connections", async () => {
    const { caller, org } = await prepare();

    for (const name of ["First", "Second", "Third"]) {
      await caller.aiGateway.createConnection({
        orgId: org.id,
        name,
        provider: "OPENAI",
        credential: `sk-test-${name.toLowerCase()}`,
      });
    }

    const firstConnections = await caller.aiGateway.listConnections({
      orgId: org.id,
      limit: 2,
    });
    expect(firstConnections.data.map((connection) => connection.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(firstConnections.nextCursor).toBeTruthy();
    const remainingConnections = await caller.aiGateway.listConnections({
      orgId: org.id,
      limit: 2,
      cursor: firstConnections.nextCursor ?? undefined,
    });
    expect(
      remainingConnections.data.map((connection) => connection.name),
    ).toEqual(["Third"]);
    expect(remainingConnections.nextCursor).toBeNull();
  });

  it("cursor-paginates gateway keys", async () => {
    const { caller, org } = await prepare();

    for (const name of ["First", "Second", "Third"]) {
      await caller.aiGateway.createApiKey({
        orgId: org.id,
        name,
        metadata: {},
      });
    }

    const firstKeys = await caller.aiGateway.listApiKeys({
      orgId: org.id,
      limit: 2,
    });
    expect(firstKeys.data).toHaveLength(2);
    expect(firstKeys.nextCursor).toBeTruthy();
    const remainingKeys = await caller.aiGateway.listApiKeys({
      orgId: org.id,
      limit: 2,
      cursor: firstKeys.nextCursor ?? undefined,
    });
    expect(remainingKeys.data).toHaveLength(1);
    expect(remainingKeys.nextCursor).toBeNull();
  });

  it("rejects gateway page limits above 100", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.aiGateway.listConnections({ orgId: org.id, limit: 101 }),
    ).rejects.toThrow();
    await expect(
      caller.aiGateway.listApiKeys({ orgId: org.id, limit: 101 }),
    ).rejects.toThrow();
  });

  it("routes by connection slug and issues a verifiable ingestion token", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "FULL",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-first",
      provider: "OPENAI",
      credential: "sk-test-openai-primary",
    });
    const openAiSecondary = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-second",
      provider: "OPENAI",
      credential: "sk-test-openai-secondary",
    });
    const gatewayKey = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });

    configureGatewayJwtSigning();

    const apiFormat = "openai.chat-completions" as const;
    const jwtVerifier = createEs256JwtVerifier({
      publicKeys: [{ id: "current", publicKey: gatewayPublicKey }],
      issuer: "test-issuer",
      audience: "test-audience",
      claimsSchema: GatewayIngestionClaimsSchema,
    });
    const result = await authenticateRequest({
      fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
      apiFormat,
      model: "OpenAI-second:openai/gpt-4o",
    });

    expect(result.connection).toEqual({
      id: openAiSecondary.id,
      name: "OpenAI-second",
      provider: "openai",
      provider_model: "openai/gpt-4o",
      api_format: apiFormat,
      base_url: "https://api.openai.com/v1",
      auth: { type: "Bearer", token: "sk-test-openai-secondary" },
    });
    const ingestionToken = result.ingestion!.access_token;
    const ingestionClaims = jwtVerifier.verify({ token: ingestionToken });
    const encodedClaims = ingestionToken.split(".")[1];
    const rawClaims = JSON.parse(
      Buffer.from(encodedClaims, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(rawClaims).not.toHaveProperty("key_id");
    expect(ingestionClaims).toMatchObject({
      organization_id: org.id,
      project_id: project.id,
    });
    expect(rawClaims).not.toHaveProperty("api_key_id");
    // The gateway batches uploads by attribution but ingestion writes into the
    // token's project, so both must name the same tenant.
    expect(result.attribution).toMatchObject({
      organization_id: ingestionClaims.organization_id,
      project_id: ingestionClaims.project_id,
    });
    expect(result.ingestion_mode).toBe(rawClaims.ingestion_mode);
    expect(result.ingestion_mode).toBe("full");
    expect(result.ingestion?.expires_at).toBe(ingestionClaims.exp);
  });

  it("routes unprefixed models by provider and rejects unknown models", async () => {
    configureGatewayJwtSigning();
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "FULL",
    });
    const openAiPrimary = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-primary",
      provider: "OPENAI",
      credential: "sk-test-openai-primary",
    });
    const openAiSecondary = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-secondary",
      provider: "OPENAI",
      credential: "sk-test-openai-secondary",
    });
    const anthropic = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Anthropic",
      provider: "ANTHROPIC",
      credential: "sk-test-anthropic",
    });
    const gatewayKey = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const otherOrganization = await prepare();
    await otherOrganization.caller.aiGateway.createConnection({
      orgId: otherOrganization.org.id,
      name: "Unknown",
      provider: "OPENAI",
      credential: "sk-other-organization",
    });
    const params = {
      fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
      apiFormat: "openai.responses" as const,
    };

    await expect(
      authenticateRequest({ ...params, model: "gpt-6-sol" }),
    ).resolves.toMatchObject({
      connection: {
        id: openAiPrimary.id,
        provider: "openai",
        provider_model: "gpt-6-sol",
      },
    });
    await expect(
      authenticateRequest({
        ...params,
        apiFormat: "anthropic.messages",
        model: "claude-opus-5-5",
      }),
    ).resolves.toMatchObject({
      connection: {
        id: anthropic.id,
        provider: "anthropic",
        provider_model: "claude-opus-5-5",
      },
    });
    await expect(
      authenticateRequest({
        ...params,
        model: "OpenAI-secondary:gpt-4o",
      }),
    ).resolves.toMatchObject({
      connection: {
        id: openAiSecondary.id,
        provider: "openai",
        provider_model: "gpt-4o",
      },
    });
    await expect(
      authenticateRequest({ ...params, model: "random-model" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      authenticateRequest({ ...params, model: "Unknown:gpt-4o" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("persists connection model allowlists and enforces them for resolve and models", async () => {
    configureGatewayJwtSigning();
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "FULL",
    });
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    const gatewayKey = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const fastHashedSecretKey = createShaHash(gatewayKey.secretKey, env.SALT);

    await expect(
      authenticateRequest({
        fastHashedSecretKey,
        apiFormat: "openai.responses",
        model: "OpenAI:gpt-4o",
      }),
    ).resolves.toMatchObject({
      connection: { id: connection.id, provider_model: "gpt-4o" },
    });

    await caller.aiGateway.updateConnectionModels({
      orgId: org.id,
      id: connection.id,
      allowedModels: ["gpt-4o-mini"],
      expectedUpdatedAt: connection.updatedAt,
    });

    await expect(
      authenticateRequest({
        fastHashedSecretKey,
        apiFormat: "openai.responses",
        model: "OpenAI:gpt-4o",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "model_not_allowed",
    });
    await expect(
      authenticateRequest({
        fastHashedSecretKey,
        apiFormat: "openai.responses",
        model: "gpt-4o",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "model_not_allowed",
    });
    await expect(
      authenticateRequest({
        fastHashedSecretKey,
        apiFormat: "openai.responses",
        model: "OpenAI:gpt-4o-mini",
      }),
    ).resolves.toMatchObject({
      connection: { id: connection.id, provider_model: "gpt-4o-mini" },
    });

    const context = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateModelsRequest({
      fastHashedSecretKey,
      apiFormat: "openai.responses",
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: "gpt-4o", created: 10 },
          { id: "gpt-4o-mini", created: 20 },
        ],
      }),
    );
    await expect(
      new GatewayModelsService(prisma, fetcher, null).list({
        context,
        apiFormat: "openai.responses",
      }),
    ).resolves.toMatchObject({
      data: [{ id: "OpenAI:gpt-4o-mini" }],
    });

    const listed = await caller.aiGateway.listConnections({ orgId: org.id });
    expect(listed.data[0]?.allowedModels).toEqual(["gpt-4o-mini"]);
    await caller.aiGateway.updateConnectionModels({
      orgId: org.id,
      id: connection.id,
      allowedModels: null,
      expectedUpdatedAt: listed.data[0]!.updatedAt,
    });
    const allowAll = await caller.aiGateway.getConnection({
      orgId: org.id,
      id: connection.id,
    });
    expect(allowAll.allowedModels).toBeNull();
  });

  it("rejects stale concurrent model allowlist updates", async () => {
    const { caller, org } = await prepare();
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });

    await caller.aiGateway.updateConnectionModels({
      orgId: org.id,
      id: connection.id,
      allowedModels: ["gpt-4o"],
      expectedUpdatedAt: connection.updatedAt,
    });
    await expect(
      caller.aiGateway.updateConnectionModels({
        orgId: org.id,
        id: connection.id,
        allowedModels: ["gpt-4o-mini"],
        expectedUpdatedAt: connection.updatedAt,
      }),
    ).rejects.toThrow(
      "Model access changed while this page was open. Reload and try again.",
    );

    await expect(
      caller.aiGateway.getConnection({
        orgId: org.id,
        id: connection.id,
      }),
    ).resolves.toMatchObject({ allowedModels: ["gpt-4o"] });
  });

  it("rejects connection names that are not safe as model slug prefixes", async () => {
    const { caller, org } = await prepare();
    for (const [name, message] of [
      ["Production:Primary", GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters],
      ["OpenAI primary", GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters],
      ["-openai", GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters],
      ["openai.v2", GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters],
      ["   ", GATEWAY_CONNECTION_NAME_ERRORS.required],
      ["a".repeat(65), GATEWAY_CONNECTION_NAME_ERRORS.tooLong],
      ["FT", GATEWAY_CONNECTION_NAME_ERRORS.reserved],
    ] as const) {
      await expect(
        caller.aiGateway.createConnection({
          orgId: org.id,
          name,
          provider: "OPENAI",
          credential: "sk-openai",
        }),
      ).rejects.toThrow(message);
    }

    await expect(
      caller.aiGateway.createConnection({
        orgId: org.id,
        name: " OpenAI_eu-v2 ",
        provider: "OPENAI",
        credential: "sk-openai",
      }),
    ).resolves.toMatchObject({ name: "OpenAI_eu-v2" });
  });

  it("keeps a legacy connection name usable until it is renamed", async () => {
    const { caller, org } = await prepare();
    const created = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Legacy",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    const legacy = await prisma.gatewayAiConnection.update({
      where: { id: created.id },
      data: { name: "Legacy name" },
    });

    await expect(
      caller.aiGateway.updateConnection({
        orgId: org.id,
        id: legacy.id,
        name: "Legacy name",
        credential: "sk-openai-rotated",
      }),
    ).resolves.toMatchObject({ name: "Legacy name" });
    await expect(
      caller.aiGateway.updateConnection({
        orgId: org.id,
        id: legacy.id,
        name: "Legacy name 2",
      }),
    ).rejects.toThrow(GATEWAY_CONNECTION_NAME_ERRORS.invalidCharacters);
  });

  it("requires connection names to be unique within an organization, ignoring case", async () => {
    const { caller, org } = await prepare();
    const production = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Production",
      provider: "OPENAI",
      credential: "sk-openai",
    });

    await expect(
      caller.aiGateway.createConnection({
        orgId: org.id,
        name: "production",
        provider: "ANTHROPIC",
        credential: "sk-anthropic",
      }),
    ).rejects.toThrow(GATEWAY_CONNECTION_NAME_ERRORS.duplicate);

    const backup = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Backup",
      provider: "ANTHROPIC",
      credential: "sk-anthropic",
    });
    await expect(
      caller.aiGateway.updateConnection({
        orgId: org.id,
        id: backup.id,
        name: "PRODUCTION",
      }),
    ).rejects.toThrow(GATEWAY_CONNECTION_NAME_ERRORS.duplicate);

    await expect(
      caller.aiGateway.updateConnection({
        orgId: org.id,
        id: production.id,
        name: "production",
      }),
    ).resolves.toMatchObject({ name: "production" });
  });

  it("treats underscores in connection names literally when checking duplicates", async () => {
    const { caller, org } = await prepare();
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "openai-1",
      provider: "OPENAI",
      credential: "sk-openai",
    });

    await expect(
      caller.aiGateway.createConnection({
        orgId: org.id,
        name: "openai_1",
        provider: "OPENAI",
        credential: "sk-openai",
      }),
    ).resolves.toMatchObject({ name: "openai_1" });
  });

  it("changes ERROR only for credential auth failures and explicit recovery", async () => {
    const { caller, org, session } = await prepare();
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Anthropic",
      provider: "ANTHROPIC",
      credential: "sk-ant-test",
    });
    const unauthorizedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const unauthorized = new GatewayModelCatalogService(
      prisma,
      unauthorizedFetch,
    );
    await unauthorized.refreshModels({
      organizationId: org.id,
      connectionId: connection.id,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ERROR" });
    await expect(
      caller.aiGateway.updateConnection({
        orgId: org.id,
        id: connection.id,
        status: "ENABLED",
      }),
    ).rejects.toThrow("credential update or successful retry");
    const automaticRefresh = vi.fn<typeof fetch>();
    await new GatewayModelCatalogService(
      prisma,
      automaticRefresh,
    ).refreshAllModels(org.id);
    expect(automaticRefresh).not.toHaveBeenCalled();

    const failingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    const failedRetry = await new GatewayModelCatalogService(
      prisma,
      failingFetch,
    ).retryConnection({
      organizationId: org.id,
      connectionId: connection.id,
      session,
    });
    expect(failedRetry.success).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { orgId: org.id, action: "retry" },
      }),
    ).toBe(0);
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ERROR" });

    const successfulFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "claude-test",
            display_name: "Claude Test",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        has_more: false,
      }),
    );
    await new GatewayModelCatalogService(
      prisma,
      successfulFetch,
    ).retryConnection({
      organizationId: org.id,
      connectionId: connection.id,
      session,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ENABLED" });
    expect(
      await prisma.auditLog.count({
        where: { orgId: org.id, action: "retry" },
      }),
    ).toBe(1);
  });

  it("keeps disabled connections disabled after model discovery auth failures", async () => {
    const { caller, org } = await prepare();
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Anthropic",
      provider: "ANTHROPIC",
      credential: "sk-ant-test",
    });
    await caller.aiGateway.updateConnection({
      orgId: org.id,
      id: connection.id,
      status: "DISABLED",
    });
    const unauthorizedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await new GatewayModelCatalogService(
      prisma,
      unauthorizedFetch,
    ).refreshModels({
      organizationId: org.id,
      connectionId: connection.id,
    });

    await expect(
      prisma.gatewayAiConnection.findUnique({
        where: { id: connection.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "DISABLED" });
  });

  it("orders connections by creation time", async () => {
    const { caller, org } = await prepare();
    const created = [];
    for (const name of ["first", "second", "third"]) {
      created.push(
        await caller.aiGateway.createConnection({
          orgId: org.id,
          name,
          provider: "OPENAI",
          credential: `sk-${name}`,
        }),
      );
    }
    await Promise.all([
      prisma.gatewayAiConnection.update({
        where: { id: created[0].id },
        data: { createdAt: new Date("2026-10-03T00:00:00.000Z") },
      }),
      prisma.gatewayAiConnection.update({
        where: { id: created[1].id },
        data: { createdAt: new Date("2026-10-01T00:00:00.000Z") },
      }),
      prisma.gatewayAiConnection.update({
        where: { id: created[2].id },
        data: { createdAt: new Date("2026-10-02T00:00:00.000Z") },
      }),
    ]);

    const listNames = async () =>
      (
        await caller.aiGateway.listConnections({
          orgId: org.id,
        })
      ).data.map(({ name }) => name);
    await expect(listNames()).resolves.toEqual(["second", "third", "first"]);

    await caller.aiGateway.deleteConnection({
      orgId: org.id,
      id: created[1].id,
    });
    await expect(listNames()).resolves.toEqual(["third", "first"]);
  });

  it("serves repeat resolves from cache and drops it when a connection changes", async () => {
    configureGatewayJwtSigning();
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
    });
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-backup",
      provider: "OPENAI",
      credential: "sk-test-backup",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const resolveParams = {
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "openai.responses" as const,
      model: "OpenAI:gpt-4o",
    };
    const lookup = vi.spyOn(prisma.apiKey, "findFirst");

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(authenticateRequest(resolveParams)).resolves.toMatchObject({
        connection: { auth: { type: "Bearer", token: "sk-test" } },
      });
    }
    await expect(
      authenticateRequest({
        ...resolveParams,
        model: "OpenAI-backup:gpt-4o",
      }),
    ).resolves.toMatchObject({
      connection: { auth: { type: "Bearer", token: "sk-test-backup" } },
    });
    // The second call must not reach Postgres: this endpoint runs on every LLM
    // request through the gateway.
    expect(lookup).toHaveBeenCalledOnce();

    // Renaming a connection invalidates its old model slugs immediately.
    await caller.aiGateway.updateConnection({
      orgId: org.id,
      id: connection.id,
      name: "OpenAI-renamed",
    });
    await expect(authenticateRequest(resolveParams)).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 404 }),
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    await expect(
      authenticateRequest({
        ...resolveParams,
        model: "OpenAI-renamed:gpt-4o",
      }),
    ).resolves.toMatchObject({
      connection: { name: "OpenAI-renamed" },
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    lookup.mockRestore();
  });

  it("negatively caches unknown gateway keys", async () => {
    const resolveParams = {
      fastHashedSecretKey: createShaHash(`sk-lf-${randomUUID()}`, env.SALT),
      apiFormat: "openai.responses" as const,
      model: "gpt-4o",
    };
    const lookup = vi.spyOn(prisma.apiKey, "findFirst");

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(authenticateRequest(resolveParams)).rejects.toEqual(
        expect.objectContaining<Partial<GatewayResolveError>>({ status: 401 }),
      );
    }
    // Without a negative cache, a client looping on a bad key is an unmetered
    // query generator against the primary.
    expect(lookup).toHaveBeenCalledOnce();
    lookup.mockRestore();
  });

  it("enforces gateway:invoke regardless of API key role enforcement", async () => {
    const originalMigration = env.API_AUTH_MIGRATION;
    const originalCache = env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED;
    Object.assign(env, { LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "false" });
    try {
      const { caller, org } = await prepare();
      const gatewayKey = await caller.aiGateway.createApiKey({
        orgId: org.id,
        metadata: {},
      });
      const authenticator = new GatewayApiKeyAuthenticator(prisma);
      const request = {
        fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
        apiFormat: "openai.responses" as const,
      };

      await expect(
        authenticator.authenticateModelsRequest(request),
      ).resolves.toMatchObject({
        organizationId: org.id,
      });

      await prisma.roleAssignment.updateMany({
        where: { apiKeyId: gatewayKey.id },
        data: { systemRole: "INGEST", roleId: "system/INGEST" },
      });
      for (const migration of ["enforce", "legacy"] as const) {
        Object.assign(env, { API_AUTH_MIGRATION: migration });
        await expect(
          authenticator.authenticateModelsRequest(request),
        ).rejects.toMatchObject({
          status: 403,
          message: "API key is not allowed to invoke the gateway",
        });
      }
    } finally {
      Object.assign(env, {
        API_AUTH_MIGRATION: originalMigration,
        LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: originalCache,
      });
    }
  });

  it("accepts organization keys granted gateway:invoke without a gateway association", async () => {
    const originalCache = env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED;
    Object.assign(env, { LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "false" });
    try {
      const { org, user } = await prepare();
      const adminKey = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("ADMIN"),
        createdBy: UserId(user.id),
      });

      await expect(
        new GatewayApiKeyAuthenticator(prisma).authenticateModelsRequest({
          fastHashedSecretKey: createShaHash(adminKey.secretKey, env.SALT),
          apiFormat: "openai.responses",
        }),
      ).resolves.toMatchObject({
        organizationId: org.id,
        apiKeyId: adminKey.id,
        keyMetadata: {},
      });
    } finally {
      Object.assign(env, {
        LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: originalCache,
      });
    }
  });

  it("blocks deletion of the default ingestion project", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
    });

    await expect(
      caller.projects.deletionProtection({ projectId: project.id }),
    ).resolves.toEqual({ isGatewayIngestionProject: true });
    await expect(
      caller.projects.delete({ projectId: project.id }),
    ).rejects.toThrow("Select another ingestion project before deleting it");
    await expect(
      prisma.project.findUnique({ where: { id: project.id } }),
    ).resolves.toMatchObject({ deletedAt: null });
  });

  it("blocks resolve after the default ingestion project is deleted", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date() },
    });
    const apiFormat = "openai.responses" as const;
    await expect(
      authenticateRequest({
        fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
        apiFormat,
        model: "OpenAI:gpt-4o",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 403 }),
    );
  });

  it("returns connection-prefixed models without consolidating connections", async () => {
    const { caller, org } = await prepare();
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-primary",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-backup",
      provider: "OPENAI",
      credential: "sk-openai-backup",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Anthropic",
      provider: "ANTHROPIC",
      credential: "sk-anthropic",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const hostname = new URL(String(url)).hostname;
      if (hostname === "api.openai.com") {
        return Response.json({
          data: [
            {
              id: "a-model",
              created: 10,
              owned_by: "openai",
              shutdown_date: "2027-01-01",
            },
            { id: "shared-model", created: 15, owned_by: "openai" },
          ],
        });
      }
      if (hostname === "api.anthropic.com") {
        return Response.json({
          data: [
            {
              id: "claude-a",
              display_name: "Claude A",
              created_at: "2026-01-01T00:00:00.000Z",
              capabilities: { image_input: { supported: true } },
              max_input_tokens: 200000,
              max_tokens: 64000,
              type: "model",
            },
            {
              id: "claude-b",
              display_name: "Claude B",
              created_at: "2026-02-01T00:00:00.000Z",
              capabilities: null,
              max_input_tokens: 100000,
              max_tokens: 32000,
              type: "model",
            },
          ],
          has_more: false,
        });
      }
      throw new Error(`Unexpected provider request: ${String(url)}`);
    });

    const service = new GatewayModelsService(prisma, fetcher, null);
    const fastHashedSecretKey = createShaHash(key.secretKey, env.SALT);
    const openAiContext = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateModelsRequest({
      fastHashedSecretKey,
      apiFormat: "openai.responses",
    });
    const result = await service.list({
      context: openAiContext,
      apiFormat: "openai.responses",
    });

    expect(result).toEqual({
      data: [
        {
          id: "OpenAI-backup:a-model",
          provider: "OPENAI",
          canonicalSlug: "a-model",
          displayName: "a-model",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
        {
          id: "OpenAI-backup:shared-model",
          provider: "OPENAI",
          canonicalSlug: "shared-model",
          displayName: "shared-model",
          createdAt: "1970-01-01T00:00:15.000Z",
        },
        {
          id: "OpenAI-primary:a-model",
          provider: "OPENAI",
          canonicalSlug: "a-model",
          displayName: "a-model",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
        {
          id: "OpenAI-primary:shared-model",
          provider: "OPENAI",
          canonicalSlug: "shared-model",
          displayName: "shared-model",
          createdAt: "1970-01-01T00:00:15.000Z",
        },
      ],
    });
    const anthropicContext = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateModelsRequest({
      fastHashedSecretKey,
      apiFormat: "anthropic.messages",
    });
    const anthropicResult = await service.list({
      context: anthropicContext,
      apiFormat: "anthropic.messages",
    });
    expect(anthropicResult).toEqual({
      data: [
        {
          id: "Anthropic:claude-a",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-a",
          displayName: "Claude A",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "Anthropic:claude-b",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-b",
          displayName: "Claude B",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("returns partial catalogs and fails only when every connection fails", async () => {
    const { caller, org } = await prepare();
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI-fallback",
      provider: "OPENAI",
      credential: "sk-openai-fallback",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_, init) => {
        const authorization = new Headers(init?.headers).get("authorization");
        return authorization === "Bearer sk-openai"
          ? new Response(null, { status: 500 })
          : Response.json({
              data: [{ id: "available-model", created: 10 }],
            });
      });

    const context = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateModelsRequest({
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "openai.chat-completions",
    });
    await expect(
      new GatewayModelsService(prisma, fetcher, null).list({
        context,
        apiFormat: "openai.chat-completions",
      }),
    ).resolves.toEqual({
      data: [
        {
          id: "OpenAI-fallback:available-model",
          provider: "OPENAI",
          canonicalSlug: "available-model",
          displayName: "available-model",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
      ],
    });

    const unavailableFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      new GatewayModelsService(prisma, unavailableFetcher, null).list({
        context,
        apiFormat: "openai.chat-completions",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 503 }),
    );
  });
});
