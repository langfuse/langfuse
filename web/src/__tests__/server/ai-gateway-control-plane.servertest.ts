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
import { getAuthOptions } from "@/src/server/auth";
import {
  createInnerTRPCContext,
  type OrgAuthedContext,
} from "@/src/server/api/trpc";
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
import { createShaHash } from "@langfuse/shared/src/server/auth/apiKeys";

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];
const originalGatewayOrganizationAllowlist = [
  ...env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];

/**
 * Resolves the project ids a user can read through the real NextAuth session
 * callback — the same object every project-scoped tRPC procedure authorizes
 * against.
 */
const sessionProjectIds = async (email: string) => {
  const authOptions = await getAuthOptions();
  const session = (await authOptions.callbacks!.session!({
    session: {} as Session,
    token: { email },
  } as never)) as Session;
  return (session.user?.organizations ?? []).flatMap((organization) =>
    organization.projects.map((project) => project.id),
  );
};

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
  env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
    0,
    env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.length,
    ...originalGatewayOrganizationAllowlist,
  );
  vi.clearAllMocks();
});

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
  env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(org.id);

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: {} as NonNullable<Session["user"]>["featureFlags"],
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
          projects: [],
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

describe("AI gateway control plane", () => {
  it("applies the environment-specific organization allowlist", async () => {
    const { caller, org } = await prepare();
    env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.splice(
      env.LANGFUSE_GATEWAY_ORGANIZATION_ID_ALLOWLIST.indexOf(org.id),
      1,
    );

    const request = caller.aiGateway.getConfig({ orgId: org.id });
    if (env.NODE_ENV === "development") {
      await expect(request).resolves.toBeNull();
    } else {
      await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("limits default ingestion project access to organization owners and admins", async () => {
    const owner = await prepare();
    const existingMember = await prisma.user.create({
      data: { email: `gateway-member-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(existingMember.id);
    await prisma.organizationMembership.create({
      data: {
        orgId: owner.org.id,
        userId: existingMember.id,
        role: "MEMBER",
      },
    });
    const existingPrivilegedUsers = await Promise.all(
      [Role.OWNER, Role.ADMIN].map(async (role) => {
        const user = await prisma.user.create({
          data: {
            email: `gateway-existing-${role.toLowerCase()}-${randomUUID()}@example.test`,
          },
        });
        cleanupUsers.push(user.id);
        await prisma.organizationMembership.create({
          data: { orgId: owner.org.id, userId: user.id, role },
        });
        return user;
      }),
    );

    const config = await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: null,
      createProjectName: "llm-ingestion-project",
      ingestionMode: "USAGE",
    });
    const ingestionProjectId = config.defaultIngestionProjectId;
    expect(ingestionProjectId).not.toBeNull();
    if (!ingestionProjectId) throw new Error("Missing ingestion project");
    const project = await prisma.project.findFirstOrThrow({
      where: { id: ingestionProjectId },
    });

    const retriedConfig = await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: null,
      createProjectName: "llm-ingestion-project",
      ingestionMode: "USAGE",
    });
    expect(retriedConfig.defaultIngestionProjectId).toBe(ingestionProjectId);
    await expect(
      prisma.project.count({
        where: {
          orgId: owner.org.id,
          name: "llm-ingestion-project",
          deletedAt: null,
        },
      }),
    ).resolves.toBe(1);

    // Members remain excluded whether they joined before or after project
    // creation. Organization owners and admins inherit access in both cases.
    // This goes through the real NextAuth session callback because that session
    // is what every project-scoped tRPC procedure authorizes against.
    const futureMember = await prisma.user.create({
      data: { email: `gateway-future-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(futureMember.id);
    await prisma.organizationMembership.create({
      data: {
        orgId: owner.org.id,
        userId: futureMember.id,
        role: "MEMBER",
      },
    });
    const futurePrivilegedUsers = await Promise.all(
      [Role.OWNER, Role.ADMIN].map(async (role) => {
        const user = await prisma.user.create({
          data: {
            email: `gateway-future-${role.toLowerCase()}-${randomUUID()}@example.test`,
          },
        });
        cleanupUsers.push(user.id);
        await prisma.organizationMembership.create({
          data: { orgId: owner.org.id, userId: user.id, role },
        });
        return user;
      }),
    );

    await expect(sessionProjectIds(owner.user.email!)).resolves.toContain(
      project.id,
    );
    for (const user of [...existingPrivilegedUsers, ...futurePrivilegedUsers]) {
      await expect(sessionProjectIds(user.email!)).resolves.toContain(
        project.id,
      );
    }
    await expect(
      sessionProjectIds(existingMember.email!),
    ).resolves.not.toContain(project.id);
    await expect(sessionProjectIds(futureMember.email!)).resolves.not.toContain(
      project.id,
    );

    // Sanity check that exclusion is specific to the ingestion project: an
    // ordinary project in the same organization stays visible to the same
    // member through organization-role inheritance.
    const ordinaryProject = await prisma.project.create({
      data: { orgId: owner.org.id, name: `ordinary-${randomUUID()}` },
    });
    await expect(sessionProjectIds(existingMember.email!)).resolves.toContain(
      ordinaryProject.id,
    );

    // An explicit project membership still overrides the exclusion.
    const orgMembership = await prisma.organizationMembership.findFirstOrThrow({
      where: { orgId: owner.org.id, userId: existingMember.id },
      select: { id: true },
    });
    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: existingMember.id,
        orgMembershipId: orgMembership.id,
        role: Role.VIEWER,
      },
    });
    await expect(sessionProjectIds(existingMember.email!)).resolves.toContain(
      project.id,
    );
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

  it("stores provider credentials encrypted and never returns them", async () => {
    const { caller, org } = await prepare();
    const credential = "sk-test-gateway-redaction";
    const created = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI primary",
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
      name: "Anthropic primary",
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
    const created = await caller.aiGateway.createApiKey({
      orgId: org.id,
      note: "Production gateway",
      metadata: { environment: "production", costCenter: 42 },
    });
    expect(created.secretKey).toMatch(/^sk-lf-/);

    const listed = await caller.aiGateway.listApiKeys({ orgId: org.id });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      apiKey: { id: created.id, note: "Production gateway" },
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

  it("owns successful and failed mutation auditing in gateway services", async () => {
    const { org, session } = await prepare();
    const gatewayService = new GatewayConfigService(prisma);
    const providerService = new GatewayProviderService(prisma);
    const apiKeyService = new GatewayApiKeyService(prisma);

    await gatewayService.updateConfig({
      organizationId: org.id,
      defaultIngestionProjectId: null,
      createProjectName: "Audited ingestion project",
      ingestionMode: "USAGE",
      session,
    });
    await providerService.create({
      organizationId: org.id,
      name: "Audited provider",
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
      { resourceType: "project", action: "create" },
      { resourceType: "gatewayAiConnection", action: "create" },
      { resourceType: "gatewayApiKey", action: "create" },
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
        name: "Rejected provider",
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

    for (const note of ["First", "Second", "Third"]) {
      await caller.aiGateway.createApiKey({
        orgId: org.id,
        note,
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

  it("routes by format and priority and issues a verifiable ingestion token", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "FULL",
    });
    const openAiPrimary = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI first",
      provider: "OPENAI",
      credential: "sk-test-openai-primary",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI second",
      provider: "OPENAI",
      credential: "sk-test-openai-secondary",
    });
    const gatewayKey = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });

    const originalJwtConfig = {
      privateKey: env.LANGFUSE_GATEWAY_JWT_PRIVATE_KEY,
      publicKey: env.LANGFUSE_GATEWAY_JWT_PUBLIC_KEY,
      keyId: env.LANGFUSE_GATEWAY_JWT_KEY_ID,
      issuer: env.LANGFUSE_GATEWAY_JWT_ISSUER,
      audience: env.LANGFUSE_GATEWAY_JWT_AUDIENCE,
    };
    const signingKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const privateKey = signingKeys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const publicKey = signingKeys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString();
    Object.assign(env, {
      LANGFUSE_GATEWAY_JWT_PRIVATE_KEY: privateKey,
      LANGFUSE_GATEWAY_JWT_PUBLIC_KEY: publicKey,
      LANGFUSE_GATEWAY_JWT_KEY_ID: "current",
      LANGFUSE_GATEWAY_JWT_ISSUER: "test-issuer",
      LANGFUSE_GATEWAY_JWT_AUDIENCE: "test-audience",
    });

    try {
      const apiFormat = "openai.chat-completions" as const;
      const jwtVerifier = createEs256JwtVerifier({
        publicKeys: [{ id: "current", publicKey }],
        issuer: "test-issuer",
        audience: "test-audience",
        claimsSchema: GatewayIngestionClaimsSchema,
      });
      const result = await new GatewayResolveService(prisma).resolve({
        fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
        apiFormat,
      });

      expect(openAiPrimary.routingPriority).toBe(0);
      expect(result.connection).toEqual({
        id: openAiPrimary.id,
        provider: "openai",
        api_format: apiFormat,
        base_url: "https://api.openai.com/v1",
        auth: { type: "Bearer", token: "sk-test-openai-primary" },
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
      expect(result.ingestion_mode).toBe("full");
      expect(result.ingestion?.expires_at).toBe(ingestionClaims.exp);
    } finally {
      Object.assign(env, {
        LANGFUSE_GATEWAY_JWT_PRIVATE_KEY: originalJwtConfig.privateKey,
        LANGFUSE_GATEWAY_JWT_PUBLIC_KEY: originalJwtConfig.publicKey,
        LANGFUSE_GATEWAY_JWT_KEY_ID: originalJwtConfig.keyId,
        LANGFUSE_GATEWAY_JWT_ISSUER: originalJwtConfig.issuer,
        LANGFUSE_GATEWAY_JWT_AUDIENCE: originalJwtConfig.audience,
      });
    }
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

  it("keeps current access when an existing project becomes the ingestion project", async () => {
    const owner = await prepare();
    const existingMember = await prisma.user.create({
      data: { email: `gateway-existing-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(existingMember.id);
    await prisma.organizationMembership.create({
      data: {
        orgId: owner.org.id,
        userId: existingMember.id,
        role: "MEMBER",
      },
    });

    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });

    // Choosing an existing project must not silently take it away from the
    // people who already worked in it, so their inherited role is written out
    // as an explicit membership.
    await expect(sessionProjectIds(existingMember.email!)).resolves.toContain(
      owner.project.id,
    );
    await expect(
      prisma.projectMembership.findUnique({
        where: {
          projectId_userId: {
            projectId: owner.project.id,
            userId: existingMember.id,
          },
        },
      }),
    ).resolves.toMatchObject({ role: "MEMBER" });

    // Only members who join afterwards are kept out.
    const futureMember = await prisma.user.create({
      data: { email: `gateway-later-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(futureMember.id);
    await prisma.organizationMembership.create({
      data: { orgId: owner.org.id, userId: futureMember.id, role: "MEMBER" },
    });
    await expect(sessionProjectIds(futureMember.email!)).resolves.not.toContain(
      owner.project.id,
    );

    // Saving an unrelated setting must not grant access to people who joined
    // after this project was designated for gateway ingestion.
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "FULL",
    });
    await expect(sessionProjectIds(futureMember.email!)).resolves.not.toContain(
      owner.project.id,
    );
    await expect(
      prisma.projectMembership.findUnique({
        where: {
          projectId_userId: {
            projectId: owner.project.id,
            userId: futureMember.id,
          },
        },
      }),
    ).resolves.toBeNull();
  });

  it("keeps routing priorities contiguous through reorders and deletes", async () => {
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
    const priorities = async () =>
      (
        await prisma.gatewayAiConnection.findMany({
          where: { organizationId: org.id },
          select: { name: true, routingPriority: true },
          orderBy: { routingPriority: "asc" },
        })
      ).map(({ name, routingPriority }) => [name, routingPriority]);

    expect(await priorities()).toEqual([
      ["first", 0],
      ["second", 1],
      ["third", 2],
    ]);

    // Reversing every row would violate the unique (organization_id,
    // routing_priority) index if the writes were applied in place.
    await caller.aiGateway.reorderConnections({
      orgId: org.id,
      connectionIds: [...created].reverse().map(({ id }) => id),
    });
    expect(await priorities()).toEqual([
      ["third", 0],
      ["second", 1],
      ["first", 2],
    ]);

    // Two reorders racing on one organization must serialize rather than
    // deadlock on rows locked in opposite orders.
    await expect(
      Promise.all([
        caller.aiGateway.reorderConnections({
          orgId: org.id,
          connectionIds: created.map(({ id }) => id),
        }),
        caller.aiGateway.reorderConnections({
          orgId: org.id,
          connectionIds: [...created].reverse().map(({ id }) => id),
        }),
      ]),
    ).resolves.toHaveLength(2);
    expect((await priorities()).map(([, priority]) => priority)).toEqual([
      0, 1, 2,
    ]);

    // Deleting from the middle must close the gap it leaves behind.
    await caller.aiGateway.deleteConnection({
      orgId: org.id,
      id: created[1].id,
    });
    expect((await priorities()).map(([, priority]) => priority)).toEqual([
      0, 1,
    ]);

    await expect(
      caller.aiGateway.reorderConnections({
        orgId: org.id,
        connectionIds: [created[0].id],
      }),
    ).rejects.toThrow(
      "Reorder must contain every organization gateway connection exactly once",
    );
    expect((await priorities()).map(([, priority]) => priority)).toEqual([
      0, 1,
    ]);
  });

  it("serves repeat resolves from cache and drops it when a connection changes", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "NONE",
    });
    const connection = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const resolveParams = {
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "openai.responses" as const,
    };
    const lookup = vi.spyOn(prisma.gatewayApiKeyAssociation, "findFirst");

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        new GatewayResolveService(prisma, {}).resolve(resolveParams),
      ).resolves.toMatchObject({
        connection: { auth: { type: "Bearer", token: "sk-test" } },
      });
    }
    // The second call must not reach Postgres: this endpoint runs on every LLM
    // request through the gateway.
    expect(lookup).toHaveBeenCalledOnce();

    // Disabling a connection has to take effect now, not when the TTL expires.
    await caller.aiGateway.updateConnection({
      orgId: org.id,
      id: connection.id,
      status: "DISABLED",
    });
    await expect(
      new GatewayResolveService(prisma, {}).resolve(resolveParams),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 404 }),
    );
    expect(lookup).toHaveBeenCalledTimes(2);
    lookup.mockRestore();
  });

  it("negatively caches unknown gateway keys", async () => {
    const resolveParams = {
      fastHashedSecretKey: createShaHash(`sk-lf-${randomUUID()}`, env.SALT),
      apiFormat: "openai.responses" as const,
    };
    const lookup = vi.spyOn(prisma.gatewayApiKeyAssociation, "findFirst");

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        new GatewayResolveService(prisma, {}).resolve(resolveParams),
      ).rejects.toEqual(
        expect.objectContaining<Partial<GatewayResolveError>>({ status: 401 }),
      );
    }
    // Without a negative cache, a client looping on a bad key is an unmetered
    // query generator against the primary.
    expect(lookup).toHaveBeenCalledOnce();
    lookup.mockRestore();
  });

  it("blocks resolve after the default ingestion project is deleted", async () => {
    const { caller, org, project } = await prepare();
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "NONE",
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
      new GatewayResolveService(prisma, {}).resolve({
        fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
        apiFormat,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 403 }),
    );
  });

  it("returns a canonical model catalog across enabled compatible connections", async () => {
    const { caller, org } = await prepare();
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-openai",
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
    const result = await service.list({
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "openai.responses",
    });

    expect(result).toEqual({
      data: [
        {
          id: "a-model",
          provider: "OPENAI",
          canonicalSlug: "a-model",
          displayName: "a-model",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
        {
          id: "shared-model",
          provider: "OPENAI",
          canonicalSlug: "shared-model",
          displayName: "shared-model",
          createdAt: "1970-01-01T00:00:15.000Z",
        },
      ],
    });
    const anthropicResult = await service.list({
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "anthropic.messages",
    });
    expect(anthropicResult).toEqual({
      data: [
        {
          id: "claude-a",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-a",
          displayName: "Claude A",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "claude-b",
          provider: "ANTHROPIC",
          canonicalSlug: "claude-b",
          displayName: "Claude B",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails model discovery instead of returning a partial catalog", async () => {
    const { caller, org } = await prepare();
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "OpenAI fallback",
      provider: "OPENAI",
      credential: "sk-openai-fallback",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      metadata: {},
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValue(
        Response.json({
          data: [{ id: "available-model", created: 10 }],
        }),
      );

    await expect(
      new GatewayModelsService(prisma, fetcher, null).list({
        fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
        apiFormat: "openai.chat-completions",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 503 }),
    );
  });
});
