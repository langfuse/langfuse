import dns from "node:dns/promises";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as SharedServer from "@langfuse/shared/src/server";
import type * as GatewayFetch from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import type * as BillingServer from "@/src/ee/features/billing/utils/isCloudBillingEnabled";
import { z } from "zod/v4";

const { addNotificationJobs, getNotificationJob } = vi.hoisted(() => ({
  getNotificationJob: vi.fn<(jobId: string) => Promise<unknown>>(),
  addNotificationJobs:
    vi.fn<
      (
        jobs: Array<{ data: { payload: SharedServer.NotificationEventType } }>,
      ) => Promise<unknown>
    >(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    testModelCall: vi.fn().mockResolvedValue(undefined),
    NotificationQueue: {
      getInstance: () => ({
        addBulk: addNotificationJobs,
        getJob: getNotificationJob,
      }),
    },
  };
});

vi.mock(
  "@/src/features/ai-gateway/server/provider/getGatewayFetch",
  async (importOriginal) => {
    const actual = await importOriginal<typeof GatewayFetch>();
    return { getGatewayFetch: vi.fn(actual.getGatewayFetch) };
  },
);

// organizations.delete cancels Stripe on Cloud, which the test env cannot reach.
const { isCloudBillingEnabled } = vi.hoisted(() => ({
  isCloudBillingEnabled: vi.fn<() => boolean>(),
}));

vi.mock(
  "@/src/ee/features/billing/utils/isCloudBillingEnabled",
  async (importOriginal) => {
    const actual = await importOriginal<typeof BillingServer>();
    isCloudBillingEnabled.mockImplementation(actual.isCloudBillingEnabled);
    return { ...actual, isCloudBillingEnabled };
  },
);

function queuedNotifications(): SharedServer.NotificationEventType[] {
  return addNotificationJobs.mock.calls.flatMap(([jobs]) =>
    jobs.map((job) => job.data.payload),
  );
}

import { env } from "@/src/env.mjs";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import * as sfdc from "@/src/ee/features/sfdc-sync/server/sfdcService";
import { appRouter } from "@/src/server/api/root";
import {
  createInnerTRPCContext,
  type OrgAuthedContext,
} from "@/src/server/api/trpc";
import { GATEWAY_CONNECTION_NAME_ERRORS } from "@/src/features/ai-gateway/constants/gatewayConnection";
import { MAX_TEAM_INVITES } from "@/src/features/ai-gateway/constants/gatewayTeamInvites";
import { GatewayApiKeyAuthenticator } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import {
  type GatewayResolveError,
  GatewayResolveService,
} from "@/src/features/ai-gateway/server/resolve/resolveService";
import { invalidateGatewayResolveCacheForApiKey } from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { GatewayModelsService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelsService";
import { GatewayModelsResponseSchema } from "@/src/features/ai-gateway/server/provider/registry";
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import { GatewaySpendLimitAlertService } from "@/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitAlertService";
import { GatewaySpendLimitRepository } from "@/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitRepository";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { getGatewaySetupRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";
import { GatewayModelCatalogService } from "@/src/features/ai-gateway/server/provider/models/gatewayModelCatalogService";
import { GatewayProviderService } from "@/src/features/ai-gateway/server/provider/connection/gatewayProviderService";
import { encodeBedrockCredential } from "@/src/features/ai-gateway/server/provider/bedrock";
import { testGatewayModel } from "@/src/features/ai-gateway/server/provider/connection/testGatewayModel";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import { getModelDiscoveryAdapter } from "@/src/features/ai-gateway/server/provider/models/modelDiscoveryRegistry";
import { createEs256JwtVerifier } from "@/src/server/utils/jwt";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createOrgMembership,
  deleteOrgMembership,
  updateOrgMembership,
} from "@langfuse/shared/memberships";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  createApiKey,
  createShaHash,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import {
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "@langfuse/shared";
import type { QueryType } from "@langfuse/shared/query";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];
const originalGatewayOrganizationAllowlist = [
  ...env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST,
];
const originalEmailConfig = {
  smtpConnectionUrl: env.SMTP_CONNECTION_URL,
  emailFromAddress: env.EMAIL_FROM_ADDRESS,
};
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
    SMTP_CONNECTION_URL: originalEmailConfig.smtpConnectionUrl,
    EMAIL_FROM_ADDRESS: originalEmailConfig.emailFromAddress,
  });
  vi.clearAllMocks();
  vi.mocked(getGatewayFetch).mockReset();
});

async function authenticateRequest(
  params: Parameters<GatewayApiKeyAuthenticator["authenticateRequest"]>[0],
) {
  const context = await new GatewayApiKeyAuthenticator(
    prisma,
  ).authenticateRequest(params);
  const service = new GatewayResolveService();
  return service.resolve({
    context,
    apiFormat: params.apiFormat,
    pricing: service.findPricing(context),
  });
}

