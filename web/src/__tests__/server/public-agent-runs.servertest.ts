import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Session } from "next-auth";
import { EventType } from "@ag-ui/core";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey, redis } from "@langfuse/shared/src/server";
import { InAppAgentRunStatus } from "@langfuse/shared/in-app-agent";
import { env } from "@/src/env.mjs";
import {
  AgentRunReference,
  GetAgentRunResponse,
} from "@/src/features/public-api/types/agent";
import createRun from "@/src/pages/api/public/agent/runs/index";
import getRun from "@/src/pages/api/public/agent/runs/[runId]/index";
import cancelRun from "@/src/pages/api/public/agent/runs/[runId]/cancel";
import { startPublicAgentRun } from "@/src/features/in-app-agent/server/publicAgentService";
import slackAgentRoute from "@/src/pages/api/slack-agent/index";
import { slackAgentRouter } from "@/src/features/slack-agent/server/router";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { getProductBaseUrl } from "@/src/utils/base-url";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import type * as PersistenceModule from "@langfuse/shared/in-app-agent/server/persistence";
import type * as ModelProviderModule from "@langfuse/shared/in-app-agent/server/modelProvider";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  enabled: true,
  modelConfigured: true,
  adminAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: mocks.adminAccess,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServerModule>()),
  InAppAgentRunQueue: {
    getInstance: () => ({ add: mocks.enqueue, remove: mocks.remove }),
  },
}));
vi.mock(
  "@langfuse/shared/in-app-agent/server/persistence",
  async (importOriginal) => ({
    ...(await importOriginal<typeof PersistenceModule>()),
    maybeInferAndPersistConversationTitle: vi.fn().mockResolvedValue(undefined),
  }),
);
vi.mock(
  "@langfuse/shared/in-app-agent/server/modelProvider",
  async (importOriginal) => ({
    ...(await importOriginal<typeof ModelProviderModule>()),
    isInAppAgentInstanceEnabled: () => mocks.enabled,
    getInAppAgentModelConfig: () =>
      mocks.modelConfigured
        ? {
            provider: "bedrock",
            modelId: "test-model",
            titleModelId: "test-model",
            region: "eu-central-1",
          }
        : undefined,
  }),
);
vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: async () => ({ isRateLimited: () => false }),
    }),
  },
}));

async function call(
  handler: typeof createRun,
  params: {
    auth?: string;
    connectionId?: string;
    body?: Record<string, unknown>;
    runId?: string;
    method?: "POST" | "GET";
  },
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: params.method ?? "POST",
    headers: params.auth ? { authorization: params.auth } : {},
    query: params.runId
      ? { runId: params.runId, connectionId: params.connectionId }
      : {},
    body: params.body
      ? { connectionId: params.connectionId, ...params.body }
      : undefined,
  });
  await handler(req, res);
  return { status: res.statusCode, body: res._getJSONData() as unknown };
}

async function fixture() {
  const project = await createOrgProjectAndApiKey();
  const userId = randomUUID();
  await prisma.user.create({
    data: { id: userId, email: `${userId}@example.com` },
  });
  await prisma.organization.update({
    where: { id: project.orgId },
    data: { aiFeaturesEnabled: true },
  });
  const membership = await prisma.organizationMembership.create({
    data: { orgId: project.orgId, userId, role: "VIEWER" },
  });
  Object.assign(env, {
    LANGFUSE_IN_APP_AGENT_API_PROJECT_ID: project.projectId,
  });
  const apiKey = await prisma.apiKey.findUniqueOrThrow({
    where: { publicKey: project.publicKey },
  });
  const connection = await prisma.userConnection.create({
    data: {
      projectId: project.projectId,
      apiKeyId: apiKey.id,
      userId,
      provider: "slack",
      workspaceId: "TDEMO",
      externalUserId: "UPERSON",
    },
  });
  return {
    ...project,
    userId,
    membership,
    connectionId: connection.id,
    apiKeyId: apiKey.id,
  };
}

