import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createHash, randomBytes, randomUUID } from "crypto";
import { EventType } from "@ag-ui/core";
import type { Session } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";

import type * as SharedServerModule from "@langfuse/shared/src/server";
import type * as PersistenceModule from "@langfuse/shared/in-app-agent/server/persistence";
import { env } from "@/src/env.mjs";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  createInAppAgentToolPolicy,
  filterInAppAgentAvailableLangfuseMcpTools,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

const authMocks = vi.hoisted(() => ({
  getServerAuthSessionForRequest: vi.fn(),
}));

const entitlementMocks = vi.hoisted(() => ({
  hasEntitlement: vi.fn(() => true),
  hasEntitlementBasedOnPlan: vi.fn(() => true),
}));

const webhookMocks = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  rateLimitRequest: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServerModule>();
  return {
    ...actual,
    InAppAgentRunQueue: {
      getInstance: () => ({ add: webhookMocks.enqueue }),
    },
  };
});

vi.mock(
  "@langfuse/shared/in-app-agent/server/persistence",
  async (importOriginal) => ({
    ...(await importOriginal<typeof PersistenceModule>()),
    maybeInferAndPersistConversationTitle: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: webhookMocks.rateLimitRequest,
    }),
  },
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSessionForRequest: authMocks.getServerAuthSessionForRequest,
}));

vi.mock("@/src/features/entitlements/server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    hasEntitlement: entitlementMocks.hasEntitlement,
    hasEntitlementBasedOnPlan: entitlementMocks.hasEntitlementBasedOnPlan,
  };
});

