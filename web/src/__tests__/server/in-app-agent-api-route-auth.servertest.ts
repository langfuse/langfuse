import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  getInAppAgentPendingToolApprovalRedisKey,
  storePendingToolApproval,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import type { InAppAgentToolApprovalRequest } from "@/src/ee/features/in-app-agent/schema";
import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
  redis,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { randomUUID } from "crypto";
import { beforeEach, vi } from "vitest";
import { z } from "zod";

const authMocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getAuthOptions: vi.fn().mockResolvedValue({}),
}));

const entitlementMocks = vi.hoisted(() => ({
  hasEntitlement: vi.fn(() => true),
}));

const rateLimitMocks = vi.hoisted(() => ({
  rateLimitRequest: vi.fn(),
}));

const agentMocks = vi.hoisted(() => ({
  createAgUiStream: vi.fn(),
}));

const langfuseClientMocks = vi.hoisted(() => ({
  getLangfuseClient: vi.fn(() => ({})),
}));

vi.mock("next-auth", () => ({
  getServerSession: authMocks.getServerSession,
}));

vi.mock("@/src/server/auth", () => ({
  getAuthOptions: authMocks.getAuthOptions,
}));

vi.mock("@/src/features/entitlements/server/hasEntitlement", () => ({
  hasEntitlement: entitlementMocks.hasEntitlement,
}));

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: rateLimitMocks.rateLimitRequest,
    }),
  },
  createHttpHeaderFromRateLimit: () => ({
    "Retry-After": 60,
    "X-RateLimit-Limit": 2,
    "X-RateLimit-Remaining": 0,
    "X-RateLimit-Reset": "soon",
  }),
}));

vi.mock("@/src/ee/features/in-app-agent/server/agent", () => ({
  createAgUiStream: agentMocks.createAgUiStream,
}));

vi.mock("@/src/features/natural-language-filters/server/utils", () => ({
  getLangfuseClient: langfuseClientMocks.getLangfuseClient,
}));

