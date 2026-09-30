import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  BaseError,
  CloudConfigSchema,
  ForbiddenError,
  LangfuseConflictError,
  LangfuseNotFoundError,
  projectRoleAccessRights,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  redis,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { isInAppAgentInstanceEnabled } from "@langfuse/shared/in-app-agent/server/modelProvider";
import { env } from "@/src/env.mjs";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  getOrganizationPlanServerSide,
  hasEntitlementBasedOnPlan,
} from "@/src/features/entitlements/server";
import {
  cancelExternalAgentRun,
  getExternalAgentRun,
  startExternalAgentRun,
} from "@/src/features/in-app-agent/server/publicAgentService";
import { assertInAppAgentRateLimit } from "@/src/features/in-app-agent/server/rateLimit";

const CODE_TTL_SECONDS = 5 * 60;
const CONNECTION_TTL_SECONDS = 10 * 60;
const SlackIdentity = z.object({
  teamId: z.string().regex(/^T[A-Z0-9]+$/),
  slackUserId: z.string().regex(/^[UW][A-Z0-9]+$/),
});
const RunIdentity = SlackIdentity.extend({
  projectId: z.string().min(1).max(200),
  linkId: z.string().min(1).max(200),
});

export const SlackAgentRequest = z.discriminatedUnion("operation", [
  SlackIdentity.extend({
    operation: z.literal("connect"),
    code: z.string().regex(/^[a-f0-9]{32}$/),
  }).strict(),
  SlackIdentity.extend({ operation: z.literal("projects") }).strict(),
  SlackIdentity.extend({ operation: z.literal("connection") }).strict(),
  RunIdentity.extend({
    operation: z.literal("start"),
    message: z.string().trim().min(1).max(32_000),
    idempotencyKey: z.string().min(1).max(200),
    conversationId: z.string().min(1).max(300).optional(),
  }).strict(),
  RunIdentity.extend({
    operation: z.literal("get"),
    runId: z.string().min(1).max(300),
  }).strict(),
  RunIdentity.extend({
    operation: z.literal("cancel"),
    runId: z.string().min(1).max(300),
  }).strict(),
]);

function configuredTeam() {
  if (!env.LANGFUSE_SLACK_TEAM_ID || !env.LANGFUSE_SLACK_AGENT_SECRET) {
    throw new LangfuseNotFoundError("Slack agent is not configured");
  }
  return env.LANGFUSE_SLACK_TEAM_ID;
}

export async function getSlackAgentStatus(userId: string) {
  const enabled = Boolean(
    env.LANGFUSE_SLACK_TEAM_ID && env.LANGFUSE_SLACK_AGENT_SECRET,
  );
  if (!enabled) {
    return { enabled: false, teamId: null, links: [] };
  }
  const links = await prisma.slackAgentUserLink.findMany({
    where: { userId, teamId: env.LANGFUSE_SLACK_TEAM_ID ?? "" },
    select: { id: true, slackUserId: true },
  });
  return { enabled, teamId: env.LANGFUSE_SLACK_TEAM_ID ?? null, links };
}

export async function createSlackAgentCode(userId: string) {
  const teamId = configuredTeam();
  if (!redis) {
    throw new BaseError(
      "ServiceUnavailableError",
      503,
      "Connection codes are temporarily unavailable",
      true,
    );
  }
  const code = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(code).digest("hex");
  const latestKey = `slack-agent:latest:${teamId}:${userId}`;
  const previous = await redis.get(latestKey);
  await redis.set(
    `slack-agent:code:${digest}`,
    JSON.stringify({ userId, teamId }),
    "EX",
    CODE_TTL_SECONDS,
  );
  await redis.set(latestKey, digest, "EX", CODE_TTL_SECONDS);
  if (previous) {
    await redis.del(`slack-agent:code:${previous}`);
  }
  return {
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1_000).toISOString(),
  };
}

const PendingConnection = SlackIdentity.extend({
  expiresAt: z.iso.datetime(),
});

function connectionStore() {
  if (!redis) {
    throw new BaseError(
      "ServiceUnavailableError",
      503,
      "Account connections are temporarily unavailable",
      true,
    );
  }
  return redis;
}

function connectionLatestKey(identity: z.infer<typeof SlackIdentity>) {
  return `slack-agent:connection-latest:${identity.teamId}:${identity.slackUserId}`;
}

