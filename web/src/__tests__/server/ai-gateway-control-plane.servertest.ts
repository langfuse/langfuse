import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";

import type { Session } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as SharedServer from "@langfuse/shared/src/server";
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

function queuedNotifications(): SharedServer.NotificationEventType[] {
  return addNotificationJobs.mock.calls.flatMap(([jobs]) =>
    jobs.map((job) => job.data.payload),
  );
}

import { env } from "@/src/env.mjs";
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
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import { GatewayConfigService } from "@/src/features/ai-gateway/server/config/gatewayConfigService";
import { getGatewaySetupRedirect } from "@/src/features/ai-gateway/server/gatewaySetupRedirect";
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
    ).resolves.toEqual({ isConfigured: false });
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
    ).resolves.toEqual({ isConfigured: true });

    await prisma.project.update({
      where: { id: owner.project.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      viewer.aiGateway.getSetupStatus({ orgId: owner.org.id }),
    ).resolves.toEqual({ isConfigured: false });
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
    });
    await expect(
      viewer.aiGateway.getClientSetup({ orgId: owner.org.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redirects gateway managers to Setup until ingestion is set up", async () => {
    const owner = await prepare();
    const memberSession = {
      ...owner.session,
      user: {
        ...owner.session.user,
        organizations: owner.session.user.organizations.map((org) => ({
          ...org,
          role: Role.MEMBER,
        })),
      },
    };
    const redirectFor = (session: Session, slug: string) =>
      getGatewaySetupRedirect({
        prisma,
        session,
        organizationId: owner.org.id,
        slug,
      });
    const setupPath = `/organization/${owner.org.id}/settings/ai-gateway`;

    await expect(
      redirectFor(owner.session, "ai-gateway-api-keys"),
    ).resolves.toBe(setupPath);
    await expect(redirectFor(owner.session, "ai-gateway")).resolves.toBeNull();
    await expect(
      redirectFor(memberSession, "ai-gateway-models"),
    ).resolves.toBeNull();

    await owner.caller.aiGateway.updateConfig({
      orgId: owner.org.id,
      defaultIngestionProjectId: owner.project.id,
      ingestionMode: "USAGE",
    });
    await expect(
      redirectFor(owner.session, "ai-gateway-api-keys"),
    ).resolves.toBeNull();
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
      ).resolves.toEqual({ isConfigured: true });
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
      ).resolves.toEqual({ isConfigured: false });

      await prisma.gatewayConfig.update({
        where: { organizationId: org.id },
        data: { defaultIngestionProjectId: project.id },
      });
      await expect(
        caller.projects.deletionProtection({ projectId: project.id }),
      ).resolves.toEqual({ isGatewayIngestionProject: true });
      await expect(
        caller.projects.delete({ projectId: project.id }),
      ).rejects.toThrow("Select another ingestion project before deleting it");
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

  it("names organization keys and members for managers, plain organization keys only for key admins", async () => {
    const owner = await prepare();
    const other = await prepare();
    const member = await createCallerForOrganizationRole(owner, Role.MEMBER);
    const admin = await createCallerForOrganizationRole(owner, Role.ADMIN);
    const memberKey = await member.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Member key",
      metadata: {},
    });
    const serviceKey = await owner.caller.aiGateway.createApiKey({
      orgId: owner.org.id,
      name: "Service key",
      metadata: {},
      issuedAs: "serviceAccount",
    });
    const plainOrgKey = await createApiKey(prisma, {
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

    const ownerLabels = await owner.caller.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(ownerLabels.apiKeys.map((key) => key.id).sort()).toEqual(
      [memberKey.id, serviceKey.id, plainOrgKey.id].sort(),
    );
    const byId = new Map(ownerLabels.apiKeys.map((key) => [key.id, key]));
    expect(byId.get(memberKey.id)).toMatchObject({ name: "Member key" });
    expect(byId.get(serviceKey.id)).toMatchObject({ name: "Service key" });
    expect(ownerLabels.users.map((user) => user.name).sort()).toEqual([
      "Gateway admin",
      "Gateway member",
      "Gateway tester",
    ]);

    // An admin manages the gateway but cannot list organization API keys.
    const adminLabels = await admin.aiGateway.getAnalyticsLabels({
      orgId: owner.org.id,
    });
    expect(adminLabels.apiKeys.map((key) => key.id).sort()).toEqual(
      [memberKey.id, serviceKey.id].sort(),
    );

    await expect(
      member.aiGateway.getAnalyticsLabels({ orgId: owner.org.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    expect(firstKeys.data).toHaveLength(2);
    expect(firstKeys.totalCount).toBe(3);
    const remainingKeys = await caller.aiGateway.listApiKeys({
      orgId: org.id,
      page: 1,
      limit: 2,
    });
    expect(remainingKeys.data).toHaveLength(1);
    expect(remainingKeys.totalCount).toBe(3);
    expect(
      new Set(
        [...firstKeys.data, ...remainingKeys.data].map(
          ({ apiKey }) => apiKey.note,
        ),
      ),
    ).toEqual(new Set(["First", "Second", "Third"]));
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
    ).rejects.toThrow("credential update or a successful retry");
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

  describe("key owner role", () => {
    const authenticateKey = (secretKey: string) =>
      new GatewayApiKeyAuthenticator(prisma).authenticateModelsRequest({
        fastHashedSecretKey: createShaHash(secretKey, env.SALT),
        apiFormat: "openai.responses",
      });
    const setOwnerRole = (orgId: string, userId: string, role: Role | null) =>
      role
        ? prisma.organizationMembership.update({
            where: { orgId_userId: { orgId, userId } },
            data: { role },
          })
        : prisma.organizationMembership.delete({
            where: { orgId_userId: { orgId, userId } },
          });
    const ownerNotAllowed = {
      status: 403,
      message: "API key owner is not allowed to invoke the gateway",
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
            ownerNotAllowed,
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
        ownerNotAllowed,
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
    ).rejects.toThrow("Select another ingestion project");
    await expect(
      prisma.project.findUnique({ where: { id: project.id } }),
    ).resolves.toMatchObject({ deletedAt: null });
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