describe("in-app agent public API route auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentMocks.createAgUiStream.mockResolvedValue(new ReadableStream());
    langfuseClientMocks.getLangfuseClient.mockReturnValue({});
    rateLimitMocks.rateLimitRequest.mockResolvedValue({
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
    });
  });

  it("rejects in-app agent keys when allowInAppAgentKey is false", async () => {
    const res = await callRoute({ allowInAppAgentKey: false });

    expect(res.statusCode).toBe(401);
    expect(res._getJSONData()).toEqual({
      message:
        "Access denied - in-app agent keys are not allowed for this endpoint",
    });
  });

  it("allows in-app agent keys when allowInAppAgentKey is true", async () => {
    const res = await callRoute({ allowInAppAgentKey: true });

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({ ok: true });
  });

  it("passes validated resume forwarded props without requiring a user message", async () => {
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const originalAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
    const originalAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;

    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = "pk-lf-test";
    (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = "sk-lf-test";

    const { org, project } = await createOrgProjectAndApiKey();
    const userId = randomUUID();
    const conversationId = `conversation-${randomUUID()}`;
    const forwardedProps = {
      command: {
        resume: {
          approved: true,
          approvalRequest: {
            type: "tool_approval_request",
            toolCallId: "tool-call-1",
            toolName: "langfuse_upsertDataset",
            args: { name: "Approved dataset" },
            runId: "suspended-run-1",
          },
        },
      },
    };

    try {
      await prisma.organization.update({
        where: { id: org.id },
        data: { aiFeaturesEnabled: true },
      });
      await prisma.user.create({
        data: {
          id: userId,
          email: `in-app-agent-${userId}@example.com`,
          name: "In-app Agent User",
        },
      });
      authMocks.getServerSession.mockResolvedValue(
        createInAppAgentSession({
          orgId: org.id,
          projectId: project.id,
          userId,
        }),
      );
      const pendingApprovalKey = await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });

      const { default: handler } =
        await import("@/src/ee/features/in-app-agent/server/handler");
      const response = await handler(
        new Request("http://localhost/api/in-app-agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId: conversationId,
            runId: "client-run-1",
            messages: [],
            tools: [],
            context: [],
            state: {
              type: "existingConversation",
              projectId: project.id,
              conversationId,
            },
            forwardedProps,
          }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(redis?.get(pendingApprovalKey)).resolves.toBeNull();
      expect(agentMocks.createAgUiStream).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            messages: [],
            forwardedProps,
          }),
          options: expect.objectContaining({
            langfuseMcp: expect.objectContaining({
              runSecret: expect.any(String),
            }),
          }),
        }),
      );
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
      (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
      (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY =
        originalAiFeaturesPublicKey;
      (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY =
        originalAiFeaturesSecretKey;
    }
  });

  it("rejects forged resume forwarded props without a pending approval", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();

      const { response } = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        forwardedProps,
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid forwarded props",
      });
      expect(agentMocks.createAgUiStream).not.toHaveBeenCalled();
    });
  });

  it("rejects mutated resume forwarded props without consuming the pending approval", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();
      const pendingApprovalKey = await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });

      const { response } = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        forwardedProps: {
          command: {
            resume: {
              ...forwardedProps.command.resume,
              approvalRequest: {
                ...forwardedProps.command.resume.approvalRequest,
                toolName: "langfuse_deleteDataset",
              },
            },
          },
        },
      });

      expect(response.status).toBe(400);
      await expect(redis?.get(pendingApprovalKey)).resolves.not.toBeNull();
      expect(agentMocks.createAgUiStream).not.toHaveBeenCalled();

      await redis?.del(pendingApprovalKey);
    });
  });

  it("rejects replayed resume forwarded props after approval consumption", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();
      await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });

      const firstAttempt = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        forwardedProps,
      });
      const secondAttempt = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        forwardedProps,
      });

      expect(firstAttempt.response.status).toBe(200);
      expect(secondAttempt.response.status).toBe(400);
      expect(agentMocks.createAgUiStream).toHaveBeenCalledTimes(1);
    });
  });

  it("prevents concurrent resume attempts from starting the same approved tool call twice", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project, userId } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();
      await prisma.inAppAgentConversation.create({
        data: {
          id: conversationId,
          projectId: project.id,
          createdByUserId: userId,
          title: "Concurrent resume test",
        },
      });
      await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });

      agentMocks.createAgUiStream.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(new ReadableStream()), 25);
          }),
      );

      const attempts = await Promise.all([
        callInAppAgentRoute({
          projectId: project.id,
          conversationId,
          runId: "client-run-concurrent-1",
          forwardedProps,
        }),
        callInAppAgentRoute({
          projectId: project.id,
          conversationId,
          runId: "client-run-concurrent-2",
          forwardedProps,
        }),
      ]);

      expect(attempts.map(({ response }) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(agentMocks.createAgUiStream).toHaveBeenCalledTimes(1);
      await expect(
        redis?.get(
          getInAppAgentPendingToolApprovalRedisKey({
            projectId: project.id,
            conversationId,
            toolCallId:
              forwardedProps.command.resume.approvalRequest.toolCallId,
          }),
        ),
      ).resolves.toBeNull();
    });
  });

  it("keeps pending approval retryable when resumed stream initialization fails", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();
      const pendingApprovalKey = await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });

      agentMocks.createAgUiStream.mockRejectedValueOnce(
        new Error("stream init failed"),
      );

      await expect(
        callInAppAgentRoute({
          projectId: project.id,
          conversationId,
          runId: "client-run-failed",
          forwardedProps,
        }),
      ).rejects.toThrow("stream init failed");
      await expect(redis?.get(pendingApprovalKey)).resolves.not.toBeNull();

      const retry = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        runId: "client-run-retry",
        forwardedProps,
      });

      expect(retry.response.status).toBe(200);
      await expect(redis?.get(pendingApprovalKey)).resolves.toBeNull();
      expect(agentMocks.createAgUiStream).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps pending approval retryable when a resumed stream errors after creation", async () => {
    await withInAppAgentCloudEnv(async () => {
      const { project } = await setupInAppAgentProjectSession();
      const conversationId = `conversation-${randomUUID()}`;
      const forwardedProps = createResumeForwardedProps();
      const pendingApprovalKey = await seedPendingToolApproval({
        projectId: project.id,
        conversationId,
        approvalRequest: forwardedProps.command.resume.approvalRequest,
      });
      let streamErrorHandled: Promise<void> | undefined;

      agentMocks.createAgUiStream.mockImplementationOnce((params) => {
        streamErrorHandled = new Promise((resolve, reject) =>
          setTimeout(() => {
            Promise.resolve(
              params.options.onError?.(new Error("stream failed")),
            )
              .then(() => resolve())
              .catch(reject);
          }, 0),
        );

        return new ReadableStream();
      });

      const { response } = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        runId: "client-run-post-stream-failed",
        forwardedProps,
      });

      expect(response.status).toBe(200);
      await streamErrorHandled;
      await expect(redis?.get(pendingApprovalKey)).resolves.not.toBeNull();

      const retry = await callInAppAgentRoute({
        projectId: project.id,
        conversationId,
        runId: "client-run-post-stream-retry",
        forwardedProps,
      });

      expect(retry.response.status).toBe(200);
      await expect(redis?.get(pendingApprovalKey)).resolves.toBeNull();
      expect(agentMocks.createAgUiStream).toHaveBeenCalledTimes(2);
    });
  });

  it("returns 429 when an in-app agent run exceeds the rate limit", async () => {
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const originalAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
    const originalAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;

    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = "pk-lf-test";
    (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = "sk-lf-test";

    const { org, project } = await createOrgProjectAndApiKey();

    try {
      await prisma.organization.update({
        where: { id: org.id },
        data: { aiFeaturesEnabled: true },
      });
      const session = createInAppAgentSession({
        orgId: org.id,
        projectId: project.id,
      });
      authMocks.getServerSession.mockResolvedValue(session);
      rateLimitMocks.rateLimitRequest.mockResolvedValue({
        isRateLimited: () => true,
        res: {
          resource: "in-app-agent-run",
          scope: {
            orgId: org.id,
            plan: "cloud:team",
            projectId: project.id,
            accessLevel: "project",
            rateLimitOverrides: [],
            apiKeyId: "in-app-agent-session",
            publicKey: "in-app-agent-session",
            isIngestionSuspended: false,
          },
          points: 2,
          remainingPoints: 0,
          msBeforeNext: 60_000,
          consumedPoints: 2,
          isFirstInDuration: false,
        },
      });

      const { default: handler } =
        await import("@/src/ee/features/in-app-agent/server/handler");
      const response = await handler(
        new Request("http://localhost/api/in-app-agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId: "conversation-1",
            runId: "client-run-1",
            messages: [{ id: "message-1", role: "user", content: "hello" }],
            tools: [],
            context: [],
            state: {
              type: "newConversation",
              projectId: project.id,
            },
            forwardedProps: {},
          }),
        }),
      );

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({
        error: "Rate limit exceeded",
      });
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(rateLimitMocks.rateLimitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: org.id,
          projectId: project.id,
        }),
        "in-app-agent-run",
      );
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
      (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
      (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY =
        originalAiFeaturesPublicKey;
      (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY =
        originalAiFeaturesSecretKey;
    }
  });

  it("rate-limits instance admins who are not project members", async () => {
    const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const originalAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
    const originalAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;

    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
    (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = "pk-lf-test";
    (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = "sk-lf-test";

    const { org, project } = await createOrgProjectAndApiKey();

    try {
      await prisma.organization.update({
        where: { id: org.id },
        data: { aiFeaturesEnabled: true, cloudConfig: { plan: "Team" } },
      });
      const session = createInAppAgentSession({
        orgId: org.id,
        projectId: project.id,
        admin: true,
        includeProjectMembership: false,
      });
      authMocks.getServerSession.mockResolvedValue(session);
      rateLimitMocks.rateLimitRequest.mockResolvedValue({
        isRateLimited: () => true,
        res: {
          resource: "in-app-agent-run",
          scope: {
            orgId: org.id,
            plan: "cloud:team",
            projectId: project.id,
            accessLevel: "project",
            rateLimitOverrides: [],
            apiKeyId: "in-app-agent-session",
            publicKey: "in-app-agent-session",
            isIngestionSuspended: false,
          },
          points: 2,
          remainingPoints: 0,
          msBeforeNext: 60_000,
          consumedPoints: 2,
          isFirstInDuration: false,
        },
      });

      const { default: handler } =
        await import("@/src/ee/features/in-app-agent/server/handler");
      const response = await handler(
        new Request("http://localhost/api/in-app-agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            threadId: "conversation-1",
            runId: "client-run-1",
            messages: [{ id: "message-1", role: "user", content: "hello" }],
            tools: [],
            context: [],
            state: {
              type: "newConversation",
              projectId: project.id,
            },
            forwardedProps: {},
          }),
        }),
      );

      expect(response.status).toBe(429);
      expect(rateLimitMocks.rateLimitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: org.id,
          projectId: project.id,
          plan: "cloud:team",
        }),
        "in-app-agent-run",
      );
    } finally {
      (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
      (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
      (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY =
        originalAiFeaturesPublicKey;
      (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY =
        originalAiFeaturesSecretKey;
    }
  });
});