describe("in-app agent public API route auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementMocks.hasEntitlement.mockReturnValue(true);
    entitlementMocks.hasEntitlementBasedOnPlan.mockReturnValue(true);
    webhookMocks.rateLimitRequest.mockResolvedValue({
      isRateLimited: () => false,
      res: undefined,
    });
  });

  async function createInAppAgentAuthHeader() {
    const { projectId } = await createOrgProjectAndApiKey();
    const apiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: projectId,
      scope: "PROJECT",
      isInAppAgentKey: true,
    });

    return createBasicAuthHeader(apiKey.publicKey, apiKey.secretKey);
  }

  async function callRoute(params: { allowInAppAgentKey?: boolean }) {
    const handler = createAuthedProjectAPIRoute({
      name: "Test Route",
      action: "project:read",
      ...(params.allowInAppAgentKey === undefined
        ? {}
        : { allowInAppAgentKey: params.allowInAppAgentKey }),
      querySchema: z.object({}),
      responseSchema: z.object({ ok: z.literal(true) }),
      fn: async () => ({ ok: true as const }),
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: await createInAppAgentAuthHeader(),
      },
      query: {},
    });

    await handler(req, res);

    return res;
  }

  it("rejects in-app agent keys when allowInAppAgentKey is omitted", async () => {
    const res = await callRoute({});

    expect(res.statusCode).toBe(401);
    expect(res._getJSONData()).toEqual({
      message:
        "Access denied - in-app agent keys are not allowed for this endpoint",
      error: "UnauthorizedError",
    });
  });

  it("rejects in-app agent keys when allowInAppAgentKey is false", async () => {
    const res = await callRoute({ allowInAppAgentKey: false });

    expect(res.statusCode).toBe(401);
    expect(res._getJSONData()).toEqual({
      message:
        "Access denied - in-app agent keys are not allowed for this endpoint",
      error: "UnauthorizedError",
    });
  });

  it("allows in-app agent keys when allowInAppAgentKey is true", async () => {
    const res = await callRoute({ allowInAppAgentKey: true });

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
  });

  it("filters Langfuse MCP tools using the in-app agent user's access", () => {
    const tools = {
      createModel: { id: "createModel" },
      listDatasets: { id: "listDatasets" },
      getPrompt: { id: "getPrompt" },
    };

    expect(
      filterInAppAgentAvailableLangfuseMcpTools({
        tools,
        policy: createInAppAgentToolPolicy({
          userAccess: { projectRole: "MEMBER", isAdmin: false },
        }),
      }),
    ).toEqual({
      listDatasets: { id: "listDatasets" },
      getPrompt: { id: "getPrompt" },
    });

    expect(
      filterInAppAgentAvailableLangfuseMcpTools({
        tools,
        policy: createInAppAgentToolPolicy({
          userAccess: { projectRole: "OWNER", isAdmin: false },
        }),
      }),
    ).toEqual(tools);
  });

  describe("background watch route authorization", () => {
    async function setupWatchConversation() {
      const { org, project } = await createOrgProjectAndApiKey();
      const userId = `watch-owner-${randomUUID()}`;
      const conversationId = `conversation-${randomUUID()}`;

      await prisma.organization.update({
        where: { id: org.id },
        data: { aiFeaturesEnabled: true },
      });
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@example.com`,
        },
      });
      await prisma.inAppAgentConversation.create({
        data: {
          id: conversationId,
          projectId: project.id,
          createdByUserId: userId,
          title: "Watch authorization test",
        },
      });

      return { conversationId, org, project, userId };
    }

    async function callWatchRoute(params: {
      projectId: string;
      conversationId: string;
    }) {
      const { default: watchHandler } =
        await import("@/src/features/in-app-agent/server/watchHandler");

      return watchHandler(
        new Request(
          `http://localhost/api/in-app-agent/watch?projectId=${params.projectId}&conversationId=${params.conversationId}&cursor=-1`,
        ),
      );
    }

    it("allows the owner to watch the project-scoped conversation", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, org, project, userId } =
          await setupWatchConversation();
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: org.id,
            projectId: project.id,
            userId,
          }),
        );

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
          "text/event-stream",
        );
        await expect(response.text()).resolves.toContain("event: done");
      });
    });

    it("rejects an unauthenticated watch", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, project } = await setupWatchConversation();
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(null);

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(401);
      });
    });

    it("rejects a watcher without project membership", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, org, project, userId } =
          await setupWatchConversation();
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: org.id,
            projectId: project.id,
            userId,
            includeProjectMembership: false,
          }),
        );

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(403);
      });
    });

    it("rejects a watcher without the in-app-agent entitlement", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, org, project, userId } =
          await setupWatchConversation();
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: org.id,
            projectId: project.id,
            userId,
          }),
        );
        entitlementMocks.hasEntitlement.mockReturnValue(false);

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(403);
      });
    });

    it("rejects a watch when organization AI features are disabled", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, org, project, userId } =
          await setupWatchConversation();
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: org.id,
            projectId: project.id,
            userId,
          }),
        );
        await prisma.organization.update({
          where: { id: org.id },
          data: { aiFeaturesEnabled: false },
        });

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(403);
      });
    });

    it("does not reveal a conversation to another project member", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, org, project } = await setupWatchConversation();
        const otherUserId = `watch-member-${randomUUID()}`;
        await prisma.user.create({
          data: {
            id: otherUserId,
            email: `${otherUserId}@example.com`,
          },
        });
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: org.id,
            projectId: project.id,
            userId: otherUserId,
          }),
        );

        const response = await callWatchRoute({
          projectId: project.id,
          conversationId,
        });

        expect(response.status).toBe(404);
      });
    });

    it("does not resolve a conversation through another project", async () => {
      await withInAppAgentCloudEnv(async () => {
        const { conversationId, userId } = await setupWatchConversation();
        const other = await createOrgProjectAndApiKey();
        await prisma.organization.update({
          where: { id: other.org.id },
          data: { aiFeaturesEnabled: true },
        });
        authMocks.getServerAuthSessionForRequest.mockResolvedValue(
          createInAppAgentSession({
            orgId: other.org.id,
            projectId: other.project.id,
            userId,
          }),
        );

        const response = await callWatchRoute({
          projectId: other.project.id,
          conversationId,
        });

        expect(response.status).toBe(404);
      });
    });
  });
});

