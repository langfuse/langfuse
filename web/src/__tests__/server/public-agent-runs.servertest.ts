import { randomUUID } from "node:crypto";
import { EventType } from "@ag-ui/core";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
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