async function createConnection(identity: z.infer<typeof SlackIdentity>) {
  const store = connectionStore();
  const token = randomBytes(32).toString("hex");
  const digest = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(
    Date.now() + CONNECTION_TTL_SECONDS * 1_000,
  ).toISOString();
  await store.eval(
    `local previous = redis.call('GET', KEYS[1])
     if previous then redis.call('DEL', ARGV[1] .. previous) end
     redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
     redis.call('SET', KEYS[1], ARGV[4], 'EX', ARGV[3])
     return 1`,
    2,
    connectionLatestKey(identity),
    `slack-agent:connection:${digest}`,
    "slack-agent:connection:",
    JSON.stringify({ ...identity, expiresAt }),
    CONNECTION_TTL_SECONDS,
    digest,
  );
  const linkUrl = new URL("slack-agent", getProductBaseUrl());
  linkUrl.searchParams.set("token", token);
  return { linkUrl: linkUrl.toString(), expiresAt };
}

export async function inspectSlackAgentConnection(token: string) {
  const teamId = configuredTeam();
  const store = connectionStore();
  const digest = createHash("sha256").update(token).digest("hex");
  const stored = await store.get(`slack-agent:connection:${digest}`);
  const pending = stored ? PendingConnection.parse(JSON.parse(stored)) : null;
  if (
    !pending ||
    pending.teamId !== teamId ||
    new Date(pending.expiresAt).getTime() <= Date.now() ||
    (await store.get(connectionLatestKey(pending))) !== digest
  ) {
    throw new LangfuseNotFoundError(
      "This connection link is invalid or expired. Ask Halo for a new link.",
    );
  }
  return pending;
}