describe("in-app agent experiment webhook", () => {
  const originalEnv = {
    LANGFUSE_IN_APP_AGENT_WEBHOOKS: env.LANGFUSE_IN_APP_AGENT_WEBHOOKS,
    LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER:
      env.LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER,
  };
  const originalSharedEnv = {
    LANGFUSE_IN_APP_AGENT_ENABLED: sharedEnv.LANGFUSE_IN_APP_AGENT_ENABLED,
    LANGFUSE_AI_PROVIDER: sharedEnv.LANGFUSE_AI_PROVIDER,
    LANGFUSE_AI_MODEL: sharedEnv.LANGFUSE_AI_MODEL,
    LANGFUSE_AI_SMALL_MODEL: sharedEnv.LANGFUSE_AI_SMALL_MODEL,
    LANGFUSE_AI_AWS_BEDROCK_REGION: sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    entitlementMocks.hasEntitlement.mockReturnValue(true);
    entitlementMocks.hasEntitlementBasedOnPlan.mockReturnValue(true);
    webhookMocks.rateLimitRequest.mockResolvedValue({
      isRateLimited: () => false,
      res: undefined,
    });
    Object.assign(sharedEnv, {
      LANGFUSE_IN_APP_AGENT_ENABLED: "true",
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: "test-model",
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "eu-central-1",
    });
  });

  afterEach(() => {
    Object.assign(env, originalEnv);
    Object.assign(sharedEnv, originalSharedEnv);
  });

  async function setupWebhook() {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const userId = `webhook-owner-${randomUUID()}`;
    await prisma.organization.update({
      where: { id: orgId },
      data: { aiFeaturesEnabled: true },
    });
    await prisma.user.create({
      data: { id: userId, email: `${userId}@example.com` },
    });
    const membership = await prisma.organizationMembership.create({
      data: { orgId, userId, role: "MEMBER" },
    });
    const secret = randomBytes(32).toString("hex");
    const credential = {
      id: `experiment-${randomUUID()}`,
      tokenSha256: createHash("sha256").update(secret).digest("hex"),
      projectId,
      userId,
    };
    Object.assign(env, {
      LANGFUSE_IN_APP_AGENT_WEBHOOKS: JSON.stringify([credential]),
    });
    return {
      orgId,
      projectId,
      userId,
      membership,
      credential,
      authorization: `Bearer ${credential.id}.${secret}`,
      body: { projectId, userId, message: "Explain the failed traces." },
    };
  }

  async function callWebhook(params: {
    authorization?: string;
    body?: Record<string, unknown>;
    runId?: string;
  }) {
    const { default: handler } =
      await import("@/src/pages/api/internal/in-app-agent/runs");
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: params.runId ? "GET" : "POST",
      headers: params.authorization
        ? { authorization: params.authorization }
        : {},
      query: params.runId ? { runId: params.runId } : {},
      body: params.body,
    });
    await handler(req, res);
    return res;
  }

  it("starts fresh durable conversations and returns only the requested run's interaction", async () => {
    const setup = await setupWebhook();
    const started = await callWebhook(setup);
    expect(started.statusCode).toBe(202);
    const { runId, conversationId } = started._getJSONData();
    const run = await prisma.inAppAgentRun.findUniqueOrThrow({
      where: { id_projectId: { id: runId, projectId: setup.projectId } },
    });
    expect(run).toMatchObject({
      status: "QUEUED",
      triggeredByUserId: setup.userId,
      request: {
        kind: "userMessage",
        context: [],
        webhookCredentialId: setup.credential.id,
      },
    });
    expect(webhookMocks.enqueue).toHaveBeenCalledTimes(1);

    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: runId, projectId: setup.projectId } },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
    const assistantId = randomUUID();
    const events = [
      {
        type: EventType.TEXT_MESSAGE_CHUNK,
        role: "assistant",
        messageId: assistantId,
        delta: "I inspected the failures.",
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: "inspect-traces",
        toolCallName: "list_traces",
        parentMessageId: assistantId,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "inspect-traces",
        delta: '{"limit":1}',
      },
      { type: EventType.TOOL_CALL_END, toolCallId: "inspect-traces" },
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: randomUUID(),
        toolCallId: "inspect-traces",
        content: '{"count":1}',
        role: "tool",
      },
    ];
    const lastEvent = await prisma.inAppAgentEvent.findFirstOrThrow({
      where: { projectId: setup.projectId, conversationId },
      orderBy: { sequenceNumber: "desc" },
    });
    await prisma.inAppAgentEvent.createMany({
      data: events.map((event, index) => ({
        projectId: setup.projectId,
        conversationId,
        runId,
        sequenceNumber: lastEvent.sequenceNumber + index + 1,
        type: event.type,
        event,
      })),
    });
    const laterRunId = randomUUID();
    await prisma.inAppAgentRun.create({
      data: {
        id: laterRunId,
        projectId: setup.projectId,
        conversationId,
        triggeredByUserId: setup.userId,
        status: "SUCCEEDED",
        finishedAt: new Date(),
      },
    });
    await prisma.inAppAgentEvent.create({
      data: {
        projectId: setup.projectId,
        conversationId,
        runId: laterRunId,
        sequenceNumber: lastEvent.sequenceNumber + events.length + 1,
        type: EventType.TEXT_MESSAGE_CHUNK,
        event: {
          type: EventType.TEXT_MESSAGE_CHUNK,
          role: "assistant",
          messageId: randomUUID(),
          delta: "A later private interaction.",
        },
      },
    });

    const result = await callWebhook({ ...setup, runId });
    expect(result.statusCode).toBe(200);
    expect(result._getJSONData()).toMatchObject({
      conversationId,
      runId,
      status: "SUCCEEDED",
      messages: [
        { role: "user", content: setup.body.message },
        {
          role: "assistant",
          content: "I inspected the failures.",
          toolCalls: [
            {
              id: "inspect-traces",
              function: { name: "list_traces", arguments: '{"limit":1}' },
            },
          ],
        },
        { role: "tool", content: '{"count":1}' },
      ],
    });
    const second = await callWebhook(setup);
    expect(second.statusCode).toBe(202);
    expect(second._getJSONData().conversationId).not.toBe(conversationId);
  });

  it("rejects missing, invalid, and revoked credentials and disables an unconfigured endpoint", async () => {
    const setup = await setupWebhook();
    expect((await callWebhook({ body: setup.body })).statusCode).toBe(401);
    expect(
      (
        await callWebhook({
          ...setup,
          authorization: `Bearer ${setup.credential.id}.${"0".repeat(64)}`,
        })
      ).statusCode,
    ).toBe(401);
    const started = await callWebhook(setup);
    expect(started.statusCode).toBe(202);
    Object.assign(env, { LANGFUSE_IN_APP_AGENT_WEBHOOKS: "[]" });
    expect(
      (await callWebhook({ ...setup, runId: started._getJSONData().runId }))
        .statusCode,
    ).toBe(401);
    Object.assign(env, { LANGFUSE_IN_APP_AGENT_WEBHOOKS: undefined });
    expect((await callWebhook(setup)).statusCode).toBe(404);
  });

  it("rejects impersonation, project switching, and caller-selected conversations before creating a run", async () => {
    const setup = await setupWebhook();
    for (const principal of [
      { userId: randomUUID() },
      { projectId: randomUUID() },
    ]) {
      expect(
        (await callWebhook({ ...setup, body: { ...setup.body, ...principal } }))
          .statusCode,
      ).toBe(403);
    }
    expect(
      (
        await callWebhook({
          ...setup,
          body: { ...setup.body, conversationId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await prisma.inAppAgentRun.count({
        where: { projectId: setup.projectId },
      }),
    ).toBe(0);
    expect(webhookMocks.enqueue).not.toHaveBeenCalled();
  });

  it("rechecks project overrides and organization membership for submission and result access", async () => {
    const setup = await setupWebhook();
    const started = await callWebhook(setup);
    expect(started.statusCode).toBe(202);
    const runId = started._getJSONData().runId;
    await prisma.projectMembership.create({
      data: {
        projectId: setup.projectId,
        userId: setup.userId,
        orgMembershipId: setup.membership.id,
        role: "NONE",
      },
    });
    expect((await callWebhook(setup)).statusCode).toBe(403);
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(403);
    await prisma.projectMembership.delete({
      where: {
        projectId_userId: { projectId: setup.projectId, userId: setup.userId },
      },
    });
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(200);
    await prisma.organizationMembership.delete({
      where: { id: setup.membership.id },
    });
    expect((await callWebhook(setup)).statusCode).toBe(403);
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(403);
  });

  it("hides runs from another credential, project, owner, or deleted conversation", async () => {
    const setup = await setupWebhook();
    const started = await callWebhook(setup);
    expect(started.statusCode).toBe(202);
    const { runId, conversationId } = started._getJSONData();
    const other = await setupWebhook();
    expect((await callWebhook({ ...other, runId })).statusCode).toBe(404);
    Object.assign(env, {
      LANGFUSE_IN_APP_AGENT_WEBHOOKS: JSON.stringify([setup.credential]),
    });
    const runWhere = {
      id_projectId: { id: runId, projectId: setup.projectId },
    };
    await prisma.inAppAgentRun.update({
      where: runWhere,
      data: { request: { kind: "userMessage", context: [] } },
    });
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(404);
    await prisma.inAppAgentRun.update({
      where: runWhere,
      data: {
        request: {
          kind: "userMessage",
          context: [],
          webhookCredentialId: other.credential.id,
        },
      },
    });
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(404);
    await prisma.inAppAgentRun.update({
      where: runWhere,
      data: {
        request: {
          kind: "userMessage",
          context: [],
          webhookCredentialId: setup.credential.id,
        },
      },
    });
    const conversationWhere = {
      id_projectId: { id: conversationId, projectId: setup.projectId },
    };
    await prisma.inAppAgentConversation.update({
      where: conversationWhere,
      data: { createdByUserId: other.userId },
    });
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(404);
    await prisma.inAppAgentConversation.update({
      where: conversationWhere,
      data: { createdByUserId: setup.userId, deletedAt: new Date() },
    });
    expect((await callWebhook({ ...setup, runId })).statusCode).toBe(404);
  });

  it("enforces instance availability, entitlement, and organization AI settings", async () => {
    const setup = await setupWebhook();
    Object.assign(sharedEnv, { LANGFUSE_IN_APP_AGENT_ENABLED: "false" });
    expect((await callWebhook(setup)).statusCode).toBe(412);
    Object.assign(sharedEnv, { LANGFUSE_IN_APP_AGENT_ENABLED: "true" });
    entitlementMocks.hasEntitlementBasedOnPlan.mockReturnValue(false);
    expect((await callWebhook(setup)).statusCode).toBe(403);
    entitlementMocks.hasEntitlement.mockReturnValue(true);
    entitlementMocks.hasEntitlementBasedOnPlan.mockReturnValue(true);
    await prisma.organization.update({
      where: { id: setup.orgId },
      data: { aiFeaturesEnabled: false },
    });
    expect((await callWebhook(setup)).statusCode).toBe(403);
    expect(webhookMocks.enqueue).not.toHaveBeenCalled();
  });

  it("applies the existing submission rate and active-run limits", async () => {
    const setup = await setupWebhook();
    webhookMocks.rateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
      res: { msBeforeNext: 1_000 },
    });
    expect((await callWebhook(setup)).statusCode).toBe(429);
    expect(webhookMocks.enqueue).not.toHaveBeenCalled();
    Object.assign(env, { LANGFUSE_IN_APP_AGENT_MAX_ACTIVE_RUNS_PER_USER: 1 });
    expect((await callWebhook(setup)).statusCode).toBe(202);
    expect((await callWebhook(setup)).statusCode).toBe(429);
    expect(webhookMocks.enqueue).toHaveBeenCalledTimes(1);
  });
});