function createInAppAgentSession(params: {
  orgId: string;
  projectId: string;
  userId?: string;
  admin?: boolean;
  includeProjectMembership?: boolean;
}): Session {
  const includeProjectMembership = params.includeProjectMembership ?? true;

  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    environment: { enableExperimentalFeatures: false },
    user: {
      id: params.userId ?? "user-1",
      name: "Test User",
      email: "test@example.com",
      image: null,
      admin: params.admin ?? false,
      featureFlags: {},
      organizations: includeProjectMembership
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
  const originalBedrockModel = env.LANGFUSE_AWS_BEDROCK_MODEL;
  const originalAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
  const originalAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;

  (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "test-model";
  (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = "pk-lf-test";
  (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = "sk-lf-test";

  try {
    return await run();
  } finally {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalBedrockModel;
    (env as any).LANGFUSE_AI_FEATURES_PUBLIC_KEY = originalAiFeaturesPublicKey;
    (env as any).LANGFUSE_AI_FEATURES_SECRET_KEY = originalAiFeaturesSecretKey;
  }
}

async function setupInAppAgentProjectSession() {
  const { org, project } = await createOrgProjectAndApiKey();
  const userId = randomUUID();

  await prisma.organization.update({
    where: { id: org.id },
    data: { aiFeaturesEnabled: true },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `in-app-agent-${userId}@example.com`,
      name: "In-app Agent User",
    },
  });
  authMocks.getServerSession.mockResolvedValue(
    createInAppAgentSession({ orgId: org.id, projectId: project.id, userId }),
  );

  return { org, project, userId };
}

function createResumeForwardedProps() {
  return {
    command: {
      resume: {
        approved: true,
        approvalRequest: {
          type: "tool_approval_request" as const,
          toolCallId: `tool-call-${randomUUID()}`,
          toolName: "langfuse_upsertDataset",
          args: { name: "Approved dataset" },
          runId: `suspended-run-${randomUUID()}`,
        },
      },
    },
  };
}

async function callInAppAgentRoute(params: {
  projectId: string;
  conversationId: string;
  runId?: string;
  forwardedProps: ReturnType<typeof createResumeForwardedProps>;
}) {
  const { default: handler } =
    await import("@/src/ee/features/in-app-agent/server/handler");
  const response = await handler(
    new Request("http://localhost/api/in-app-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: params.conversationId,
        runId: params.runId ?? "client-run-1",
        messages: [],
        tools: [],
        context: [],
        state: {
          type: "existingConversation",
          projectId: params.projectId,
          conversationId: params.conversationId,
        },
        forwardedProps: params.forwardedProps,
      }),
    }),
  );

  return { response };
}

async function seedPendingToolApproval(params: {
  projectId: string;
  conversationId: string;
  approvalRequest: InAppAgentToolApprovalRequest;
}) {
  if (!redis) {
    throw new Error("Redis is required for pending approval tests");
  }

  const key = getInAppAgentPendingToolApprovalRedisKey({
    projectId: params.projectId,
    conversationId: params.conversationId,
    toolCallId: params.approvalRequest.toolCallId,
  });

  await storePendingToolApproval(params);

  return key;
}