export async function confirmSlackAgentConnection(params: {
  token: string;
  userId: string;
}) {
  const pending = await inspectSlackAgentConnection(params.token);
  const store = connectionStore();
  const digest = createHash("sha256").update(params.token).digest("hex");
  const consumed = await store.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] and redis.call('EXISTS', KEYS[2]) == 1 then
       redis.call('DEL', KEYS[1], KEYS[2])
       return 1
     end
     return 0`,
    2,
    connectionLatestKey(pending),
    `slack-agent:connection:${digest}`,
    digest,
  );
  if (consumed !== 1) {
    throw new ForbiddenError("This connection link is invalid or expired");
  }
  await linkAccount(
    { teamId: pending.teamId, slackUserId: pending.slackUserId },
    params.userId,
  );
  return { success: true };
}

export async function disconnectSlackAgent(userId: string, linkId: string) {
  const link = await prisma.slackAgentUserLink.findFirst({
    where: { id: linkId, userId },
    select: { id: true, teamId: true, slackUserId: true },
  });
  if (!link) {
    throw new LangfuseNotFoundError("Slack connection not found");
  }
  if (redis) {
    const connectionDigest = await redis.getdel(connectionLatestKey(link));
    if (connectionDigest) {
      await redis.del(`slack-agent:connection:${connectionDigest}`);
    }
    const digest = await redis.getdel(
      `slack-agent:latest:${link.teamId}:${userId}`,
    );
    if (digest) {
      await redis.del(`slack-agent:code:${digest}`);
    }
  }
  await prisma.slackAgentUserLink.deleteMany({
    where: { id: link.id, userId },
  });
  logger.info("Slack agent account disconnected", { userId, linkId });
  return { success: true };
}

async function connectAccount(
  input: z.infer<typeof SlackIdentity> & { code: string },
) {
  if (!redis) {
    throw new BaseError(
      "ServiceUnavailableError",
      503,
      "Connection codes are temporarily unavailable",
      true,
    );
  }
  const digest = createHash("sha256").update(input.code).digest("hex");
  const stored = await redis.getdel(`slack-agent:code:${digest}`);
  const pending = stored
    ? z
        .object({ userId: z.string(), teamId: z.string() })
        .parse(JSON.parse(stored))
    : null;
  if (!pending || pending.teamId !== input.teamId) {
    throw new ForbiddenError("Connection code is invalid or expired");
  }
  // The per-user pointer invalidates earlier codes and simultaneous redemption.
  const consumed = await redis.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    1,
    `slack-agent:latest:${pending.teamId}:${pending.userId}`,
    digest,
  );
  if (consumed !== 1) {
    throw new ForbiddenError("Connection code is invalid or expired");
  }
  return linkAccount(
    { teamId: input.teamId, slackUserId: input.slackUserId },
    pending.userId,
  );
}

async function linkAccount(
  identity: z.infer<typeof SlackIdentity>,
  userId: string,
) {
  // A concurrent connect cannot replace the account behind an existing identity.
  await prisma.slackAgentUserLink.createMany({
    data: { ...identity, userId },
    skipDuplicates: true,
  });
  const link = await prisma.slackAgentUserLink.findUnique({
    where: { teamId_slackUserId: identity },
    select: { id: true, userId: true },
  });
  if (!link || link.userId !== userId) {
    throw new LangfuseConflictError(
      "This Slack account is already connected. Disconnect it in Langfuse first.",
    );
  }
  logger.info("Slack agent account connected", {
    userId: link.userId,
    linkId: link.id,
  });
  return { linked: true as const, linkId: link.id };
}

async function linkedProjects(identity: z.infer<typeof SlackIdentity>) {
  const link = await prisma.slackAgentUserLink.findUnique({
    where: { teamId_slackUserId: identity },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          v4BetaEnabled: true,
          organizationMemberships: {
            select: {
              role: true,
              ProjectMemberships: { select: { projectId: true, role: true } },
              organization: {
                select: {
                  id: true,
                  name: true,
                  cloudConfig: true,
                  aiFeaturesEnabled: true,
                  aiTelemetryEnabled: true,
                  projects: {
                    where: { deletedAt: null },
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!link || !isInAppAgentInstanceEnabled()) {
    return { link, projects: [] };
  }
  const projects = link.user.organizationMemberships.flatMap((membership) => {
    const org = membership.organization;
    const cloudConfig = CloudConfigSchema.safeParse(org.cloudConfig).data;
    const plan = getOrganizationPlanServerSide(cloudConfig);
    if (
      !org.aiFeaturesEnabled ||
      !hasEntitlementBasedOnPlan({ plan, entitlement: "in-app-agent" })
    ) {
      return [];
    }
    return org.projects.flatMap((project) => {
      const role =
        membership.ProjectMemberships.find(
          (override) => override.projectId === project.id,
        )?.role ?? membership.role;
      if (!projectRoleAccessRights[role].includes("project:read")) {
        return [];
      }
      const scope: ApiAccessScope = {
        projectId: project.id,
        orgId: org.id,
        plan,
        accessLevel: "project",
        apiKeyId: "slack-agent",
        publicKey: "slack-agent",
        isIngestionSuspended: false,
        rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
      };
      return [
        {
          id: project.id,
          name: project.name,
          orgName: org.name,
          scope,
          aiTelemetryEnabled: org.aiTelemetryEnabled,
        },
      ];
    });
  });
  return { link, projects };
}

export async function handleSlackAgentRequest(
  input: z.infer<typeof SlackAgentRequest>,
) {
  if (input.teamId !== configuredTeam()) {
    throw new ForbiddenError("Slack workspace is not allowed");
  }
  if (input.operation === "connect") {
    return connectAccount(input);
  }
  if (input.operation === "connection") {
    return createConnection({
      teamId: input.teamId,
      slackUserId: input.slackUserId,
    });
  }
  const { link, projects } = await linkedProjects({
    teamId: input.teamId,
    slackUserId: input.slackUserId,
  });
  if (input.operation === "projects") {
    return {
      linked: Boolean(link),
      ...(link ? { linkId: link.id } : {}),
      projects: projects.map(({ id, name, orgName }) => ({
        id,
        name,
        orgName,
      })),
    };
  }
  if (!link || link.id !== input.linkId) {
    throw new ForbiddenError(
      "Slack connection changed. Connect your account again.",
    );
  }
  const project = projects.find(
    (candidate) => candidate.id === input.projectId,
  );
  if (!project) {
    throw new ForbiddenError(
      "You do not have access to the agent in this project",
    );
  }
  const access = {
    projectId: project.id,
    userId: link.userId,
    user: link.user,
    organization: { aiTelemetryEnabled: project.aiTelemetryEnabled },
  };
  const namespace = `slack_${link.id}`;
  const conversationPrefix = `aconv_${namespace}_`;
  await assertInAppAgentRateLimit(
    project.scope,
    input.operation === "start" ? "in-app-agent-run" : "public-api",
  );
  if (input.operation === "start") {
    if (input.conversationId) {
      const conversation = await prisma.inAppAgentConversation.findFirst({
        where: {
          id: input.conversationId,
          projectId: project.id,
          createdByUserId: link.userId,
          deletedAt: null,
        },
        select: { alwaysAllowedTools: true },
      });
      if (conversation?.alwaysAllowedTools.length) {
        throw new ForbiddenError(
          "This conversation has tool approvals. Start a new Slack thread.",
        );
      }
    }
    return startExternalAgentRun({
      scope: project.scope,
      access,
      namespace,
      input,
    });
  }
  const runParams = { access, runId: input.runId, conversationPrefix };
  if (input.operation === "cancel") {
    return cancelExternalAgentRun(runParams);
  }
  const run = await getExternalAgentRun(runParams);
  if (run.status === "AWAITING_APPROVAL") {
    await cancelExternalAgentRun(runParams);
    return getExternalAgentRun(runParams);
  }
  return run;
}
