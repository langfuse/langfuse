import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
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
  admin?: boolean;
  includeProjectMembership?: boolean;
}): Session {
  const includeProjectMembership = params.includeProjectMembership ?? true;

  return {
    expires: new Date(Date.now() + 60_000).toISOString(),
    environment: { enableExperimentalFeatures: false },
    user: {
      id: "user-1",
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