describe("public agent runs", () => {
  const original = {
    LANGFUSE_IN_APP_AGENT_API_PROJECT_ID:
      env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.modelConfigured = true;
  });
  afterEach(() => Object.assign(env, original));

  it("authenticates the project key and enforces the linked user's current membership", async () => {
    const f = await fixture();
    const body = { message: "Inspect recent traces", idempotencyKey: "access" };
    expect((await call(createRun, { body })).status).toBe(401);
    const otherProject = await createOrgProjectAndApiKey();
    expect(
      (
        await call(createRun, {
          auth: otherProject.auth,
          connectionId: f.connectionId,
          body,
        })
      ).status,
    ).toBe(404);
    await prisma.projectMembership.create({
      data: {
        projectId: f.projectId,
        userId: f.userId,
        orgMembershipId: f.membership.id,
        role: "NONE",
      },
    });
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).status,
    ).toBe(403);
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: f.projectId, userId: f.userId } },
      data: { role: "MEMBER" },
    });
    const accepted = await call(createRun, {
      auth: f.auth,
      connectionId: f.connectionId,
      body,
    });
    expect(accepted.status).toBe(202);
    const reference = AgentRunReference.parse(accepted.body);
    const stored = await prisma.inAppAgentRun.findUniqueOrThrow({
      where: { id_projectId: { id: reference.runId, projectId: f.projectId } },
    });
    expect(stored.triggeredByUserId).toBe(f.userId);
    expect(stored.request).toMatchObject({
      context: expect.arrayContaining([
        { description: "langfuse_user_id", value: f.userId },
      ]),
    });
    await prisma.organizationMembership.delete({
      where: { id: f.membership.id },
    });
    expect(
      (
        await call(getRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId: reference.runId,
          method: "GET",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(cancelRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId: reference.runId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).status,
    ).toBe(403);
  });

  it("isolates runs and retries between connections for the same Langfuse user", async () => {
    const f = await fixture();
    const other = await createOrgProjectAndApiKey();
    const otherKey = await prisma.apiKey.update({
      where: { publicKey: other.publicKey },
      data: { projectId: f.projectId },
    });
    const connection = await prisma.userConnection.create({
      data: {
        projectId: f.projectId,
        apiKeyId: otherKey.id,
        userId: f.userId,
        provider: "slack",
        workspaceId: "TDEMO",
        externalUserId: "UPERSON",
      },
    });
    const body = { message: "Inspect traces", idempotencyKey: "same-event" };
    const first = AgentRunReference.parse(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).body,
    );
    expect(
      (
        await call(createRun, {
          auth: other.auth,
          connectionId: f.connectionId,
          body,
        })
      ).status,
    ).toBe(403);
    const second = AgentRunReference.parse(
      (
        await call(createRun, {
          auth: other.auth,
          connectionId: connection.id,
          body,
        })
      ).body,
    );
    expect(second.runId).not.toBe(first.runId);
    expect(second.conversationId).not.toBe(first.conversationId);
    for (const handler of [getRun, cancelRun]) {
      for (const [connectionId, status] of [
        [f.connectionId, 403],
        [connection.id, 404],
      ] as const) {
        expect(
          (
            await call(handler, {
              auth: other.auth,
              connectionId,
              runId: first.runId,
              method: handler === getRun ? "GET" : "POST",
            })
          ).status,
        ).toBe(status);
      }
    }
    expect(
      (
        await call(createRun, {
          auth: other.auth,
          connectionId: connection.id,
          body: {
            ...body,
            idempotencyKey: "append",
            conversationId: first.conversationId,
          },
        })
      ).status,
    ).toBe(404);
  });

  it("audits linked administrator access using the existing admin webhook", async () => {
    const f = await fixture();
    await prisma.user.update({
      where: { id: f.userId },
      data: { admin: true },
    });
    await prisma.organizationMembership.delete({
      where: { id: f.membership.id },
    });
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body: { message: "Inspect traces", idempotencyKey: "admin" },
        })
      ).status,
    ).toBe(202);
    expect(mocks.adminAccess).toHaveBeenCalledWith({
      email: `${f.userId}@example.com`,
      projectId: f.projectId,
      orgId: f.orgId,
    });
  });

  it("rejects missing and unlinked connections and prevents cross-user run access", async () => {
    const f = await fixture();
    const body = { message: "Inspect traces", idempotencyKey: "identity" };
    expect((await call(createRun, { auth: f.auth, body })).status).toBe(400);
    const otherUser = await prisma.user.create({ data: {} });
    await prisma.organizationMembership.create({
      data: { orgId: f.orgId, userId: otherUser.id, role: "VIEWER" },
    });
    const otherConnection = await prisma.userConnection.create({
      data: {
        projectId: f.projectId,
        apiKeyId: f.apiKeyId,
        provider: "slack",
        workspaceId: "TDEMO",
        externalUserId: "UOTHER",
      },
    });
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: otherConnection.id,
          body,
        })
      ).status,
    ).toBe(403);
    await prisma.userConnection.update({
      where: { id: otherConnection.id },
      data: { userId: otherUser.id },
    });
    const first = AgentRunReference.parse(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).body,
    );
    const second = AgentRunReference.parse(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: otherConnection.id,
          body,
        })
      ).body,
    );
    expect(first.runId).not.toBe(second.runId);
    for (const handler of [getRun, cancelRun]) {
      expect(
        (
          await call(handler, {
            auth: f.auth,
            connectionId: otherConnection.id,
            runId: first.runId,
            method: handler === getRun ? "GET" : "POST",
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: otherConnection.id,
          body: {
            ...body,
            idempotencyKey: "intrude",
            conversationId: first.conversationId,
          },
        })
      ).status,
    ).toBe(404);
  });

  it("keeps concurrent and completed retries on one durable run and rejects changed input", async () => {
    const f = await fixture();
    const body = { message: "Inspect recent traces", idempotencyKey: "replay" };
    const [first, concurrent] = await Promise.all([
      call(createRun, { auth: f.auth, connectionId: f.connectionId, body }),
      call(createRun, { auth: f.auth, connectionId: f.connectionId, body }),
    ]);
    expect([first.status, concurrent.status]).toEqual([202, 202]);
    expect(concurrent.body).toEqual(first.body);
    const reference = AgentRunReference.parse(first.body);
    expect(
      await prisma.inAppAgentRun.count({ where: { projectId: f.projectId } }),
    ).toBe(1);
    expect(
      await prisma.inAppAgentEvent.count({ where: { projectId: f.projectId } }),
    ).toBe(1);
    mocks.enqueue.mockClear();
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).body,
    ).toEqual(reference);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      { jobId: reference.runId },
    );
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: reference.runId, projectId: f.projectId } },
      data: { status: InAppAgentRunStatus.SUCCEEDED, finishedAt: new Date() },
    });
    mocks.enqueue.mockClear();
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body,
        })
      ).body,
    ).toEqual(reference);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body: { ...body, message: "Different request" },
        })
      ).status,
    ).toBe(409);
  });

  it("returns only the requested run's assistant text and cancels its queued follow-up", async () => {
    const f = await fixture();
    const first = await call(createRun, {
      auth: f.auth,
      connectionId: f.connectionId,
      body: { message: "First question", idempotencyKey: "first" },
    });
    const reference = AgentRunReference.parse(first.body);
    await prisma.$transaction([
      prisma.inAppAgentRun.update({
        where: {
          id_projectId: { id: reference.runId, projectId: f.projectId },
        },
        data: { status: InAppAgentRunStatus.SUCCEEDED, finishedAt: new Date() },
      }),
      prisma.inAppAgentEvent.createMany({
        data: [
          {
            type: EventType.TEXT_MESSAGE_CHUNK,
            event: {
              type: EventType.TEXT_MESSAGE_CHUNK,
              messageId: "answer",
              role: "assistant",
              delta: "The first answer",
            },
          },
          {
            type: EventType.TOOL_CALL_RESULT,
            event: {
              type: EventType.TOOL_CALL_RESULT,
              messageId: "tool",
              toolCallId: "call",
              content: "private tool payload",
              role: "tool",
            },
          },
          {
            type: EventType.TEXT_MESSAGE_CHUNK,
            event: {
              type: EventType.TEXT_MESSAGE_CHUNK,
              messageId: "reasoning",
              role: "reasoning",
              delta: "private reasoning",
            },
          },
        ].map((event, index) => ({
          ...event,
          projectId: f.projectId,
          conversationId: reference.conversationId,
          runId: reference.runId,
          sequenceNumber: index + 1,
        })),
      }),
    ]);
    const followup = await call(createRun, {
      auth: f.auth,
      connectionId: f.connectionId,
      body: {
        message: "Follow-up",
        idempotencyKey: "second",
        conversationId: reference.conversationId,
      },
    });
    const second = AgentRunReference.parse(followup.body);
    const result = await call(getRun, {
      auth: f.auth,
      connectionId: f.connectionId,
      runId: reference.runId,
      method: "GET",
    });
    expect(result.status).toBe(200);
    expect(GetAgentRunResponse.parse(result.body)).toEqual({
      ...reference,
      status: "SUCCEEDED",
      text: "The first answer",
      errorCode: null,
      cancelRequested: false,
    });
    expect(
      (
        await call(cancelRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId: second.runId,
        })
      ).body,
    ).toEqual(second);
    const cancelled = await call(getRun, {
      auth: f.auth,
      connectionId: f.connectionId,
      runId: second.runId,
      method: "GET",
    });
    expect(GetAgentRunResponse.parse(cancelled.body).status).toBe("CANCELLED");
  });

  it("keeps app conversations and another user's conversations outside the API", async () => {
    const f = await fixture();
    const runId = `arun_api_${"a".repeat(64)}`;
    await prisma.inAppAgentConversation.create({
      data: {
        id: "personal-conversation",
        projectId: f.projectId,
        createdByUserId: f.userId,
        runs: {
          create: {
            id: runId,
            triggeredByUserId: f.userId,
            status: "SUCCEEDED",
            finishedAt: new Date(),
          },
        },
      },
    });
    expect(
      (
        await call(getRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId,
          method: "GET",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(cancelRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId,
        })
      ).status,
    ).toBe(404);
    await expect(
      startPublicAgentRun({
        scope: {
          projectId: f.projectId,
          orgId: f.orgId,
          plan: "oss",
          accessLevel: "project",
          apiKeyId: f.apiKeyId,
          publicKey: f.publicKey,
          rateLimitOverrides: [],
          isIngestionSuspended: false,
        },
        input: {
          connectionId: f.connectionId,
          conversationId: "personal-conversation",
          message: "Append to personal chat",
          idempotencyKey: "personal",
        },
      }),
    ).rejects.toThrow("Agent conversation not found");
    const otherUserId = randomUUID();
    await prisma.user.create({ data: { id: otherUserId } });
    const conversationId = `aconv_api_${"c".repeat(64)}_${"b".repeat(64)}`;
    await prisma.inAppAgentConversation.create({
      data: {
        id: conversationId,
        projectId: f.projectId,
        createdByUserId: otherUserId,
        runs: {
          create: {
            id: `arun_api_${"b".repeat(64)}`,
            triggeredByUserId: otherUserId,
            status: "SUCCEEDED",
            finishedAt: new Date(),
          },
        },
      },
    });
    expect(
      (
        await call(getRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          runId: `arun_api_${"b".repeat(64)}`,
          method: "GET",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(createRun, {
          auth: f.auth,
          connectionId: f.connectionId,
          body: {
            conversationId,
            message: "Intrude",
            idempotencyKey: "intruder",
          },
        })
      ).status,
    ).toBe(404);
  });

  it("preserves instance, organization, and model readiness checks", async () => {
    const f = await fixture();
    const request = {
      auth: f.auth,
      connectionId: f.connectionId,
      body: { message: "Inspect traces", idempotencyKey: "readiness" },
    };
    mocks.enabled = false;
    expect((await call(createRun, request)).status).toBe(412);
    mocks.enabled = true;
    await prisma.organization.update({
      where: { id: f.orgId },
      data: { aiFeaturesEnabled: false },
    });
    expect((await call(createRun, request)).status).toBe(403);
    await prisma.organization.update({
      where: { id: f.orgId },
      data: { aiFeaturesEnabled: true },
    });
    mocks.modelConfigured = false;
    expect((await call(createRun, request)).status).toBe(412);
    expect(
      await prisma.inAppAgentRun.count({ where: { projectId: f.projectId } }),
    ).toBe(0);
  });
});