function createInAppAgentSession(params: {
  orgId: string;
  projectId: string;
  userId: string;
  includeProjectMembership?: boolean;
}): Session {
  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    environment: { enableExperimentalFeatures: false },
    user: {
      id: params.userId,
      name: "Test User",
      email: "test@example.com",
      image: null,
      admin: false,
      featureFlags: testFeatureFlags({ templateFlag: false }),
      organizations:
        (params.includeProjectMembership ?? true)
          ? [
              {
                id: params.orgId,
                name: "Test Org",
                plan: "cloud:team",
                role: "OWNER",
                metadata: {},
                aiFeaturesEnabled: true,
                aiTelemetryEnabled: false,
                cloudConfig: { plan: "Team" },
                projects: [
                  {
                    id: params.projectId,
                    name: "Test Project",
                    role: "ADMIN",
                    retentionDays: 30,
                    hasTraces: false,
                    deletedAt: null,
                    metadata: {},
                    createdAt: new Date().toISOString(),
                  },
                ],
              },
            ]
          : [],
    },
  } as Session;
}

async function withInAppAgentCloudEnv<T>(run: () => Promise<T>): Promise<T> {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalBedrockModel = env.LANGFUSE_AI_MODEL;
  const originalAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
  const originalAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;

  (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  (env as any).LANGFUSE_AI_MODEL = "test-model";
  (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = "pk-lf-test";
  (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = "sk-lf-test";

  try {
    return await run();
  } finally {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_AI_MODEL = originalBedrockModel;
    (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = originalAiFeaturesPublicKey;
    (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = originalAiFeaturesSecretKey;
  }
}