function gatewaySession(params: {
  user: { id: string; name: string | null };
  org: { id: string; name: string };
  project: { id: string; name: string; createdAt: Date };
  role: Role;
  projectRole?: Role;
}) {
  return createSession({
    user: {
      id: params.user.id,
      name: params.user.name,
      featureFlags: testFeatureFlags({ templateFlag: false }),
    },
    organizations: [
      {
        id: params.org.id,
        role: params.role,
        name: params.org.name,
        plan: "oss",
        aiTelemetryEnabled: true,
        projects: [
          {
            id: params.project.id,
            role: params.projectRole ?? params.role,
            retentionDays: 0,
            name: params.project.name,
            createdAt: params.project.createdAt.toISOString(),
          },
        ],
      },
    ],
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
  await createOrgMembership(prisma, { orgId: org.id, userId: user.id, role });
  cleanupOrganizations.push(org.id);
  cleanupUsers.push(user.id);
  env.LANGFUSE_AI_GATEWAY_ORGANIZATION_ID_ALLOWLIST.push(org.id);

  const session = gatewaySession({ user, org, project, role });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const orgSession = {
    ...session,
    user: session.user!,
    orgId: org.id,
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
  projectRole: Role = role,
) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `gateway-role-${suffix}@example.test`,
      name: `Gateway ${role.toLowerCase()}`,
    },
  });
  await createOrgMembership(prisma, {
    orgId: setup.org.id,
    userId: user.id,
    role,
  });
  cleanupUsers.push(user.id);

  const session = gatewaySession({
    user,
    org: setup.org,
    project: setup.project,
    role,
    projectRole,
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("AI gateway control plane", () => {
  it.each([
    {
      productUrl: "https://staging.langfuse.com",
      gatewayUrl: "https://gateway.staging.langfuse.com/v1",
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
          caller.aiGateway.getClientSetup({ orgId: org.id }),
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

  it.skipIf(env.NODE_ENV === "development")(
    "turns the gateway off on a self-hosted deployment without a gateway",
    async () => {
      const { caller, org } = await prepare();
      const original = {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        LANGFUSE_AI_GATEWAY_DEPLOYED: env.LANGFUSE_AI_GATEWAY_DEPLOYED,
        LANGFUSE_AI_GATEWAY_ENABLED: env.LANGFUSE_AI_GATEWAY_ENABLED,
      };
      Object.assign(env, {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
        LANGFUSE_AI_GATEWAY_DEPLOYED: "false",
        LANGFUSE_AI_GATEWAY_ENABLED: "true",
      });

      try {
        await expect(
          caller.aiGateway.getConfig({ orgId: org.id }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        Object.assign(env, original);
      }
    },
  );

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

  it("reports the ingestion setup status to gateway readers", async () => {
    const owner = await prepare();
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    const noAccess = await createCallerForOrganizationRole(owner, Role.NONE);

    await expect(
      viewer.aiGateway.getSetupStatus({ orgId: owner.org.id }),
    ).resolves.toEqual({ isConfigured: false, isRecording: false });
    await expect(
      noAccess.aiGateway.getSetupStatus({ orgId: owner.org.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await expect(
      viewer.aiGateway.getSetupStatus({ orgId: owner.org.id }),
    ).resolves.toEqual({ isConfigured: true, isRecording: true });

    await prisma.project.update({
      where: { id: owner.project.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      viewer.aiGateway.getSetupStatus({ orgId: owner.org.id }),
    ).resolves.toEqual({ isConfigured: false, isRecording: false });
  });

  it("gives key owners the gateway URL and enabled providers without connection details", async () => {
    const owner = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    await owner.caller.aiGateway.createConnection({
      orgId: owner.org.id,
      name: "OpenAI-primary",
      provider: "OPENAI",
      credential: "sk-test-client-setup",
    });

    const setup = await member.aiGateway.getClientSetup({
      orgId: owner.org.id,
    });
    expect(setup).toEqual({
      gatewayBaseUrl: expect.any(String),
      providers: ["OPENAI"],
      apiProviders: ["OPENAI"],
    });
    await expect(
      viewer.aiGateway.getClientSetup({ orgId: owner.org.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redirects gateway managers to Setup until ingestion is set up", async () => {
    const owner = await prepare();
    const memberSession = gatewaySession({
      user: owner.user,
      org: owner.org,
      project: owner.project,
      role: Role.MEMBER,
      projectRole: Role.OWNER,
    });
    const redirectFor = (session: Session, slug: string) =>
      getGatewaySetupRedirect({
        prisma,
        session,
        organizationId: owner.org.id,
        slug,
      });
    const setupPath = `/organization/${owner.org.id}/ai-gateway`;

    await expect(redirectFor(owner.session, "api-keys")).resolves.toBe(
      setupPath,
    );
    await expect(redirectFor(owner.session, "models")).resolves.toBe(setupPath);
    await expect(redirectFor(owner.session, "index")).resolves.toBeNull();
    await expect(redirectFor(memberSession, "models")).resolves.toBeNull();

    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await expect(redirectFor(owner.session, "api-keys")).resolves.toBeNull();
  });

  it("notifies only members who can use the gateway", async () => {
    const owner = await prepare();
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    await createCallerForOrganizationRole(owner, Role.MEMBER);
    await createCallerForOrganizationRole(owner, Role.VIEWER);
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const memberEmails = await prisma.organizationMembership.findMany({
      where: { orgId: owner.org.id, role: Role.MEMBER },
      select: { user: { select: { email: true } } },
    });

    const notifiableMembers = await owner.caller.aiGateway.getNotifiableMembers(
      {
        orgId: owner.org.id,
      },
    );
    expect(notifiableMembers).toMatchObject({
      isEmailConfigured: true,
      count: 1,
    });

    const inviteeEmail = `gateway-invitee-${randomUUID()}@example.test`;
    const result = await owner.caller.aiGateway.inviteTeam({
      orgId: owner.org.id,
      emails: [inviteeEmail],
      notifyMembers: true,
    });
    expect(result).toEqual({
      invitedCount: 1,
      existingMemberCount: 0,
      failed: [],
      notifiedCount: 1,
    });

    expect(queuedNotifications()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "AI_GATEWAY_INVITATION",
          to: inviteeEmail,
          audience: { kind: "invitee", hasAccount: false },
        }),
        expect.objectContaining({
          type: "AI_GATEWAY_INVITATION",
          to: memberEmails[0]?.user.email?.toLowerCase(),
          audience: { kind: "member" },
          inviterName: "Gateway tester",
        }),
      ]),
    );
    expect(queuedNotifications()).toHaveLength(2);
    await expect(
      prisma.membershipInvitation.findFirst({
        where: { orgId: owner.org.id, email: inviteeEmail },
        select: { orgRole: true },
      }),
    ).resolves.toEqual({ orgRole: Role.AI_GATEWAY });
  });

  it("tells which invitee addresses already belong to the organization and get notified", async () => {
    const owner = await prepare();
    await createCallerForOrganizationRole(owner, Role.MEMBER);
    await createCallerForOrganizationRole(owner, Role.VIEWER);
    const emailOf = async (role: Role) => {
      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { orgId: owner.org.id, role },
        select: { user: { select: { email: true } } },
      });
      return membership.user.email!.toLowerCase();
    };
    const memberEmail = await emailOf(Role.MEMBER);
    const viewerEmail = await emailOf(Role.VIEWER);
    const ownerEmail = owner.user.email!.toLowerCase();
    const outsiderEmail = `gateway-outsider-${randomUUID()}@example.test`;

    const result = await owner.caller.aiGateway.getInviteeMembers({
      orgId: owner.org.id,
      emails: [
        memberEmail,
        viewerEmail.toUpperCase(),
        ownerEmail,
        outsiderEmail,
      ],
    });

    expect(result).toEqual([
      {
        email: memberEmail,
        member: { name: "Gateway member", isSelf: false, canUseGateway: true },
      },
      {
        email: viewerEmail,
        member: { name: "Gateway viewer", isSelf: false, canUseGateway: false },
      },
      {
        email: ownerEmail,
        member: { name: "Gateway tester", isSelf: true, canUseGateway: true },
      },
      { email: outsiderEmail, member: null },
    ]);
  });

  it("suggests other gateway members, skipping picked ones and narrowing by search", async () => {
    const owner = await prepare();
    for (let i = 0; i < 5; i++) {
      await createCallerForOrganizationRole(owner, Role.MEMBER);
    }
    await createCallerForOrganizationRole(owner, Role.VIEWER);
    const members = await prisma.organizationMembership.findMany({
      where: { orgId: owner.org.id, role: Role.MEMBER },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
      select: { user: { select: { email: true } } },
    });
    const memberEmails = members.map(({ user }) => user.email!);
    const suggest = (search: string, excludeEmails: string[] = []) =>
      owner.caller.aiGateway
        .getMemberSuggestions({ orgId: owner.org.id, search, excludeEmails })
        .then((suggestions) => suggestions.map(({ email }) => email));

    await expect(suggest("")).resolves.toEqual(memberEmails.slice(0, 4));
    await expect(
      suggest("", [memberEmails[0]!.toUpperCase()]),
    ).resolves.toEqual(memberEmails.slice(1, 5));
    await expect(suggest(memberEmails[4]!.toUpperCase())).resolves.toEqual([
      memberEmails[4],
    ]);
    await expect(suggest("GATEWAY MEMBER")).resolves.toHaveLength(4);
    await expect(suggest("gateway_role")).resolves.toEqual([]);
  });

  it.each([false, true])(
    "announces the gateway once to a typed address of a member (notifyMembers: %s)",
    async (notifyMembers) => {
      const owner = await prepare();
      Object.assign(env, {
        SMTP_CONNECTION_URL: "smtp://localhost:1025",
        EMAIL_FROM_ADDRESS: "gateway@example.test",
      });
      await createCallerForOrganizationRole(owner, Role.MEMBER);
      const membership = await prisma.organizationMembership.findFirstOrThrow({
        where: { orgId: owner.org.id, role: Role.MEMBER },
        select: { user: { select: { email: true } } },
      });
      const memberEmail = membership.user.email!;

      const result = await owner.caller.aiGateway.inviteTeam({
        orgId: owner.org.id,
        emails: [memberEmail.toUpperCase()],
        notifyMembers,
      });

      expect(result).toEqual({
        invitedCount: 0,
        existingMemberCount: 1,
        failed: [],
        notifiedCount: 1,
      });
      expect(queuedNotifications()).toEqual([
        expect.objectContaining({
          audience: { kind: "member" },
          to: memberEmail.toLowerCase(),
          receiverName: "Gateway member",
        }),
      ]);
    },
  );

  it("re-sends an email whose earlier job failed", async () => {
    const owner = await prepare();
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    await createCallerForOrganizationRole(owner, Role.MEMBER);
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { orgId: owner.org.id, role: Role.MEMBER },
      select: { user: { select: { email: true } } },
    });
    const memberEmail = membership.user.email!.toLowerCase();
    const removeFailedJob = vi.fn().mockResolvedValue(undefined);
    getNotificationJob.mockResolvedValueOnce({
      isFailed: () => Promise.resolve(true),
      remove: removeFailedJob,
    });

    await owner.caller.aiGateway.inviteTeam({
      orgId: owner.org.id,
      emails: [memberEmail],
      notifyMembers: false,
    });

    expect(getNotificationJob).toHaveBeenCalledWith(
      `ai-gateway-invitation-${owner.org.id}-member-${createHash("sha256").update(memberEmail).digest("hex")}`,
    );
    expect(removeFailedJob).toHaveBeenCalledOnce();
    expect(removeFailedJob.mock.invocationCallOrder[0]).toBeLessThan(
      addNotificationJobs.mock.invocationCallOrder[0]!,
    );
  });

  it("adds invitees with an account without waiting for their SFDC sync", async () => {
    const owner = await prepare();
    const user = await prisma.user.create({
      data: { email: `gateway-account-${randomUUID()}@example.test` },
    });
    cleanupUsers.push(user.id);
    const setUserRole = vi.fn(() => new Promise<boolean>(() => {}));
    const getSfdcService = vi
      .spyOn(sfdc, "getSfdcService")
      .mockReturnValue({ setUserRole } as never);

    try {
      const result = await owner.caller.aiGateway.inviteTeam({
        orgId: owner.org.id,
        emails: [user.email!],
        notifyMembers: false,
      });

      expect(result).toMatchObject({ invitedCount: 1, failed: [] });
      expect(setUserRole).toHaveBeenCalledWith({
        orgId: owner.org.id,
        userId: user.id,
        email: user.email,
        role: Role.AI_GATEWAY,
      });
    } finally {
      getSfdcService.mockRestore();
    }
  });

  it("reports typed members who cannot use the gateway and skips the sender", async () => {
    const owner = await prepare();
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    await createCallerForOrganizationRole(owner, Role.VIEWER);
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { orgId: owner.org.id, role: Role.VIEWER },
      select: { user: { select: { email: true } } },
    });
    const viewerEmail = membership.user.email!;

    const result = await owner.caller.aiGateway.inviteTeam({
      orgId: owner.org.id,
      emails: [viewerEmail, owner.user.email!],
      notifyMembers: false,
    });

    expect(result).toEqual({
      invitedCount: 0,
      existingMemberCount: 1,
      failed: [
        {
          email: viewerEmail,
          message: "Already a member, but their role can't use the AI Gateway",
        },
      ],
      notifiedCount: 0,
    });
    expect(queuedNotifications()).toEqual([]);
  });

  it("rejects more than MAX_TEAM_INVITES addresses in one request", async () => {
    const owner = await prepare();
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });

    await expect(
      owner.caller.aiGateway.inviteTeam({
        orgId: owner.org.id,
        emails: Array.from(
          { length: MAX_TEAM_INVITES + 1 },
          (_, index) => `gateway-invitee-${index}@example.test`,
        ),
        notifyMembers: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(queuedNotifications()).toEqual([]);
    await expect(
      prisma.membershipInvitation.count({ where: { orgId: owner.org.id } }),
    ).resolves.toBe(0);
  });

  it("requires an ingestion project unless ingestion mode is NONE on self-hosted", async () => {
    const { caller, org } = await prepare();
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    try {
      Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined });
      await expect(
        caller.aiGateway.updateConfig({
          orgId: org.id,
          defaultIngestionProjectId: null,
          ingestionMode: "USAGE",
        }),
      ).rejects.toThrow("default ingestion project is required");

      await caller.aiGateway.updateConfig({
        orgId: org.id,
        defaultIngestionProjectId: null,
        ingestionMode: "NONE",
      });
      await expect(
        caller.aiGateway.getSetupStatus({ orgId: org.id }),
      ).resolves.toEqual({ isConfigured: true, isRecording: false });
    } finally {
      Object.assign(env, {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalCloudRegion,
      });
    }
  });

  it("rejects NONE on cloud and treats a stored NONE config as USAGE", async () => {
    const { caller, org, project } = await prepare();
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    try {
      Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU" });
      await expect(
        caller.aiGateway.updateConfig({
          orgId: org.id,
          defaultIngestionProjectId: project.id,
          ingestionMode: "NONE",
        }),
      ).rejects.toThrow("not available on Langfuse Cloud");

      await prisma.gatewayConfig.create({
        data: {
          organizationId: org.id,
          defaultIngestionProjectId: null,
          ingestionMode: "NONE",
        },
      });
      await expect(
        caller.aiGateway.getConfig({ orgId: org.id }),
      ).resolves.toMatchObject({ config: { ingestionMode: "USAGE" } });
      await expect(
        caller.aiGateway.getSetupStatus({ orgId: org.id }),
      ).resolves.toEqual({ isConfigured: false, isRecording: false });

      await prisma.gatewayConfig.update({
        where: { organizationId: org.id },
        data: { defaultIngestionProjectId: project.id },
      });
      await expect(
        caller.projects.deletionProtection({ projectId: project.id }),
      ).resolves.toEqual({ isGatewayIngestionProject: true });
    } finally {
      Object.assign(env, {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalCloudRegion,
      });
    }
  });

  it.each([
    { adminRole: Role.OWNER, readRole: Role.MEMBER },
    { adminRole: Role.ADMIN, readRole: Role.VIEWER },
  ])(
    "returns the full model catalog to $adminRole and $readRole",
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
        allowedModels: ["enabled-model", "unlisted-model"],
        expectedUpdatedAt: connection.updatedAt,
      });
      const readCaller = await createCallerForOrganizationRole(setup, readRole);
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () =>
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
            models: ["disabled-model", "enabled-model", "codex-auto-review"],
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
            models: ["disabled-model", "enabled-model", "codex-auto-review"],
          },
        ]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it("calls a rejecting provider once per window for a MEMBER and shows the allowlist without marking ERROR", async () => {
    const setup = await prepare();
    const connection = await setup.caller.aiGateway.createConnection({
      orgId: setup.org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    await setup.caller.aiGateway.updateConnectionModels({
      orgId: setup.org.id,
      id: connection.id,
      allowedModels: ["gpt-5"],
      expectedUpdatedAt: connection.updatedAt,
    });
    const memberCaller = await createCallerForOrganizationRole(
      setup,
      Role.MEMBER,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    try {
      await new GatewayModelCatalogService(prisma).clearModelCache(
        setup.org.id,
        connection.id,
      );
      for (let load = 0; load < 2; load++) {
        await expect(
          memberCaller.aiGateway.refreshModels({ orgId: setup.org.id }),
        ).resolves.toEqual([
          {
            connectionId: connection.id,
            success: true,
            models: ["gpt-5"],
            catalogUnavailable: true,
          },
        ]);
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await expect(
        prisma.gatewayAiConnection.findUniqueOrThrow({
          where: { id: connection.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "ENABLED" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("keeps a connection ENABLED when its credential changes while a rejected discovery runs", async () => {
    const setup = await prepare();
    const connection = await setup.caller.aiGateway.createConnection({
      orgId: setup.org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-revoked-openai",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        await prisma.gatewayAiConnection.update({
          where: { id: connection.id },
          data: { encryptedCredential: encrypt("sk-replaced-openai") },
        });
        return new Response(null, { status: 401 });
      });

    try {
      await new GatewayModelCatalogService(prisma).clearModelCache(
        setup.org.id,
        connection.id,
      );
      await expect(
        setup.caller.aiGateway.refreshModels({ orgId: setup.org.id }),
      ).resolves.toEqual([
        { connectionId: connection.id, success: false, error: "unauthorized" },
      ]);
      await expect(
        prisma.gatewayAiConnection.findUniqueOrThrow({
          where: { id: connection.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "ENABLED" });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("keeps a custom base URL connection ENABLED when its proxy rejects model discovery", async () => {
    const setup = await prepare();
    const originalPreviewPrUrl = env.NEXT_PUBLIC_PREVIEW_PR_URL;
    Object.assign(env, {
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://pr-1.preview.langfuse.com",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const connection = await setup.caller.aiGateway.createConnection({
        orgId: setup.org.id,
        name: "OpenAI-proxy",
        provider: "OPENAI",
        credential: "sk-proxy-openai",
        baseURL: "https://93.184.215.14/v1",
      });
      fetchSpy.mockResolvedValue(new Response(null, { status: 403 }));
      await new GatewayModelCatalogService(prisma).clearModelCache(
        setup.org.id,
        connection.id,
      );
      await expect(
        setup.caller.aiGateway.refreshModels({ orgId: setup.org.id }),
      ).resolves.toEqual([
        { connectionId: connection.id, success: false, error: "unauthorized" },
      ]);
      await expect(
        prisma.gatewayAiConnection.findUniqueOrThrow({
          where: { id: connection.id },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "ENABLED" });
    } finally {
      fetchSpy.mockRestore();
      Object.assign(env, { NEXT_PUBLIC_PREVIEW_PR_URL: originalPreviewPrUrl });
    }
  });

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

  it("tests an edited connection with its stored extra header values, as saving does", async () => {
    const { caller, org } = await prepare();
    const originalPreviewPrUrl = env.NEXT_PUBLIC_PREVIEW_PR_URL;
    Object.assign(env, {
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://pr-1.preview.langfuse.com",
    });
    try {
      const connection = await caller.aiGateway.createConnection({
        orgId: org.id,
        name: "OpenAI-proxy",
        provider: "OPENAI",
        credential: "sk-old-openai",
        baseURL: "https://93.184.215.14/v1",
        extraHeaders: { "x-proxy-token": "stored-proxy-token" },
      });

      await caller.aiGateway.testConnection({
        orgId: org.id,
        id: connection.id,
        provider: "OPENAI",
        credential: "sk-new-openai",
        baseURL: "https://93.184.215.14/v1",
        extraHeaders: { "x-proxy-token": "" },
      });

      const [{ apiKey }] = vi.mocked(SharedServer.testModelCall).mock.lastCall!;
      expect(apiKey.baseURL).toBe("https://93.184.215.14/v1");
      expect(
        SharedServer.decryptAndParseExtraHeaders(apiKey.extraHeaders),
      ).toEqual({ "x-proxy-token": "stored-proxy-token" });
    } finally {
      Object.assign(env, { NEXT_PUBLIC_PREVIEW_PR_URL: originalPreviewPrUrl });
    }
  });

  it("stores custom base URLs in the form the gateway appends routes to", async () => {
    const { caller, org } = await prepare();
    const originalPreviewPrUrl = env.NEXT_PUBLIC_PREVIEW_PR_URL;
    Object.assign(env, {
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://pr-1.preview.langfuse.com",
    });
    try {
      const created = await caller.aiGateway.createConnection({
        orgId: org.id,
        name: "Anthropic-proxy",
        provider: "ANTHROPIC",
        credential: "sk-ant-test-gateway",
        baseURL: "https://93.184.215.14/anthropic/",
      });
      const stored = await prisma.gatewayAiConnection.findUniqueOrThrow({
        where: { id: created.id },
        select: { baseURL: true },
      });
      expect(stored.baseURL).toBe("https://93.184.215.14/anthropic/v1");

      await expect(
        caller.aiGateway.createConnection({
          orgId: org.id,
          name: "OpenAI-proxy",
          provider: "OPENAI",
          credential: "sk-test-gateway",
          baseURL: "https://93.184.215.14/v1?api-version=1",
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("query strings"),
      });
    } finally {
      Object.assign(env, { NEXT_PUBLIC_PREVIEW_PR_URL: originalPreviewPrUrl });
    }
  });

  it("keeps official origins inside a configured host allowlist", async () => {
    const original = {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
        sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS:
        sharedEnv.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS,
    };
    Object.assign(sharedEnv, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS: ["proxy.corp"],
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));

    try {
      const discovery = await getModelDiscoveryAdapter("OPENAI").fetchCatalog({
        credential: "sk-test",
        config: null,
        baseURL: null,
        extraHeaders: {},
        fetcher: getGatewayFetch({
          baseURL: null,
          extraHeaders: {},
          logContext: "test",
        }),
      });
      const modelTest = await testGatewayModel({
        provider: "ANTHROPIC",
        config: null,
        baseURL: null,
        extraHeaders: {},
        credential: "sk-ant-test",
        model: "claude-haiku-4-5",
      });

      expect(discovery.success).toBe(false);
      expect(modelTest.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      Object.assign(sharedEnv, original);
    }
  });

  it.skipIf(env.NODE_ENV === "development")(
    "accepts extra headers and validates base URLs on every route that accepts them",
    async () => {
      const { caller, org } = await prepare();
      type Endpoint = {
        baseURL?: string | null;
        extraHeaders?: Record<string, string>;
      };
      const original = {
        web: {
          NEXT_PUBLIC_PREVIEW_PR_URL: env.NEXT_PUBLIC_PREVIEW_PR_URL,
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        },
        sharedCloudRegion: sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      };
      const privateHostname = "llm.internal.example.com";
      const realDns = {
        resolve4: dns.resolve4,
        resolve6: dns.resolve6,
        lookup: dns.lookup,
      };
      const dnsSpies = [
        vi
          .spyOn(dns, "resolve4")
          .mockImplementation(((hostname: string) =>
            hostname === privateHostname
              ? Promise.resolve(["10.0.0.5"])
              : realDns.resolve4(hostname)) as typeof dns.resolve4),
        vi
          .spyOn(dns, "resolve6")
          .mockImplementation(((hostname: string) =>
            hostname === privateHostname
              ? Promise.reject(new Error("ENODATA"))
              : realDns.resolve6(hostname)) as typeof dns.resolve6),
        vi
          .spyOn(dns, "lookup")
          .mockImplementation(((hostname: string, options: never) =>
            hostname === privateHostname
              ? Promise.resolve([{ address: "10.0.0.5", family: 4 }])
              : realDns.lookup(hostname, options)) as typeof dns.lookup),
      ];

      try {
        Object.assign(env, {
          NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
          NEXT_PUBLIC_PREVIEW_PR_URL: undefined,
        });
        const proxied = await caller.aiGateway.createConnection({
          orgId: org.id,
          name: "OpenAI-proxied",
          provider: "OPENAI",
          credential: "sk-test",
          baseURL: "https://93.184.215.14/v1",
          extraHeaders: { "x-team": "research" },
        });
        // Created as OpenAI because creating an OpenRouter connection checks
        // the credential against openrouter.ai.
        const openRouter = await caller.aiGateway.createConnection({
          orgId: org.id,
          name: "OpenRouter-proxied",
          provider: "OPENAI",
          credential: "sk-test",
        });
        await prisma.gatewayAiConnection.update({
          where: { id: openRouter.id },
          data: { provider: "OPENROUTER" },
        });
        const routesFor = (
          provider: "OPENAI" | "OPENROUTER",
          connectionId: string,
        ) => ({
          testConnection: (endpoint: Endpoint) =>
            caller.aiGateway.testConnection({
              orgId: org.id,
              id: connectionId,
              provider,
              credential: "sk-test",
              ...endpoint,
            }),
          createConnection: (endpoint: Endpoint) =>
            caller.aiGateway.createConnection({
              orgId: org.id,
              name: `${provider}-${randomUUID().slice(0, 8)}`,
              provider,
              credential: "sk-test",
              ...endpoint,
            }),
          updateConnection: (endpoint: Endpoint) =>
            caller.aiGateway.updateConnection({
              orgId: org.id,
              id: connectionId,
              credential: "sk-test",
              ...endpoint,
            }),
        });
        const routes = routesFor("OPENAI", proxied.id);
        const routesByProvider = {
          OPENAI: routes,
          OPENROUTER: routesFor("OPENROUTER", openRouter.id),
        };
        const rejected: Array<{
          name: string;
          cloud?: true;
          endpoint: Endpoint;
          code: string;
        }> = [
          {
            name: "loopback",
            endpoint: { baseURL: "https://127.0.0.1/v1" },
            code: "BAD_REQUEST",
          },
          {
            name: "cloud metadata",
            endpoint: { baseURL: "http://169.254.169.254/v1" },
            code: "BAD_REQUEST",
          },
          {
            name: "hostname resolving to a private address",
            endpoint: { baseURL: `https://${privateHostname}/v1` },
            code: "BAD_REQUEST",
          },
          {
            name: "embedded credentials",
            endpoint: { baseURL: "https://user:pass@93.184.215.14/v1" },
            code: "BAD_REQUEST",
          },
          {
            name: "HTTP on Cloud",
            cloud: true,
            endpoint: { baseURL: "http://93.184.215.14/v1" },
            code: "BAD_REQUEST",
          },
        ];

        const outcomes: string[] = [];
        for (const testCase of rejected) {
          sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = testCase.cloud
            ? "STAGING"
            : undefined;
          for (const [provider, providerRoutes] of Object.entries(
            routesByProvider,
          )) {
            for (const [route, call] of Object.entries(providerRoutes)) {
              // A rejected credential check also answers BAD_REQUEST, so only
              // the base URL validation message proves the URL was refused.
              const code = await call(testCase.endpoint).then(
                () => "OK",
                (error: { code?: string; message?: string }) =>
                  error.message?.startsWith("Invalid base URL")
                    ? (error.code ?? "UNKNOWN")
                    : `${error.code ?? "UNKNOWN"} (${error.message})`,
              );
              if (code !== testCase.code) {
                outcomes.push(`${provider} ${route} ${testCase.name}: ${code}`);
              }
            }
          }
        }
        expect(outcomes).toEqual([]);
        expect(dns.resolve4).toHaveBeenCalledWith(privateHostname);

        sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
        await expect(
          routes.testConnection({
            baseURL: null,
            extraHeaders: { "x-team": "research" },
          }),
        ).resolves.toMatchObject({ success: true });
        await expect(
          prisma.gatewayAiConnection.findUniqueOrThrow({
            where: { id: proxied.id },
            select: { extraHeaderKeys: true },
          }),
        ).resolves.toEqual({ extraHeaderKeys: ["x-team"] });
        const cleared = { baseURL: null, extraHeaders: {} };
        await expect(routes.testConnection(cleared)).resolves.toMatchObject({
          success: true,
        });
        await routes.updateConnection(cleared);
        await expect(
          prisma.gatewayAiConnection.findUniqueOrThrow({
            where: { id: proxied.id },
            select: { baseURL: true, extraHeaderKeys: true },
          }),
        ).resolves.toEqual({ baseURL: null, extraHeaderKeys: [] });
      } finally {
        dnsSpies.forEach((spy) => spy.mockRestore());
        Object.assign(env, original.web);
        sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION =
          original.sharedCloudRegion;
      }
    },
  );

  it("rejects forbidden extra headers on every route that accepts them, before calling the provider or saving", async () => {
    const { caller, org } = await prepare();
    const originalPreviewPrUrl = env.NEXT_PUBLIC_PREVIEW_PR_URL;
    Object.assign(env, {
      NEXT_PUBLIC_PREVIEW_PR_URL: "https://pr-1.preview.langfuse.com",
    });
    try {
      const existing = await caller.aiGateway.createConnection({
        orgId: org.id,
        name: "OpenAI-existing",
        provider: "OPENAI",
        credential: "sk-test",
        extraHeaders: { "x-team": "research" },
      });
      vi.mocked(SharedServer.testModelCall).mockClear();

      const routes = {
        testConnection: (extraHeaders: Record<string, string>) =>
          caller.aiGateway.testConnection({
            orgId: org.id,
            provider: "OPENAI",
            credential: "sk-test",
            extraHeaders,
          }),
        testEditedConnection: (extraHeaders: Record<string, string>) =>
          caller.aiGateway.testConnection({
            orgId: org.id,
            id: existing.id,
            provider: "OPENAI",
            credential: "sk-test",
            extraHeaders,
          }),
        createConnection: (extraHeaders: Record<string, string>) =>
          caller.aiGateway.createConnection({
            orgId: org.id,
            name: `OpenAI-${randomUUID().slice(0, 8)}`,
            provider: "OPENAI",
            credential: "sk-test",
            extraHeaders,
          }),
        updateConnection: (extraHeaders: Record<string, string>) =>
          caller.aiGateway.updateConnection({
            orgId: org.id,
            id: existing.id,
            credential: "sk-test",
            extraHeaders,
          }),
        updateConnectionHeadersOnly: (extraHeaders: Record<string, string>) =>
          caller.aiGateway.updateConnection({
            orgId: org.id,
            id: existing.id,
            extraHeaders,
          }),
      };
      const overridden = "cannot be overridden";
      const rejected: Array<{
        name: string;
        headers: Record<string, string>;
        message: string;
      }> = [
        {
          name: "credential",
          headers: { Authorization: "Bearer sk-other" },
          message: overridden,
        },
        {
          name: "API key",
          headers: { "X-Api-Key": "sk-other" },
          message: overridden,
        },
        {
          name: "destination",
          headers: { host: "attacker.example" },
          message: overridden,
        },
        {
          name: "content length",
          headers: { "content-length": "0" },
          message: overridden,
        },
        {
          name: "transfer encoding",
          headers: { "Transfer-Encoding": "chunked" },
          message: overridden,
        },
        {
          name: "proxy credential",
          headers: { "Proxy-Authorization": "Basic dXNlcjpwYXNz" },
          message: overridden,
        },
        {
          name: "name with a space",
          headers: { "x team": "research" },
          message: "Invalid header name",
        },
        {
          name: "name with a line break",
          headers: { "x-team\r\nhost": "attacker.example" },
          message: "Invalid header name",
        },
        {
          name: "value with a line break",
          headers: { "x-team": "research\r\nHost: attacker.example" },
          message: "must be printable ASCII",
        },
        {
          name: "non-ASCII value",
          headers: { "x-team": "recherche-é" },
          message: "must be printable ASCII",
        },
        {
          name: "names differing only by case",
          headers: { "X-Team": "research", "x-team": "ops" },
          message: "Duplicate header name",
        },
      ];

      const outcomes: string[] = [];
      for (const testCase of rejected) {
        for (const [route, call] of Object.entries(routes)) {
          const outcome = await call(testCase.headers).then(
            () => "OK",
            (error: { code?: string; message?: string }) =>
              error.code === "BAD_REQUEST" &&
              error.message?.includes(testCase.message)
                ? null
                : `${error.code}: ${error.message}`,
          );
          if (outcome !== null) {
            outcomes.push(`${route} ${testCase.name}: ${outcome}`);
          }
        }
      }
      expect(outcomes).toEqual([]);

      expect(SharedServer.testModelCall).not.toHaveBeenCalled();
      await expect(
        prisma.gatewayAiConnection.findMany({
          where: { organizationId: org.id },
          select: { id: true, extraHeaderKeys: true },
        }),
      ).resolves.toEqual([{ id: existing.id, extraHeaderKeys: ["x-team"] }]);
    } finally {
      Object.assign(env, { NEXT_PUBLIC_PREVIEW_PR_URL: originalPreviewPrUrl });
    }
  });

  it("names only gateway keys: all of them for managers, only their own for every other role", async () => {
    const owner = await prepare();
    const other = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const admin = await createCallerForOrganizationRole(owner, Role.ADMIN);
    const gatewayUser = await createCallerForOrganizationRole(
      owner,
      Role.AI_GATEWAY,
    );
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
    });
    const gatewayUserKey = await gatewayUser.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Gateway user key",
      metadata: {},
    });
    const serviceKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Service key",
      metadata: {},
      issuedAs: "serviceAccount",
    });
    // Plain organization keys can call the gateway but are not gateway keys.
    await createApiKey(prisma, {
      tenant: OrganizationId(owner.org.id),
      scope: OrganizationId(owner.org.id),
      role: SystemRoleId("ADMIN"),
      createdBy: UserId(owner.user.id),
    });
    await createApiKey(prisma, {
      tenant: OrganizationId(owner.org.id),
      scope: OrganizationId(owner.org.id),
      role: SystemRoleId("ADMIN"),
      createdBy: UserId(owner.user.id),
      isInAppAgentKey: true,
    });
    await other.caller.aiGateway.createApiKey({
      orgId: other.org.id,
      name: "Other org key",
      metadata: {},
    });
    const allGatewayKeyIds = [
      memberKey.id,
      gatewayUserKey.id,
      serviceKey.id,
    ].sort();

    const ownerLabels = await owner.caller.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(ownerLabels.apiKeys.map((key) => key.id).sort()).toEqual(
      allGatewayKeyIds,
    );
    const byId = new Map(ownerLabels.apiKeys.map((key) => [key.id, key]));
    expect(byId.get(memberKey.id)).toMatchObject({ name: "Member key" });
    expect(byId.get(serviceKey.id)).toMatchObject({ name: "Service key" });
    expect(ownerLabels.users.map((user) => user.name).sort()).toEqual([
      "Gateway admin",
      "Gateway ai_gateway",
      "Gateway member",
      "Gateway tester",
    ]);

    const adminLabels = await admin.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(adminLabels.apiKeys.map((key) => key.id).sort()).toEqual(
      allGatewayKeyIds,
    );

    const memberLabels = await member.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(memberLabels.apiKeys.map((key) => key.id)).toEqual([memberKey.id]);
    expect(memberLabels.users.map((user) => user.name)).toEqual([
      "Gateway member",
    ]);

    const gatewayUserLabels = await gatewayUser.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(gatewayUserLabels.apiKeys.map((key) => key.id)).toEqual([
      gatewayUserKey.id,
    ]);
    expect(gatewayUserLabels.users.map((user) => user.name)).toEqual([
      "Gateway ai_gateway",
    ]);
  });

  it("rejects analytics label requests for another organization", async () => {
    const owner = await prepare();
    const other = await prepare();
    await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
    });

    await expect(
      other.caller.aiGateway.getAnalyticsLabels({ orgId: owner.org.id }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    });
  });

  it("rejects analytics queries from another organization and from members without gateway:invoke", async () => {
    const owner = await prepare();
    const other = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    const request = {
      orgId: owner.org.id,
      query: {
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
        toTimestamp: new Date(Date.now() + 86400000).toISOString(),
        orderBy: null,
      },
    } satisfies Parameters<
      typeof owner.caller.aiGateway.executeAnalyticsQuery
    >[0];

    await expect(
      other.caller.aiGateway.executeAnalyticsQuery(request),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    });
    await expect(
      viewer.aiGateway.executeAnalyticsQuery(request),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("tests a connection model only for gateway managers of the connection's organization", async () => {
    const owner = await prepare();
    const other = await prepare();
    const connection = await owner.caller.aiGateway.createConnection({
      orgId: owner.org.id,
      name: "OpenAI-primary",
      provider: "OPENAI",
      credential: "sk-owner-only",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    const providerFetch = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 }),
    );
    const request = {
      orgId: owner.org.id,
      id: connection.id,
      model: "gpt-4.1-mini",
    };
    vi.stubGlobal("fetch", providerFetch);

    try {
      await expect(
        other.caller.aiGateway.testConnectionModel(request),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "User is not a member of this organization",
      });
      await expect(
        other.caller.aiGateway.testConnectionModel({
          ...request,
          orgId: other.org.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      for (const caller of [member, viewer]) {
        await expect(
          caller.aiGateway.testConnectionModel(request),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(providerFetch).not.toHaveBeenCalled();

      await expect(
        owner.caller.aiGateway.testConnectionModel(request),
      ).resolves.toMatchObject({ success: true });
      expect(providerFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // v2 reads events_core/events_full, which only exist on a v4 deployment.
  const itWithEventsTable =
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;

  itWithEventsTable(
    "limits gateway members' analytics to their own keys whatever the query asks for",
    async () => {
      const owner = await prepare();
      await owner.caller.aiGateway.updateConfig({
        orgId: owner.org.id,
        defaultIngestionProjectId: owner.project.id,
        ingestionMode: "USAGE",
      });
      const memberA = await createCallerForOrganizationRole(
        owner,
        Role.AI_GATEWAY,
      );
      const memberB = await createCallerForOrganizationRole(
        owner,
        Role.AI_GATEWAY,
      );
      const keyA = await memberA.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Key A",
        metadata: {},
      });
      const keyB = await memberB.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Key B",
        metadata: {},
      });
      const ownerOf = async (keyId: string) =>
        (await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } }))
          .userId!;
      const ownerIdA = await ownerOf(keyA.id);
      const ownerIdB = await ownerOf(keyB.id);

      const gatewayEvent = (keyId: string, ownerUserId: string) =>
        SharedServer.createEvent({
          project_id: owner.project.id,
          type: "GENERATION",
          start_time: Date.now() * 1000,
          service_name: AI_GATEWAY_SERVICE_NAME,
          ingestion_api_key: keyId,
          metadata_names: [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY],
          metadata_values: [ownerUserId],
        });
      await SharedServer.createEventsCh([
        gatewayEvent(keyA.id, ownerIdA),
        gatewayEvent(keyB.id, ownerIdB),
        gatewayEvent(keyB.id, ownerIdB),
      ]);

      const countByOwner = async (
        caller: typeof memberA,
        filters: QueryType["filters"] = [],
      ) => {
        const rows = await caller.aiGateway.executeAnalyticsQuery({
          orgId: owner.org.id,
          query: {
            view: "observations",
            dimensions: [{ field: "aiGatewayKeyOwnerUserId" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters,
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: [{ field: "count_count", direction: "desc" }],
            chartConfig: { type: "HORIZONTAL_BAR", row_limit: 100 },
          },
        });
        return Object.fromEntries(
          rows.map((row) => [
            String(row["aiGatewayKeyOwnerUserId"]),
            Number(row["count_count"]),
          ]),
        );
      };

      expect(await countByOwner(owner.caller)).toEqual({
        [ownerIdA]: 1,
        [ownerIdB]: 2,
      });
      expect(await countByOwner(memberA)).toEqual({ [ownerIdA]: 1 });
      expect(
        await countByOwner(memberA, [
          {
            column: "aiGatewayKeyOwnerUserId",
            operator: "any of",
            value: [ownerIdB],
            type: "stringOptions",
          },
        ]),
      ).toEqual({});
      expect(
        await countByOwner(memberA, [
          {
            column: "aiGatewayKeyId",
            operator: "any of",
            value: [keyB.id],
            type: "stringOptions",
          },
        ]),
      ).toEqual({});

      await expect(
        memberA.aiGateway.executeAnalyticsQuery({
          orgId: owner.org.id,
          query: {
            view: "traces",
            dimensions: [],
            metrics: [{ measure: "count", aggregation: "count" }],
            filters: [],
            timeDimension: null,
            fromTimestamp: new Date(Date.now() - 86400000).toISOString(),
            toTimestamp: new Date(Date.now() + 86400000).toISOString(),
            orderBy: null,
          },
        }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Gateway analytics only query observations",
      });
    },
  );

  itWithEventsTable(
    "lists keys with and without budgets by status, paging after the exceeded filter",
    async () => {
      const owner = await prepare();
      await owner.caller.aiGateway.updateConfig({
        orgId: owner.org.id,
        defaultIngestionProjectId: owner.project.id,
        ingestionMode: "USAGE",
      });
      const keys = [
        await owner.caller.aiGateway.createApiKey({
          orgId: owner.org.id,
          name: "Over budget",
          metadata: {},
        }),
        await owner.caller.aiGateway.createApiKey({
          orgId: owner.org.id,
          name: "Within budget",
          metadata: {},
        }),
      ];
      const unlimited = await owner.caller.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Unlimited",
        metadata: {},
      });
      await owner.caller.aiGateway.setSpendLimits({
        orgId: owner.org.id,
        scope: "API_KEY",
        subjects: { type: "ids", subjectIds: keys.map(({ id }) => id) },
        spendLimit: { interval: "TOTAL", limitUsd: 10 },
      });
      await SharedServer.createEventsCh([
        SharedServer.createEvent({
          project_id: owner.project.id,
          type: "GENERATION",
          start_time: (Date.now() + 1000) * 1000,
          service_name: AI_GATEWAY_SERVICE_NAME,
          ingestion_api_key: keys[0].id,
        }),
      ]);

      const list = (status: "all" | "budgeted" | "unlimited" | "exceeded") =>
        owner.caller.aiGateway.listBudgets({
          orgId: owner.org.id,
          scope: "API_KEY",
          status,
          page: 0,
          limit: 1,
        });
      expect((await list("all")).totalCount).toBe(3);
      expect((await list("budgeted")).totalCount).toBe(2);
      expect(await list("unlimited")).toMatchObject({
        totalCount: 1,
        rows: [{ subjectId: unlimited.id, spendLimit: null }],
      });
      expect(await list("exceeded")).toMatchObject({
        totalCount: 1,
        rows: [{ subjectId: keys[0].id }],
      });

      // Select-all sends the table's query instead of ids.
      await owner.caller.aiGateway.setSpendLimits({
        orgId: owner.org.id,
        scope: "API_KEY",
        subjects: { type: "matching", status: "unlimited" },
        spendLimit: { interval: "WEEKLY", limitUsd: 5 },
      });
      expect((await list("unlimited")).totalCount).toBe(0);
      expect((await list("budgeted")).totalCount).toBe(3);
    },
  );

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
    expect(
      await prisma.roleAssignment.findFirstOrThrow({
        where: { apiKeyId: created.id },
      }),
    ).toMatchObject({
      systemRole: "AI_GATEWAY_INFERENCE",
      roleId: "system/AI_GATEWAY_INFERENCE",
    });

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
        name: "Test key",
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
    ).rejects.toThrow("Gateway key not found");
  });

  it("scopes gateway API keys to their creator for members", async () => {
    const owner = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);

    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
    });
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
    });

    const memberList = await member.aiGateway.listApiKeys({
      orgId: owner.org.id,
    });
    expect(memberList.data.map(({ apiKey }) => apiKey.id)).toEqual([
      memberKey.id,
    ]);
    expect(memberList.data[0]?.apiKey.user).toMatchObject({
      name: "Gateway member",
    });

    const ownerList = await owner.caller.aiGateway.listApiKeys({
      orgId: owner.org.id,
    });
    expect(
      ownerList.data.map(({ apiKey }) => [apiKey.id, apiKey.user?.name]),
    ).toEqual(
      expect.arrayContaining([
        [ownerKey.id, "Gateway tester"],
        [memberKey.id, "Gateway member"],
      ]),
    );

    const search = async (
      caller: typeof member,
      searchQuery: string,
    ): Promise<string[]> =>
      (
        await caller.aiGateway.listApiKeys({ orgId: owner.org.id, searchQuery })
      ).data.map(({ apiKey }) => apiKey.id);
    expect(await search(owner.caller, "owner KEY")).toEqual([ownerKey.id]);
    expect(await search(owner.caller, "gateway member")).toEqual([
      memberKey.id,
    ]);
    expect(await search(owner.caller, "%")).toEqual([]);
    expect(await search(member, "owner key")).toEqual([]);

    await expect(
      member.aiGateway.revokeApiKey({ orgId: owner.org.id, id: ownerKey.id }),
    ).rejects.toThrow("Gateway key not found");
    await expect(
      member.aiGateway.revokeApiKey({ orgId: owner.org.id, id: memberKey.id }),
    ).resolves.toEqual({ success: true });

    await expect(
      viewer.aiGateway.listApiKeys({ orgId: owner.org.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      viewer.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Test key",
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets members edit metadata and models of only their own keys", async () => {
    const owner = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
    });
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: { team: "search" },
      allowedModels: ["openai:*"],
    });
    const update = {
      orgId: owner.org.id,
      name: " Search backend ",
      metadata: { environment: "production" },
      allowedModels: [" anthropic:* ", "-*opus*"],
      previousAllowedModels: ["openai:*"],
    };

    await expect(
      member.aiGateway.updateApiKey({
        ...update,
        id: ownerKey.id,
        previousAllowedModels: null,
      }),
    ).rejects.toThrow("Gateway key not found");
    await expect(
      member.aiGateway.updateApiKey({ ...update, id: memberKey.id }),
    ).resolves.toMatchObject({
      metadata: { environment: "production" },
      allowedModels: ["anthropic:*", "-*opus*"],
    });
    // A dialog still holding the patterns it loaded must not overwrite newer ones.
    await expect(
      member.aiGateway.updateApiKey({
        ...update,
        id: memberKey.id,
        allowedModels: ["openai:*"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await member.aiGateway.updateApiKey({
      ...update,
      id: memberKey.id,
      allowedModels: [],
      previousAllowedModels: ["anthropic:*", "-*opus*"],
    });

    const [edited] = (
      await member.aiGateway.listApiKeys({ orgId: owner.org.id })
    ).data;
    expect(edited).toMatchObject({
      metadata: { environment: "production" },
      allowedModels: null,
      apiKey: { note: "Search backend" },
    });
  });

  it("lets members budget their own keys and change only the budgets they set", async () => {
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
    });
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
    });
    const setBudget = (
      caller: typeof member,
      apiKeyId: string,
      limitUsd: number | null,
    ) =>
      caller.aiGateway.updateApiKey({
        orgId: owner.org.id,
        id: apiKeyId,
        name: "Key",
        metadata: {},
        allowedModels: null,
        previousAllowedModels: null,
        spendLimit: limitUsd === null ? null : { interval: "DAILY", limitUsd },
      });
    const memberKeyBudget = async () =>
      (await member.aiGateway.listApiKeys({ orgId: owner.org.id })).data.find(
        (key) => key.apiKey.id === memberKey.id,
      )?.spendLimit;

    await expect(setBudget(member, ownerKey.id, 10)).rejects.toThrow(
      "Gateway key not found",
    );
    await setBudget(member, memberKey.id, 10);
    await setBudget(member, memberKey.id, 20);
    await setBudget(owner.caller, memberKey.id, 5);
    for (const limitUsd of [1000, null]) {
      await expect(setBudget(member, memberKey.id, limitUsd)).rejects.toThrow(
        "only an admin can change it",
      );
    }
    expect(await memberKeyBudget()).toMatchObject({
      interval: "DAILY",
      limitUsd: 5,
    });

    await setBudget(owner.caller, memberKey.id, null);
    expect(await memberKeyBudget()).toBeNull();
  });

  it("sets a key's spend budget together with the key", async () => {
    const { caller, org, project } = await prepare();
    const spendLimit = { interval: "MONTHLY" as const, limitUsd: 50 };

    await expect(
      caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "Unrecorded",
        metadata: {},
        spendLimit,
      }),
    ).rejects.toThrow("Please switch to ingestion mode usage");
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      name: "Budgeted",
      metadata: {},
      spendLimit,
    });
    const listKeys = () => caller.aiGateway.listApiKeys({ orgId: org.id });
    const listLimits = async () =>
      (
        await prisma.gatewaySpendLimit.findMany({
          where: { apiKeyId: key.id },
        })
      ).map((limit) => ({ ...limit, limitUsd: limit.limitUsd.toNumber() }));
    const update = (
      budget:
        | typeof spendLimit
        | { interval: "WEEKLY"; limitUsd: number }
        | null,
    ) =>
      caller.aiGateway.updateApiKey({
        orgId: org.id,
        id: key.id,
        name: "Budgeted",
        metadata: {},
        allowedModels: null,
        previousAllowedModels: null,
        spendLimit: budget,
      });

    expect((await listKeys()).data).toMatchObject([
      { apiKey: { id: key.id }, spendLimit },
    ]);
    const [created] = await listLimits();

    await update(spendLimit);
    expect(await listLimits()).toMatchObject([
      { id: created!.id, countingStartedAt: created!.countingStartedAt },
    ]);

    await update({ interval: "WEEKLY", limitUsd: 50 });
    expect(await listLimits()).toMatchObject([
      { interval: "WEEKLY", limitUsd: 50 },
    ]);

    await update(null);
    expect(await listLimits()).toEqual([]);
    expect((await listKeys()).data).toMatchObject([{ spendLimit: null }]);
  });

  it("lets members add a budget to their own keys without one, and managers to any key", async () => {
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
    });
    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
    });
    const add = (caller: typeof member, apiKeyId: string, limitUsd: number) =>
      caller.aiGateway.createSpendLimits({
        orgId: owner.org.id,
        scope: "API_KEY",
        subjectIds: [apiKeyId],
        spendLimit: { interval: "WEEKLY", limitUsd },
      });

    await expect(add(member, ownerKey.id, 10)).rejects.toThrow(
      "Gateway key not found",
    );
    await expect(
      member.aiGateway.createSpendLimits({
        orgId: owner.org.id,
        scope: "USER",
        subjectIds: [owner.user.id],
        spendLimit: { interval: "WEEKLY", limitUsd: 10 },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await add(member, memberKey.id, 10);
    await add(owner.caller, ownerKey.id, 10);
    await expect(add(owner.caller, memberKey.id, 20)).rejects.toThrow(
      "already has a spend budget",
    );
    expect(
      (await member.aiGateway.listApiKeys({ orgId: owner.org.id })).data,
    ).toMatchObject([{ spendLimit: { interval: "WEEKLY", limitUsd: 10 } }]);
  });

  it("lets only gateway managers budget a user, and enforces it on every key of that user", async () => {
    configureGatewayJwtSigning();
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await owner.caller.aiGateway.createConnection({
      orgId: owner.org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const memberKeys = [
      await member.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Laptop",
        metadata: {},
      }),
      await member.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "CI",
        metadata: {},
        spendLimit: { interval: "DAILY", limitUsd: 5 },
      }),
    ];
    const { userId } = await prisma.apiKey.findUniqueOrThrow({
      where: { id: memberKeys[0].id },
      select: { userId: true },
    });
    const target = {
      orgId: owner.org.id,
      scope: "USER" as const,
      subjects: { type: "ids" as const, subjectIds: [userId!] },
    };
    const resolvedScopes = async (secretKey: string) =>
      (
        await authenticateRequest({
          fastHashedSecretKey: createShaHash(secretKey, env.SALT),
          apiFormat: "openai.chat-completions",
          model: "OpenAI:gpt-4o-mini",
        })
      ).spend_limits.map(({ scope, limit_usd }) => ({ scope, limit_usd }));

    await expect(
      member.aiGateway.setSpendLimits({
        ...target,
        spendLimit: { interval: "MONTHLY", limitUsd: 1000 },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.caller.aiGateway.setSpendLimits({
      ...target,
      spendLimit: { interval: "MONTHLY", limitUsd: 50 },
    });
    await owner.caller.aiGateway.setSpendLimits({
      ...target,
      spendLimit: { interval: "MONTHLY", limitUsd: 20 },
    });

    const budgets = async (caller: typeof member, scope: "API_KEY" | "USER") =>
      (
        await caller.aiGateway.listBudgets({
          orgId: owner.org.id,
          scope,
          status: "budgeted",
        })
      ).rows.map(({ subjectId, spendLimit, isEditable }) => ({
        subjectId,
        spendLimit,
        isEditable,
      }));
    expect(await budgets(owner.caller, "USER")).toEqual([
      {
        subjectId: userId,
        spendLimit: expect.objectContaining({
          interval: "MONTHLY",
          limitUsd: 20,
        }),
        isEditable: true,
      },
    ]);
    await expect(budgets(member, "USER")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      (
        await member.aiGateway.listBudgets({
          orgId: owner.org.id,
          scope: "API_KEY",
        })
      ).rows.map(({ subjectId, spendLimit, isEditable }) => ({
        subjectId,
        spendLimit,
        isEditable,
      })),
    ).toEqual(
      expect.arrayContaining([
        { subjectId: memberKeys[0].id, spendLimit: null, isEditable: true },
        {
          subjectId: memberKeys[1].id,
          spendLimit: expect.objectContaining({
            interval: "DAILY",
            limitUsd: 5,
          }),
          isEditable: true,
        },
      ]),
    );
    expect(await resolvedScopes(memberKeys[0].secretKey)).toEqual([
      { scope: "user", limit_usd: 20 },
    ]);
    expect(await resolvedScopes(memberKeys[1].secretKey)).toEqual([
      { scope: "api_key", limit_usd: 5 },
      { scope: "user", limit_usd: 20 },
    ]);
    expect(
      await prisma.auditLog.findMany({
        where: { orgId: owner.org.id, resourceType: "gatewaySpendLimit" },
        select: { action: true },
        orderBy: { createdAt: "asc" },
      }),
    ).toEqual(
      expect.arrayContaining([{ action: "create" }, { action: "update" }]),
    );

    await expect(
      member.aiGateway.setSpendLimits({ ...target, spendLimit: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.caller.aiGateway.setSpendLimits({
      ...target,
      spendLimit: null,
    });
    expect(await budgets(owner.caller, "USER")).toEqual([]);
    expect(await resolvedScopes(memberKeys[0].secretKey)).toEqual([]);
  });

  it("removes a user's budget when they leave the organization", async () => {
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Laptop",
      metadata: {},
    });
    const { userId } = await prisma.apiKey.findUniqueOrThrow({
      where: { id: memberKey.id },
      select: { userId: true },
    });
    await owner.caller.aiGateway.setSpendLimits({
      orgId: owner.org.id,
      scope: "USER",
      subjects: { type: "ids", subjectIds: [userId!] },
      spendLimit: { interval: "MONTHLY", limitUsd: 20 },
    });
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: owner.org.id, userId: userId! } },
    });

    await owner.caller.members.deleteMembership({
      orgId: owner.org.id,
      orgMembershipId: membership.id,
    });

    expect(
      await prisma.gatewaySpendLimit.count({
        where: { organizationId: owner.org.id, userId },
      }),
    ).toBe(0);
  });

  it("applies the default key and user budgets to keys and users without their own, counted per key or user", async () => {
    configureGatewayJwtSigning();
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await owner.caller.aiGateway.createConnection({
      orgId: owner.org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const laptop = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Laptop",
      metadata: {},
    });
    const ci = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "CI",
      metadata: {},
      spendLimit: { interval: "DAILY", limitUsd: 5 },
    });
    const service = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Service",
      metadata: {},
      issuedAs: "serviceAccount",
    });
    const { userId } = await prisma.apiKey.findUniqueOrThrow({
      where: { id: laptop.id },
      select: { userId: true },
    });
    const setDefault = (
      caller: typeof member,
      scope: "API_KEY" | "USER",
      spendLimit: { interval: "DAILY" | "MONTHLY"; limitUsd: number } | null,
    ) =>
      caller.aiGateway.setDefaultSpendLimit({
        orgId: owner.org.id,
        scope,
        spendLimit,
      });
    const resolved = async (secretKey: string) =>
      (
        await authenticateRequest({
          fastHashedSecretKey: createShaHash(secretKey, env.SALT),
          apiFormat: "openai.chat-completions",
          model: "OpenAI:gpt-4o-mini",
        })
      ).spend_limits.map(({ id, scope, limit_usd }) => ({
        id,
        scope,
        limit_usd,
      }));

    await expect(
      setDefault(member, "API_KEY", { interval: "MONTHLY", limitUsd: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Resolve before the defaults exist, so their cached context must be dropped.
    expect(await resolved(service.secretKey)).toEqual([]);
    await setDefault(owner.caller, "API_KEY", {
      interval: "MONTHLY",
      limitUsd: 10,
    });
    await setDefault(owner.caller, "USER", {
      interval: "MONTHLY",
      limitUsd: 30,
    });
    const defaults = await prisma.gatewaySpendLimit.findMany({
      where: { organizationId: owner.org.id, apiKeyId: null, userId: null },
    });
    const keyDefaultId = defaults.find(
      ({ scope }) => scope === "API_KEY_DEFAULT",
    )!.id;
    const userDefaultId = defaults.find(
      ({ scope }) => scope === "USER_DEFAULT",
    )!.id;

    expect(await resolved(laptop.secretKey)).toEqual([
      { id: `${keyDefaultId}:${laptop.id}`, scope: "api_key", limit_usd: 10 },
      { id: `${userDefaultId}:${userId}`, scope: "user", limit_usd: 30 },
    ]);
    expect(await resolved(ci.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 5 }),
      { id: `${userDefaultId}:${userId}`, scope: "user", limit_usd: 30 },
    ]);
    expect(await resolved(service.secretKey)).toEqual([
      { id: `${keyDefaultId}:${service.id}`, scope: "api_key", limit_usd: 10 },
    ]);
    const organizationKey = await createApiKey(prisma, {
      tenant: OrganizationId(owner.org.id),
      scope: OrganizationId(owner.org.id),
      role: SystemRoleId("ADMIN"),
      createdBy: UserId(owner.user.id),
    });
    // Not a gateway key, so the key default does not cap it.
    expect(await resolved(organizationKey.secretKey)).toEqual([]);
    expect(
      (
        await owner.caller.aiGateway.getApiKeysSpend({
          orgId: owner.org.id,
          apiKeyIds: [service.id, ci.id],
        })
      ).apiKeys.map(({ id }) => id),
    ).toEqual(expect.arrayContaining([service.id, ci.id]));

    // A key's own budget replaces the default, whatever its amount or interval.
    await member.aiGateway.setSpendLimits({
      orgId: owner.org.id,
      scope: "API_KEY",
      subjects: { type: "ids", subjectIds: [laptop.id] },
      spendLimit: { interval: "WEEKLY", limitUsd: 20 },
    });
    expect(await resolved(laptop.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 20 }),
      { id: `${userDefaultId}:${userId}`, scope: "user", limit_usd: 30 },
    ]);

    const listed = async (status: "default" | "unlimited") =>
      (
        await owner.caller.aiGateway.listBudgets({
          orgId: owner.org.id,
          scope: "API_KEY",
          status,
        })
      ).rows.map(({ subjectId, spendLimit, isDefault }) => ({
        subjectId,
        spendLimit,
        isDefault,
      }));
    expect(await listed("default")).toEqual([
      {
        subjectId: service.id,
        spendLimit: expect.objectContaining({
          interval: "MONTHLY",
          limitUsd: 10,
        }),
        isDefault: true,
      },
    ]);
    expect(await listed("unlimited")).toEqual([]);

    await setDefault(owner.caller, "API_KEY", null);
    expect(await resolved(service.secretKey)).toEqual([]);
    expect(await listed("unlimited")).toEqual([
      { subjectId: service.id, spendLimit: null, isDefault: false },
    ]);
  });

  it("applies the organization's budget to every key on top of key and user budgets", async () => {
    configureGatewayJwtSigning();
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await owner.caller.aiGateway.createConnection({
      orgId: owner.org.id,
      name: "OpenAI",
      provider: "OPENAI",
      credential: "sk-test-openai",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const laptop = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Laptop",
      metadata: {},
      spendLimit: { interval: "DAILY", limitUsd: 5 },
    });
    const service = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Service",
      metadata: {},
      issuedAs: "serviceAccount",
    });
    const resolved = async (secretKey: string) =>
      (
        await authenticateRequest({
          fastHashedSecretKey: createShaHash(secretKey, env.SALT),
          apiFormat: "openai.chat-completions",
          model: "OpenAI:gpt-4o-mini",
        })
      ).spend_limits.map(({ id, scope, interval, limit_usd }) => ({
        id,
        scope,
        interval,
        limit_usd,
      }));
    const setBudget = (
      caller: typeof member,
      spendLimit: {
        interval: "DAILY" | "WEEKLY" | "MONTHLY";
        limitUsd: number;
      } | null,
    ) =>
      caller.aiGateway.setOrganizationSpendLimit({
        orgId: owner.org.id,
        spendLimit,
      });

    await expect(
      setBudget(member, { interval: "MONTHLY", limitUsd: 5000 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Resolve first, so the budget must drop the cached context.
    expect(await resolved(service.secretKey)).toEqual([]);
    await setBudget(owner.caller, { interval: "MONTHLY", limitUsd: 5000 });
    // Organization budgets have no subject, like defaults, and share their one-per-scope index.
    await owner.caller.aiGateway.setDefaultSpendLimit({
      orgId: owner.org.id,
      scope: "API_KEY",
      spendLimit: { interval: "MONTHLY", limitUsd: 10 },
    });
    expect(
      await owner.caller.aiGateway.getOrganizationSpendLimit({
        orgId: owner.org.id,
      }),
    ).toMatchObject({
      spendLimit: {
        interval: "MONTHLY",
        limitUsd: 5000,
      },
      spentUsd: 0,
    });
    const { id } = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { organizationId: owner.org.id, scope: "ORGANIZATION" },
    });
    // One id for every key, so all of them add to the same counter.
    const organizationLimit = {
      id,
      scope: "organization",
      interval: "monthly",
      limit_usd: 5000,
    };
    expect(await resolved(laptop.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 5 }),
      organizationLimit,
    ]);
    expect(await resolved(service.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 10 }),
      organizationLimit,
    ]);

    // A new interval replaces the budget; there is only ever one.
    await setBudget(owner.caller, { interval: "DAILY", limitUsd: 250 });
    expect(await resolved(service.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 10 }),
      expect.objectContaining({
        scope: "organization",
        interval: "daily",
        limit_usd: 250,
      }),
    ]);
    await setBudget(owner.caller, null);
    expect(await resolved(service.secretKey)).toEqual([
      expect.objectContaining({ scope: "api_key", limit_usd: 10 }),
    ]);
  });

  it("rejects budget reads and changes from another organization and from callers without the gateway scope they need", async () => {
    const owner = await prepare();
    const other = await prepare();
    // Both record spend, so cross-tenant reads reach the organization filters.
    for (const { caller, org, project } of [owner, other]) {
      await caller.aiGateway.updateConfig({
        orgId: org.id,
        defaultIngestionProjectId: project.id,
        ingestionMode: "USAGE",
      });
    }
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const spendLimit = { interval: "MONTHLY" as const, limitUsd: 1 };
    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: {},
      spendLimit: { interval: "DAILY", limitUsd: 5 },
    });
    const unbudgetedKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Unbudgeted key",
      metadata: {},
    });
    await owner.caller.aiGateway.setSpendLimits({
      orgId: owner.org.id,
      scope: "USER",
      subjects: { type: "ids", subjectIds: [owner.user.id] },
      spendLimit: { interval: "MONTHLY", limitUsd: 20 },
    });
    await owner.caller.aiGateway.setDefaultSpendLimit({
      orgId: owner.org.id,
      scope: "API_KEY",
      spendLimit: { interval: "MONTHLY", limitUsd: 10 },
    });
    await owner.caller.aiGateway.setOrganizationSpendLimit({
      orgId: owner.org.id,
      spendLimit: { interval: "MONTHLY", limitUsd: 5000 },
    });
    const ownerLimits = () =>
      prisma.gatewaySpendLimit.findMany({
        where: { organizationId: owner.org.id },
        orderBy: { id: "asc" },
      });
    const limitsBefore = await ownerLimits();

    type Caller = typeof member;
    const keyIds = { type: "ids" as const, subjectIds: [ownerKey.id] };
    const userIds = { type: "ids" as const, subjectIds: [owner.user.id] };
    const matchingAll = { type: "matching" as const, status: "all" as const };
    const keyBudgetRequests = (caller: Caller, orgId: string) => [
      caller.aiGateway.getApiKeysSpend({ orgId, apiKeyIds: [ownerKey.id] }),
      caller.aiGateway.listBudgets({ orgId, scope: "API_KEY" }),
      caller.aiGateway.listMatchingBudgetSubjects({ orgId, scope: "API_KEY" }),
      caller.aiGateway.createSpendLimits({
        orgId,
        scope: "API_KEY",
        subjectIds: [unbudgetedKey.id],
        spendLimit,
      }),
      caller.aiGateway.setSpendLimits({
        orgId,
        scope: "API_KEY",
        subjects: keyIds,
        spendLimit: null,
      }),
      caller.aiGateway.setSpendLimits({
        orgId,
        scope: "API_KEY",
        subjects: matchingAll,
        spendLimit: null,
      }),
      caller.aiGateway.getDefaultSpendLimits({ orgId }),
    ];
    const managerBudgetRequests = (caller: Caller, orgId: string) => [
      caller.aiGateway.listBudgets({ orgId, scope: "USER" }),
      caller.aiGateway.listMatchingBudgetSubjects({ orgId, scope: "USER" }),
      caller.aiGateway.createSpendLimits({
        orgId,
        scope: "USER",
        subjectIds: [owner.user.id],
        spendLimit,
      }),
      caller.aiGateway.setSpendLimits({
        orgId,
        scope: "USER",
        subjects: userIds,
        spendLimit: null,
      }),
      caller.aiGateway.setSpendLimits({
        orgId,
        scope: "USER",
        subjects: matchingAll,
        spendLimit: null,
      }),
      ...(["API_KEY", "USER"] as const).map((scope) =>
        caller.aiGateway.setDefaultSpendLimit({
          orgId,
          scope,
          spendLimit: null,
        }),
      ),
      caller.aiGateway.getOrganizationSpendLimit({ orgId }),
      caller.aiGateway.setOrganizationSpendLimit({ orgId, spendLimit: null }),
    ];
    const expectAllRejected = (
      requests: Promise<unknown>[],
      error: { code: string; message?: string },
    ) =>
      Promise.all(
        requests.map((request) => expect(request).rejects.toMatchObject(error)),
      );

    await expectAllRejected(
      [
        ...keyBudgetRequests(other.caller, owner.org.id),
        ...managerBudgetRequests(other.caller, owner.org.id),
      ],
      {
        code: "UNAUTHORIZED",
        message: "User is not a member of this organization",
      },
    );
    // The scope check's own message, since the service also refuses changes to budgets a manager set.
    const missingScope = {
      code: "FORBIDDEN",
      message:
        "Forbidden, user does not have access to this resource or action",
    };
    await expectAllRejected(
      keyBudgetRequests(viewer, owner.org.id),
      missingScope,
    );
    await expectAllRejected(
      [
        ...managerBudgetRequests(viewer, owner.org.id),
        ...managerBudgetRequests(member, owner.org.id),
      ],
      missingScope,
    );

    // In their own organization, a foreign manager can neither see nor change the owner's keys and users.
    expect(
      await other.caller.aiGateway.getApiKeysSpend({
        orgId: other.org.id,
        apiKeyIds: [ownerKey.id],
      }),
    ).toEqual({ available: true, apiKeys: [] });
    await expect(
      other.caller.aiGateway.setSpendLimits({
        orgId: other.org.id,
        scope: "API_KEY",
        subjects: keyIds,
        spendLimit: null,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Gateway key not found",
    });
    await expect(
      other.caller.aiGateway.createSpendLimits({
        orgId: other.org.id,
        scope: "API_KEY",
        subjectIds: [unbudgetedKey.id],
        spendLimit,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Gateway key not found",
    });
    await expect(
      other.caller.aiGateway.setSpendLimits({
        orgId: other.org.id,
        scope: "USER",
        subjects: userIds,
        spendLimit: null,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "User not found" });

    expect(await ownerLimits()).toEqual(limitsBefore);
  });

  it("rejects key edits from another organization and from members without gateway:invoke", async () => {
    const owner = await prepare();
    const other = await prepare();
    const viewer = await createCallerForOrganizationRole(owner, Role.VIEWER);
    const ownerKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Owner key",
      metadata: { team: "search" },
      allowedModels: ["openai:*"],
    });
    const update = {
      orgId: owner.org.id,
      id: ownerKey.id,
      name: "Hijacked",
      metadata: {},
      allowedModels: [],
      previousAllowedModels: ["openai:*"],
    };

    await expect(
      other.caller.aiGateway.updateApiKey(update),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    });
    await expect(
      other.caller.aiGateway.updateApiKey({ ...update, orgId: other.org.id }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Gateway key not found",
    });
    await expect(viewer.aiGateway.updateApiKey(update)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const [unchanged] = (
      await owner.caller.aiGateway.listApiKeys({ orgId: owner.org.id })
    ).data;
    expect(unchanged).toMatchObject({
      metadata: { team: "search" },
      allowedModels: ["openai:*"],
      apiKey: { note: "Owner key" },
    });
  });

  it("lets only gateway managers issue service-account keys", async () => {
    const owner = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);

    const serviceKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Service key",
      metadata: {},
      issuedAs: "serviceAccount",
    });
    const ownerList = await owner.caller.aiGateway.listApiKeys({
      orgId: owner.org.id,
    });
    expect(
      ownerList.data.find(({ apiKey }) => apiKey.id === serviceKey.id)?.apiKey
        .user,
    ).toBeNull();

    await expect(
      member.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Service key",
        metadata: {},
        issuedAs: "serviceAccount",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await member.aiGateway.listApiKeys({ orgId: owner.org.id })).data,
    ).toEqual([]);
  });

  it("requires a name for every gateway key", async () => {
    const owner = await prepare();

    for (const issuedAs of ["user", "serviceAccount"] as const) {
      for (const name of [undefined, "   "]) {
        await expect(
          owner.caller.aiGateway.createApiKey({
            orgId: owner.org.id,
            // Deliberately invalid input to exercise server-side validation.
            name: name as string,
            metadata: {},
            issuedAs,
          }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
    }
    expect(
      (await owner.caller.aiGateway.listApiKeys({ orgId: owner.org.id })).data,
    ).toEqual([]);
  });

  it.each(["legacy", "shadow"] as const)(
    "keeps gateway API key creation admin-only when API_AUTH_MIGRATION is %s",
    async (migration) => {
      const originalMigration = env.API_AUTH_MIGRATION;
      Object.assign(env, { API_AUTH_MIGRATION: migration });
      try {
        const owner = await prepare();
        const member = await createCallerForOrganizationRole(
          owner,
          Role.MEMBER,
        );

        const admin = await createCallerForOrganizationRole(owner, Role.ADMIN);

        await expect(
          member.aiGateway.createApiKey({
            orgId: owner.org.id,
            name: "Test key",
            metadata: {},
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          owner.caller.aiGateway.createApiKey({
            orgId: owner.org.id,
            name: "Test key",
            metadata: {},
          }),
        ).resolves.toMatchObject({
          secretKey: expect.stringMatching(/^sk-lf-/),
        });
        await expect(
          admin.aiGateway.createApiKey({
            orgId: owner.org.id,
            name: "Service key",
            metadata: {},
            issuedAs: "serviceAccount",
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(
          owner.caller.aiGateway.createApiKey({
            orgId: owner.org.id,
            name: "Service key",
            metadata: {},
            issuedAs: "serviceAccount",
          }),
        ).resolves.toMatchObject({
          secretKey: expect.stringMatching(/^sk-lf-/),
        });
      } finally {
        Object.assign(env, { API_AUTH_MIGRATION: originalMigration });
      }
    },
  );

  it("rejects gateway API key expiration dates in the past", async () => {
    const { caller, org } = await prepare();

    await expect(
      caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "Test key",
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
      name: "Test key",
      metadata: {},
      issuedAs: "user",
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
    ).rejects.toThrow("Gateway key not found");
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

  it("offset-paginates gateway keys with a total count", async () => {
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
    expect(firstKeys.data.map(({ apiKey }) => apiKey.note)).toEqual([
      "Third",
      "Second",
    ]);
    expect(firstKeys.totalCount).toBe(3);
    const remainingKeys = await caller.aiGateway.listApiKeys({
      orgId: org.id,
      page: 1,
      limit: 2,
    });
    expect(remainingKeys.data.map(({ apiKey }) => apiKey.note)).toEqual([
      "First",
    ]);
    expect(remainingKeys.totalCount).toBe(3);
  });

  it("sorts gateway keys by expiration with never-expiring keys as the latest", async () => {
    const { caller, org } = await prepare();
    const day = 24 * 60 * 60 * 1000;

    for (const [name, expiresAt] of [
      ["Never", null],
      ["Later", new Date(Date.now() + 30 * day)],
      ["Sooner", new Date(Date.now() + day)],
    ] as const) {
      await caller.aiGateway.createApiKey({
        orgId: org.id,
        name,
        metadata: {},
        expiresAt,
      });
    }

    const listNames = async (order: "ASC" | "DESC") =>
      (
        await caller.aiGateway.listApiKeys({
          orgId: org.id,
          orderBy: { column: "expiresAt", order },
        })
      ).data.map(({ apiKey }) => apiKey.note);
    expect(await listNames("ASC")).toEqual(["Sooner", "Later", "Never"]);
    expect(await listNames("DESC")).toEqual(["Never", "Later", "Sooner"]);
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
      name: "Test key",
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
      extra_headers: {},
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

  it("resolves a key's spend limits with prices", async () => {
    configureGatewayJwtSigning();
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
      credential: "sk-test-openai",
    });
    const gatewayKey = await caller.aiGateway.createApiKey({
      orgId: org.id,
      name: "Limited key",
      metadata: {},
      spendLimit: { interval: "DAILY", limitUsd: 10 },
    });
    await prisma.model.create({
      data: {
        scope: "PROJECT",
        projectId: project.id,
        modelName: "gpt-spend-limit",
        matchPattern: "(?i)^(gpt-spend-limit)$",
        unit: "TOKENS",
        pricingTiers: {
          create: {
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
          },
        },
      },
    });
    const model = await prisma.model.findFirstOrThrow({
      where: { projectId: project.id, modelName: "gpt-spend-limit" },
      include: { pricingTiers: true },
    });
    await prisma.price.create({
      data: {
        modelId: model.id,
        projectId: project.id,
        pricingTierId: model.pricingTiers[0].id,
        usageType: "input",
        price: 0.000005,
      },
    });
    const limit = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { apiKeyId: gatewayKey.id },
    });
    const resolve = () =>
      authenticateRequest({
        fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
        apiFormat: "openai.chat-completions",
        model: "OpenAI:gpt-spend-limit",
      });
    const first = await resolve();
    expect(first.spend_limits).toEqual([
      {
        id: limit.id,
        scope: "api_key",
        interval: "daily",
        limit_usd: 10,
        counting_started_at: limit.countingStartedAt.getTime(),
        alert_thresholds: [100],
      },
    ]);
    expect(first.pricing).toEqual({
      model_id: model.id,
      tiers: [
        {
          id: model.pricingTiers[0].id,
          name: "Standard",
          is_default: true,
          priority: 0,
          conditions: [],
          prices: { input: 0.000005 },
        },
      ],
    });

    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    try {
      Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined });
      await caller.aiGateway.updateConfig({
        orgId: org.id,
        defaultIngestionProjectId: null,
        ingestionMode: "NONE",
      });
      const inNoneMode = await resolve();
      expect(inNoneMode.spend_limits).toEqual([]);
      expect(inNoneMode.pricing).toBeNull();
    } finally {
      Object.assign(env, {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalCloudRegion,
      });
    }
  });

  it("emails the key owner and organization owners once per limit window, listing limits reached together", async () => {
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
      spendLimit: { interval: "DAILY", limitUsd: 10 },
    });
    const daily = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { apiKeyId: memberKey.id },
    });
    // A key carries one budget; a second limit stands in for limits of several scopes reached together.
    const monthly = await new GatewaySpendLimitRepository(prisma).create({
      organizationId: owner.org.id,
      scope: { type: "API_KEY", apiKeyId: memberKey.id },
      interval: "MONTHLY",
      limitUsd: 100,
      countingStartedAt: new Date(),
      ownerUserId: daily.ownerUserId!,
    });
    const memberEmail = (
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: memberKey.id },
        select: { user: { select: { email: true } } },
      })
    ).user!.email!;
    const alerts = new GatewaySpendLimitAlertService(prisma);
    const report = (
      limits: {
        limit: { id: string };
        countingStartedAt: Date;
        windowStart: string;
      }[],
    ) =>
      alerts.reportReached({
        fastHashedSecretKey: createShaHash(memberKey.secretKey, env.SALT),
        limits: limits.map(({ limit, countingStartedAt, windowStart }) => ({
          limitId: limit.id,
          countingStartedAt,
          windowStart: new Date(windowStart),
        })),
      });
    const dailyReached = {
      limit: daily,
      countingStartedAt: daily.countingStartedAt,
      windowStart: "2026-11-16T00:00:00Z",
    };
    const monthlyReached = {
      limit: monthly,
      countingStartedAt: monthly.countingStartedAt,
      windowStart: "2026-11-01T00:00:00Z",
    };

    await report([dailyReached, monthlyReached]);
    await report([dailyReached, monthlyReached]);
    await report([{ ...dailyReached, countingStartedAt: new Date(0) }]);
    await expect(
      report([{ ...dailyReached, windowStart: "2026-11-16T15:00:00Z" }]),
    ).rejects.toMatchObject({ status: 400 });

    expect(addNotificationJobs).toHaveBeenCalledOnce();
    expect(queuedNotifications()).toEqual([
      expect.objectContaining({
        to: memberEmail,
        audience: "keyOwner",
        scope: expect.objectContaining({
          type: "API_KEY",
          name: "Member key",
        }),
        limits: [
          {
            interval: "DAILY",
            limitUsd: 10,
            resetsAt: "2026-11-17T00:00:00.000Z",
          },
          {
            interval: "MONTHLY",
            limitUsd: 100,
            resetsAt: "2026-12-01T00:00:00.000Z",
          },
        ],
      }),
      expect.objectContaining({
        to: owner.user.email,
        audience: "orgOwner",
      }),
    ]);

    await member.aiGateway.updateApiKey({
      orgId: owner.org.id,
      id: memberKey.id,
      name: "Member key",
      metadata: {},
      allowedModels: null,
      previousAllowedModels: null,
      spendLimit: { interval: "DAILY", limitUsd: 20 },
    });
    await report([dailyReached, monthlyReached]);
    expect(addNotificationJobs).toHaveBeenCalledTimes(2);
    expect(queuedNotifications().at(-1)).toMatchObject({
      limits: [{ interval: "DAILY", limitUsd: 20 }],
    });
  });

  it("emails once per key that reaches the default key budget, until the key gets its own", async () => {
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const keys = [
      await member.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "Laptop",
        metadata: {},
      }),
      await member.aiGateway.createApiKey({
        orgId: owner.org.id,
        name: "CI",
        metadata: {},
      }),
    ];
    await owner.caller.aiGateway.setDefaultSpendLimit({
      orgId: owner.org.id,
      scope: "API_KEY",
      spendLimit: { interval: "MONTHLY", limitUsd: 10 },
    });
    const keyDefault = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { organizationId: owner.org.id, scope: "API_KEY_DEFAULT" },
    });
    const alerts = new GatewaySpendLimitAlertService(prisma);
    const report = (key: (typeof keys)[number], subjectId: string) =>
      alerts.reportReached({
        fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
        limits: [
          {
            limitId: `${keyDefault.id}:${subjectId}`,
            countingStartedAt: keyDefault.countingStartedAt,
            windowStart: new Date("2026-11-01T00:00:00Z"),
          },
        ],
      });
    const keyOwnerEmails = () =>
      queuedNotifications().flatMap((payload) =>
        payload.type === "AI_GATEWAY_SPEND_LIMIT_REACHED" &&
        payload.audience === "keyOwner" &&
        payload.scope.type === "API_KEY"
          ? [payload.scope.name]
          : [],
      );

    await report(keys[0], keys[0].id);
    await report(keys[0], keys[0].id);
    // A key cannot report the default for another key.
    await report(keys[0], keys[1].id);
    await report(keys[1], keys[1].id);
    expect(keyOwnerEmails()).toEqual(["Laptop", "CI"]);

    await member.aiGateway.setSpendLimits({
      orgId: owner.org.id,
      scope: "API_KEY",
      subjects: { type: "ids", subjectIds: [keys[1].id] },
      spendLimit: { interval: "MONTHLY", limitUsd: 5 },
    });
    await prisma.gatewaySpendLimitAlert.deleteMany({
      where: { spendLimitId: keyDefault.id },
    });
    await report(keys[1], keys[1].id);
    expect(keyOwnerEmails()).toEqual(["Laptop", "CI"]);
  });

  it("persists alert thresholds, emails per enabled threshold once per window, and supports organization budget alerts", async () => {
    Object.assign(env, {
      SMTP_CONNECTION_URL: "smtp://localhost:1025",
      EMAIL_FROM_ADDRESS: "gateway@example.test",
    });
    const owner = await prepare();
    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Warned key",
      metadata: {},
      spendLimit: {
        interval: "MONTHLY",
        limitUsd: 100,
        alertThresholds: [100, 85],
      },
    });
    await owner.caller.aiGateway.setOrganizationSpendLimit({
      orgId: owner.org.id,
      spendLimit: {
        interval: "MONTHLY",
        limitUsd: 500,
        alertThresholds: [85, 95],
      },
    });

    const keyLimit = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { apiKeyId: memberKey.id },
    });
    const orgLimit = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { organizationId: owner.org.id, scope: "ORGANIZATION" },
    });
    expect(keyLimit.alertThresholds).toEqual([85, 100]);
    expect(orgLimit.alertThresholds).toEqual([85, 95]);

    const alerts = new GatewaySpendLimitAlertService(prisma);
    const windowStart = new Date("2026-11-01T00:00:00Z");
    const report = (
      entries: {
        limit: { id: string; countingStartedAt: Date };
        thresholdPercent: 85 | 95 | 100;
      }[],
    ) =>
      alerts.reportReached({
        fastHashedSecretKey: createShaHash(memberKey.secretKey, env.SALT),
        limits: entries.map(({ limit, thresholdPercent }) => ({
          limitId: limit.id,
          countingStartedAt: limit.countingStartedAt,
          windowStart,
          thresholdPercent,
        })),
      });

    // Unconfigured 95% on key and 100% on org are ignored; configured 85% on both send once.
    await report([
      { limit: keyLimit, thresholdPercent: 85 },
      { limit: keyLimit, thresholdPercent: 95 },
      { limit: orgLimit, thresholdPercent: 85 },
      { limit: orgLimit, thresholdPercent: 100 },
    ]);
    await report([{ limit: keyLimit, thresholdPercent: 85 }]);

    expect(queuedNotifications()).toEqual([
      expect.objectContaining({
        type: "AI_GATEWAY_SPEND_LIMIT_ALERT",
        audience: "keyOwner",
        scope: expect.objectContaining({ type: "API_KEY", name: "Warned key" }),
        limits: [
          expect.objectContaining({
            interval: "MONTHLY",
            limitUsd: 100,
            thresholdPercent: 85,
          }),
        ],
      }),
      expect.objectContaining({
        type: "AI_GATEWAY_SPEND_LIMIT_ALERT",
        to: owner.user.email,
        audience: "orgOwner",
        scope: expect.objectContaining({ type: "API_KEY", name: "Warned key" }),
        limits: [expect.objectContaining({ thresholdPercent: 85 })],
      }),
      expect.objectContaining({
        type: "AI_GATEWAY_SPEND_LIMIT_ALERT",
        to: owner.user.email,
        audience: "orgOwner",
        scope: { type: "ORGANIZATION" },
        limits: [
          expect.objectContaining({
            interval: "MONTHLY",
            limitUsd: 500,
            thresholdPercent: 85,
          }),
        ],
      }),
    ]);

    // Adding 95% without changing limitUsd preserves the already-sent 85% alert.
    await member.aiGateway.updateApiKey({
      orgId: owner.org.id,
      id: memberKey.id,
      name: "Warned key",
      metadata: {},
      allowedModels: null,
      previousAllowedModels: null,
      spendLimit: {
        interval: "MONTHLY",
        limitUsd: 100,
        alertThresholds: [85, 95, 100],
      },
    });
    const before = queuedNotifications().length;
    await report([
      { limit: keyLimit, thresholdPercent: 85 },
      { limit: keyLimit, thresholdPercent: 95 },
    ]);
    const added = queuedNotifications().slice(before);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({
      type: "AI_GATEWAY_SPEND_LIMIT_ALERT",
      limits: [expect.objectContaining({ thresholdPercent: 95 })],
    });

    // Omitting alertThresholds on an update (e.g. an older client bundle) keeps stored thresholds.
    await member.aiGateway.updateApiKey({
      orgId: owner.org.id,
      id: memberKey.id,
      name: "Warned key",
      metadata: {},
      allowedModels: null,
      previousAllowedModels: null,
      spendLimit: {
        interval: "MONTHLY",
        limitUsd: 150,
      },
    });
    const updatedKeyLimit = await prisma.gatewaySpendLimit.findFirstOrThrow({
      where: { apiKeyId: memberKey.id },
    });
    expect(updatedKeyLimit.alertThresholds).toEqual([85, 95, 100]);
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
      name: "Test key",
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
      name: "Test key",
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
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    await expect(
      new GatewayModelsService(prisma, null).list({
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

  it("enforces key model patterns and keeps them through a connection rename", async () => {
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
      name: "Restricted key",
      metadata: {},
      allowedModels: ["OpenAI:gpt-4o*", "-*mini"],
    });
    const request = {
      fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
      apiFormat: "openai.responses" as const,
    };

    await expect(
      authenticateRequest({ ...request, model: "OpenAI:gpt-4o" }),
    ).resolves.toMatchObject({ connection: { id: connection.id } });
    await expect(
      authenticateRequest({ ...request, model: "OpenAI:gpt-4o-mini" }),
    ).rejects.toMatchObject({ status: 403, code: "model_not_allowed" });

    await caller.aiGateway.updateConnection({
      orgId: org.id,
      id: connection.id,
      name: "OpenAI-EU",
    });

    await expect(
      prisma.gatewayApiKeyAssociation.findUnique({
        where: { apiKeyId: gatewayKey.id },
        select: { allowedModels: true },
      }),
    ).resolves.toEqual({ allowedModels: ["OpenAI-EU:gpt-4o*", "-*mini"] });
    await expect(
      authenticateRequest({ ...request, model: "OpenAI-EU:gpt-4o" }),
    ).resolves.toMatchObject({ connection: { id: connection.id } });
    await expect(
      authenticateRequest({ ...request, model: "OpenAI-EU:gpt-4o-mini" }),
    ).rejects.toMatchObject({ status: 403, code: "model_not_allowed" });
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

  it("recovers a Bedrock connection whose key may call but not list models", async () => {
    const { caller, org, session } = await prepare();
    const created = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Bedrock",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    await prisma.gatewayAiConnection.update({
      where: { id: created.id },
      data: {
        provider: "BEDROCK",
        config: { region: "eu-central-1" },
        encryptedCredential: encrypt(encodeBedrockCredential("bedrock-key")),
        status: "ERROR",
        customModels: [{ id: "eu.anthropic.claude-opus-4-7" }],
      },
    });
    const deniedFetch = vi.fn<typeof fetch>(
      async (input) =>
        new Response(
          JSON.stringify({
            message: `User: arn:aws:iam::123456789012:user/gateway is not authorized to perform: ${
              new URL(String(input)).pathname === "/foundation-models"
                ? "bedrock:ListFoundationModels"
                : "bedrock:ListInferenceProfiles"
            }`,
          }),
          {
            status: 403,
            headers: {
              "x-amzn-ErrorType": "AccessDeniedException:http://aws/",
            },
          },
        ),
    );

    vi.mocked(getGatewayFetch).mockReturnValue(deniedFetch);
    const result = await new GatewayModelCatalogService(prisma).retryConnection(
      {
        organizationId: org.id,
        connectionId: created.id,
        session,
      },
    );

    expect(result).toEqual({
      connectionId: created.id,
      success: true,
      models: ["eu.anthropic.claude-opus-4-7"],
      modelListingDenied: true,
    });
    expect(
      await prisma.gatewayAiConnection.findUnique({
        where: { id: created.id },
        select: { status: true },
      }),
    ).toEqual({ status: "ENABLED" });
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
    vi.mocked(getGatewayFetch).mockReturnValue(unauthorizedFetch);
    const unauthorized = new GatewayModelCatalogService(prisma);
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
    ).rejects.toThrow("new API key or a successful retry");
    const automaticRefresh = vi.fn<typeof fetch>();
    vi.mocked(getGatewayFetch).mockReturnValue(automaticRefresh);
    await new GatewayModelCatalogService(prisma).refreshAllModels(org.id);
    expect(automaticRefresh).not.toHaveBeenCalled();

    const failingFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.mocked(getGatewayFetch).mockReturnValue(failingFetch);
    const failedRetry = await new GatewayModelCatalogService(
      prisma,
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
    vi.mocked(getGatewayFetch).mockReturnValue(successfulFetch);
    await new GatewayModelCatalogService(prisma).retryConnection({
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

    vi.mocked(getGatewayFetch).mockReturnValue(unauthorizedFetch);
    await new GatewayModelCatalogService(prisma).refreshModels({
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
      name: "Test key",
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
        name: "Test key",
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

  it("denies a user key once its user's role no longer grants gateway:invoke", async () => {
    const originalCache = env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED;
    Object.assign(env, { LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "false" });
    try {
      const { caller, org, user } = await prepare();
      const gatewayKey = await caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "User key",
        metadata: {},
      });
      await expect(
        prisma.apiKey.findUnique({ where: { id: gatewayKey.id } }),
      ).resolves.toMatchObject({ scope: "USER", userId: user.id });
      const authenticator = new GatewayApiKeyAuthenticator(prisma);
      const request = {
        fastHashedSecretKey: createShaHash(gatewayKey.secretKey, env.SALT),
        apiFormat: "openai.responses" as const,
      };

      await expect(
        authenticator.authenticateModelsRequest(request),
      ).resolves.toMatchObject({ organizationId: org.id });

      await updateOrgMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        role: Role.VIEWER,
      });
      await expect(
        authenticator.authenticateModelsRequest(request),
      ).rejects.toMatchObject({
        status: 403,
        message: "API key is not allowed to invoke the gateway",
      });
    } finally {
      Object.assign(env, {
        LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: originalCache,
      });
    }
  });

  describe("key owner role", () => {
    const authenticateKey = (secretKey: string) =>
      new GatewayApiKeyAuthenticator(prisma).authenticateModelsRequest({
        fastHashedSecretKey: createShaHash(secretKey, env.SALT),
        apiFormat: "openai.responses",
      });
    // Changes the owner's org role without evicting the gateway resolve cache.
    const setOwnerRole = async (
      orgId: string,
      userId: string,
      role: Role | null,
    ) => {
      if (!role) {
        await deleteOrgMembership(prisma, { orgId, userId });
        return;
      }
      await updateOrgMembership(prisma, { orgId, userId, role });
    };
    const keyNotAllowed = {
      status: 403,
      message: "API key is not allowed to invoke the gateway",
    };

    it.each([
      { change: "demoted to VIEWER", role: Role.VIEWER },
      { change: "demoted to NONE", role: Role.NONE },
      { change: "removed from the organization", role: null },
    ])(
      "rejects user-bound keys whose owner was $change out of band",
      async ({ role }) => {
        const { caller, org, user } = await prepare();
        const key = await caller.aiGateway.createApiKey({
          orgId: org.id,
          name: "User key",
          metadata: {},
        });
        await setOwnerRole(org.id, user.id, role);
        const lookup = vi.spyOn(prisma.apiKey, "findFirst");

        for (let attempt = 0; attempt < 2; attempt++) {
          await expect(authenticateKey(key.secretKey)).rejects.toMatchObject(
            keyNotAllowed,
          );
        }
        // A rejection is not cached, so restoring access applies at once.
        expect(lookup).toHaveBeenCalledTimes(2);
        lookup.mockRestore();
      },
    );

    it.each([Role.AI_GATEWAY, Role.MEMBER])(
      "accepts user-bound keys whose owner is %s",
      async (role) => {
        const { caller, org, user } = await prepare();
        const key = await caller.aiGateway.createApiKey({
          orgId: org.id,
          name: "User key",
          metadata: {},
        });
        await setOwnerRole(org.id, user.id, role);

        await expect(authenticateKey(key.secretKey)).resolves.toMatchObject({
          apiKeyId: key.id,
          userId: user.id,
        });
      },
    );

    it("accepts service-account keys regardless of the creator's role", async () => {
      const { caller, org, user } = await prepare();
      const key = await caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "Service key",
        metadata: {},
        issuedAs: "serviceAccount",
      });
      await setOwnerRole(org.id, user.id, Role.NONE);

      await expect(authenticateKey(key.secretKey)).resolves.toMatchObject({
        apiKeyId: key.id,
        userId: null,
      });
    });

    it("serves an out-of-band demotion from cache until the entry expires", async () => {
      const { caller, org, user } = await prepare();
      const key = await caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "User key",
        metadata: {},
      });
      const fastHashedSecretKey = createShaHash(key.secretKey, env.SALT);
      await expect(authenticateKey(key.secretKey)).resolves.toMatchObject({
        apiKeyId: key.id,
      });
      await setOwnerRole(org.id, user.id, Role.VIEWER);

      // The resolve cache TTL bounds how long the cached grant survives.
      await expect(authenticateKey(key.secretKey)).resolves.toMatchObject({
        apiKeyId: key.id,
      });
      await invalidateGatewayResolveCacheForApiKey(fastHashedSecretKey);
      await expect(authenticateKey(key.secretKey)).rejects.toMatchObject(
        keyNotAllowed,
      );
    });

    it("rejects a cached user-bound key as soon as members.updateOrgMembership demotes its owner", async () => {
      expect(env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED).toBe("true");
      const { caller, org, user } = await prepare();
      const key = await caller.aiGateway.createApiKey({
        orgId: org.id,
        name: "User key",
        metadata: {},
      });
      await expect(authenticateKey(key.secretKey)).resolves.toMatchObject({
        apiKeyId: key.id,
      });
      const otherOwner = await prisma.user.create({
        data: { email: `gateway-owner-${randomUUID()}@example.test` },
      });
      cleanupUsers.push(otherOwner.id);
      await createOrgMembership(prisma, {
        orgId: org.id,
        userId: otherOwner.id,
        role: Role.OWNER,
      });
      const membership = await prisma.organizationMembership.findUniqueOrThrow({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
      });

      await caller.members.updateOrgMembership({
        orgId: org.id,
        orgMembershipId: membership.id,
        role: Role.VIEWER,
      });

      await expect(authenticateKey(key.secretKey)).rejects.toMatchObject(
        keyNotAllowed,
      );
    });
  });

  it("accepts organization keys granted gateway:invoke without a gateway association", async () => {
    const originalCache = env.LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED;
    Object.assign(env, { LANGFUSE_AI_GATEWAY_CACHE_RESOLVE_ENABLED: "false" });
    try {
      const { org, user } = await prepare();
      const adminKey = await createApiKey(prisma, {
        tenant: OrganizationId(org.id),
        scope: OrganizationId(org.id),
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

  it("turns the gateway off when its ingestion project is deleted, so the organization can be deleted", async () => {
    const setup = await prepare();
    const { caller, org, project } = setup;
    await caller.aiGateway.updateConfig({
      orgId: org.id,
      defaultIngestionProjectId: project.id,
      ingestionMode: "USAGE",
    });
    const projectOwnerWithoutGatewayManage =
      await createCallerForOrganizationRole(setup, Role.MEMBER, Role.OWNER);
    await expect(
      projectOwnerWithoutGatewayManage.projects.delete({
        projectId: project.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      caller.projects.deletionProtection({ projectId: project.id }),
    ).resolves.toEqual({ isGatewayIngestionProject: true });
    await expect(
      caller.projects.delete({ projectId: project.id }),
    ).resolves.toBe(true);
    await expect(
      caller.aiGateway.getSetupStatus({ orgId: org.id }),
    ).resolves.toEqual({ isConfigured: false, isRecording: false });
    await expect(
      prisma.gatewayConfig.findUnique({ where: { organizationId: org.id } }),
    ).resolves.toMatchObject({ defaultIngestionProjectId: null });
    // The org audit log only lists entries without a project.
    await expect(
      prisma.auditLog.findFirst({
        where: {
          orgId: org.id,
          resourceType: "gatewayConfig",
          action: "update",
        },
        select: { projectId: true },
        orderBy: { createdAt: "desc" },
      }),
    ).resolves.toEqual({ projectId: null });

    // The project delete worker hard-deletes soft-deleted projects.
    await prisma.project.delete({ where: { id: project.id } });
    isCloudBillingEnabled.mockReturnValueOnce(false);
    await expect(caller.organizations.delete({ orgId: org.id })).resolves.toBe(
      true,
    );
  });

  it("allows deleting the linked ingestion project while ingestion is NONE on self-hosted", async () => {
    const { caller, org, project } = await prepare();
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    try {
      Object.assign(env, { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined });
      await caller.aiGateway.updateConfig({
        orgId: org.id,
        defaultIngestionProjectId: project.id,
        ingestionMode: "NONE",
      });

      await expect(
        caller.projects.deletionProtection({ projectId: project.id }),
      ).resolves.toEqual({ isGatewayIngestionProject: false });
      await expect(
        caller.projects.delete({ projectId: project.id }),
      ).resolves.toBe(true);
    } finally {
      Object.assign(env, {
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: originalCloudRegion,
      });
    }
    await expect(
      prisma.project.findUnique({ where: { id: project.id } }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date) });
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
      name: "Test key",
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
      name: "Test key",
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
              shutdown_date: "9999-12-31",
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

    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const service = new GatewayModelsService(prisma, null);
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
          id: "OpenAI-backup:codex-auto-review",
          provider: "OPENAI",
          canonicalSlug: "codex-auto-review",
          displayName: "codex-auto-review",
          createdAt: "1970-01-01T00:00:00.000Z",
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
          id: "OpenAI-primary:codex-auto-review",
          provider: "OPENAI",
          canonicalSlug: "codex-auto-review",
          displayName: "codex-auto-review",
          createdAt: "1970-01-01T00:00:00.000Z",
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

  it("lists Vercel language and decision models in the public response shape", async () => {
    const { caller, org } = await prepare();
    const created = await caller.aiGateway.createConnection({
      orgId: org.id,
      name: "Vercel",
      provider: "OPENAI",
      credential: "sk-openai",
    });
    await prisma.gatewayAiConnection.update({
      where: { id: created.id },
      data: { provider: "VERCEL", encryptedCredential: encrypt("vck-test") },
    });
    const key = await caller.aiGateway.createApiKey({
      orgId: org.id,
      name: "Test key",
      metadata: {},
    });
    const model = (id: string, type: string) => ({
      id,
      name: id,
      type,
      released: 10,
    });
    vi.mocked(getGatewayFetch).mockReturnValue(
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          data: [
            model("anthropic/claude-sonnet-5", "language"),
            model("openai/gpt-6-luna-decisions", "decision"),
          ],
        }),
      ),
    );
    const context = await new GatewayApiKeyAuthenticator(
      prisma,
    ).authenticateModelsRequest({
      fastHashedSecretKey: createShaHash(key.secretKey, env.SALT),
      apiFormat: "openai.responses",
    });

    const listed = await new GatewayModelsService(prisma, null).list({
      context,
      apiFormat: "openai.responses",
    });

    expect(GatewayModelsResponseSchema.parse(listed)).toEqual({
      data: [
        {
          id: "Vercel:anthropic/claude-sonnet-5",
          provider: "OPENAI",
          canonicalSlug: "anthropic/claude-sonnet-5",
          displayName: "anthropic/claude-sonnet-5",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
        {
          id: "Vercel:openai/gpt-6-luna-decisions",
          provider: "OPENAI",
          canonicalSlug: "openai/gpt-6-luna-decisions",
          displayName: "openai/gpt-6-luna-decisions",
          createdAt: "1970-01-01T00:00:10.000Z",
        },
      ],
    });
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
      name: "Test key",
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
    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    await expect(
      new GatewayModelsService(prisma, null).list({
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
        {
          id: "OpenAI-fallback:codex-auto-review",
          provider: "OPENAI",
          canonicalSlug: "codex-auto-review",
          displayName: "codex-auto-review",
          createdAt: "1970-01-01T00:00:00.000Z",
        },
      ],
    });

    const unavailableFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.mocked(getGatewayFetch).mockReturnValue(unavailableFetcher);
    await expect(
      new GatewayModelsService(prisma, null).list({
        context,
        apiFormat: "openai.chat-completions",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GatewayResolveError>>({ status: 503 }),
    );
  });
});