describe("linked Slack agent", () => {
  const bridgeSecret = "test-slack-bridge-secret-at-least-32-characters";
  const teamId = "TTESTAGENT";
  const original = {
    LANGFUSE_SLACK_AGENT_SECRET: env.LANGFUSE_SLACK_AGENT_SECRET,
    LANGFUSE_SLACK_TEAM_ID: env.LANGFUSE_SLACK_TEAM_ID,
    LANGFUSE_IN_APP_AGENT_API_PROJECT_ID:
      env.LANGFUSE_IN_APP_AGENT_API_PROJECT_ID,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
    mocks.modelConfigured = true;
    Object.assign(env, {
      LANGFUSE_SLACK_AGENT_SECRET: bridgeSecret,
      LANGFUSE_SLACK_TEAM_ID: teamId,
    });
  });
  afterEach(() => Object.assign(env, original));

  function browser(userId: string | null, origin = getProductBaseUrl().origin) {
    const session: Session | null = userId
      ? {
          expires: "1",
          user: {
            id: userId,
            canCreateOrganizations: true,
            organizations: [],
            featureFlags: testFeatureFlags(),
            admin: false,
          },
          environment: {
            enableExperimentalFeatures: false,
            selfHostedInstancePlan: "oss",
          },
        }
      : null;
    return slackAgentRouter.createCaller(
      createInnerTRPCContext({ session, headers: { origin } }),
    );
  }

  async function bridge(
    body: Record<string, unknown>,
    options?: { authorization?: string; chunks?: Buffer[] },
  ) {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: {
        authorization: options?.authorization ?? `Bearer ${bridgeSecret}`,
      },
    });
    let bodyRead = false;
    req[Symbol.asyncIterator] = async function* () {
      bodyRead = true;
      for (const chunk of options?.chunks ?? [
        Buffer.from(JSON.stringify(body)),
      ]) {
        yield chunk;
      }
      return undefined;
    };
    await slackAgentRoute(req, res);
    return {
      status: res.statusCode,
      body: res._getJSONData() as Record<string, unknown>,
      bodyRead,
    };
  }

  async function linkedFixture() {
    const f = await fixture();
    const slackUserId = `U${randomUUID().replaceAll("-", "").toUpperCase()}`;
    const caller = browser(f.userId);
    const { code } = await caller.createCode();
    const connected = await bridge({
      operation: "connect",
      teamId,
      slackUserId,
      code,
    });
    expect(connected.status).toBe(200);
    const linkId = z.string().parse(connected.body.linkId);
    return {
      ...f,
      caller,
      slackUserId,
      linkId,
      identity: { teamId, slackUserId, linkId, projectId: f.projectId },
    };
  }

  it("requires browser authentication and same origin, and consumes only the newest unexpired code without replacing another account", async () => {
    const f = await fixture();
    await expect(browser(null).createCode()).rejects.toThrow();
    await expect(
      browser(f.userId, "https://attacker.example").createCode(),
    ).rejects.toThrow("Request must originate from Langfuse");
    const caller = browser(f.userId);
    const identity = {
      teamId,
      slackUserId: `U${randomUUID().replaceAll("-", "").toUpperCase()}`,
    };
    const old = await caller.createCode();
    const newest = await caller.createCode();
    expect(
      (await bridge({ operation: "connect", ...identity, code: old.code }))
        .status,
    ).toBe(403);
    expect(
      (await bridge({ operation: "connect", ...identity, code: newest.code }))
        .status,
    ).toBe(200);
    expect(
      (await bridge({ operation: "connect", ...identity, code: newest.code }))
        .status,
    ).toBe(403);
    const other = await fixture();
    const otherCode = await browser(other.userId).createCode();
    expect(
      (
        await bridge({
          operation: "connect",
          ...identity,
          code: otherCode.code,
        })
      ).status,
    ).toBe(409);
    expect((await caller.status()).links).toHaveLength(1);
    expect((await browser(other.userId).status()).links).toHaveLength(0);
    const expired = await caller.createCode();
    await redis?.expire(
      `slack-agent:code:${createHash("sha256").update(expired.code).digest("hex")}`,
      0,
    );
    expect(
      (await bridge({ operation: "connect", ...identity, code: expired.code }))
        .status,
    ).toBe(403);
  });

  it("authenticates the private transport before consuming its body and preserves split Unicode messages", async () => {
    const denied = await bridge(
      {},
      { authorization: "Bearer invalid", chunks: [Buffer.from("not json")] },
    );
    expect(denied.status).toBe(401);
    expect(denied.bodyRead).toBe(false);
    const f = await linkedFixture();
    expect(
      (
        await bridge({
          operation: "projects",
          teamId: "TOTHER",
          slackUserId: f.slackUserId,
        })
      ).status,
    ).toBe(403);
    const input = {
      operation: "start",
      ...f.identity,
      message: "Check latency 🔎",
      idempotencyKey: "unicode",
    };
    const encoded = Buffer.from(JSON.stringify(input));
    const split = encoded.indexOf(Buffer.from("🔎")) + 2;
    const created = await bridge(input, {
      chunks: [encoded.subarray(0, split), encoded.subarray(split)],
    });
    expect(created.status).toBe(202);
    const reference = AgentRunReference.parse(created.body);
    const stored = await prisma.inAppAgentRun.findUniqueOrThrow({
      where: { id_projectId: { id: reference.runId, projectId: f.projectId } },
    });
    expect(stored.triggeredByUserId).toBe(f.userId);
    expect(stored.request).toMatchObject({
      context: expect.arrayContaining([
        { description: "langfuse_user_id", value: f.userId },
      ]),
    });
    const event = await prisma.inAppAgentEvent.findFirst({
      where: {
        projectId: f.projectId,
        runId: reference.runId,
        type: EventType.RUN_STARTED,
      },
    });
    expect(event?.event).toMatchObject({
      input: { messages: [{ content: input.message }] },
    });
    expect((await bridge(input)).body).toEqual(created.body);
    expect(
      (await bridge({ ...input, message: "Different question" })).status,
    ).toBe(409);
  });

  it("lists eligible projects from current memberships and rejects access revoked after selection", async () => {
    const f = await linkedFixture();
    const second = await prisma.project.create({
      data: { name: "Second allowed project", orgId: f.orgId },
    });
    const hidden = await prisma.project.create({
      data: {
        name: "No access",
        orgId: f.orgId,
        projectMembers: {
          create: {
            userId: f.userId,
            orgMembershipId: f.membership.id,
            role: "NONE",
          },
        },
      },
    });
    await prisma.project.create({
      data: { name: "Deleted", orgId: f.orgId, deletedAt: new Date() },
    });
    const list = await bridge({
      operation: "projects",
      teamId,
      slackUserId: f.slackUserId,
    });
    expect(list.body.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: f.projectId }),
        expect.objectContaining({ id: second.id }),
      ]),
    );
    expect(list.body.projects).toHaveLength(2);
    const input = {
      operation: "start",
      ...f.identity,
      message: "Inspect traces",
      idempotencyKey: "membership",
    };
    expect((await bridge({ ...input, projectId: hidden.id })).status).toBe(403);
    expect((await bridge({ ...input, projectId: second.id })).status).toBe(202);
    const created = await bridge(input);
    expect(created.status).toBe(202);
    const reference = AgentRunReference.parse(created.body);
    await prisma.organizationMembership.delete({
      where: { id: f.membership.id },
    });
    expect(
      (
        await bridge({
          operation: "projects",
          teamId,
          slackUserId: f.slackUserId,
        })
      ).body.projects,
    ).toEqual([]);
    expect((await bridge(input)).status).toBe(403);
    for (const operation of ["get", "cancel"]) {
      expect(
        (await bridge({ operation, ...f.identity, runId: reference.runId }))
          .status,
      ).toBe(403);
    }
  });

  it("isolates link generations and personal conversations, revokes pending codes, and cancels tool approvals", async () => {
    const f = await linkedFixture();
    const input = {
      operation: "start",
      ...f.identity,
      message: "Inspect traces",
      idempotencyKey: "isolation",
    };
    const created = await bridge(input);
    const reference = AgentRunReference.parse(created.body);
    await prisma.inAppAgentRun.update({
      where: { id_projectId: { id: reference.runId, projectId: f.projectId } },
      data: { status: "AWAITING_APPROVAL" },
    });
    const cancelled = await bridge({
      operation: "get",
      ...f.identity,
      runId: reference.runId,
    });
    expect(GetAgentRunResponse.parse(cancelled.body).status).toBe("CANCELLED");
    await prisma.inAppAgentConversation.update({
      where: {
        id_projectId: { id: reference.conversationId, projectId: f.projectId },
      },
      data: { alwaysAllowedTools: ["langfuse_createTextPrompt"] },
    });
    expect(
      (
        await bridge({
          ...input,
          conversationId: reference.conversationId,
          idempotencyKey: "with-grants",
        })
      ).status,
    ).toBe(403);
    const privateChat = await prisma.inAppAgentConversation.create({
      data: {
        projectId: f.projectId,
        createdByUserId: f.userId,
        id: `personal-${randomUUID()}`,
      },
    });
    expect(
      (
        await bridge({
          ...input,
          conversationId: privateChat.id,
          idempotencyKey: "private",
        })
      ).status,
    ).toBe(404);
    const pending = await f.caller.createCode();
    const intruder = await fixture();
    await expect(
      browser(intruder.userId).disconnect({ linkId: f.linkId }),
    ).rejects.toThrow("Slack connection not found");
    await f.caller.disconnect({ linkId: f.linkId });
    expect(
      (
        await bridge({
          operation: "connect",
          teamId,
          slackUserId: f.slackUserId,
          code: pending.code,
        })
      ).status,
    ).toBe(403);
    const newCode = await f.caller.createCode();
    const reconnected = await bridge({
      operation: "connect",
      teamId,
      slackUserId: f.slackUserId,
      code: newCode.code,
    });
    const newLinkId = z.string().parse(reconnected.body.linkId);
    expect(newLinkId).not.toBe(f.linkId);
    expect(
      (
        await bridge({
          operation: "get",
          ...f.identity,
          runId: reference.runId,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await bridge({
          operation: "get",
          ...f.identity,
          linkId: newLinkId,
          runId: reference.runId,
        })
      ).status,
    ).toBe(404);
  });
});
