import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  createInAppAgentToolPolicy,
  filterInAppAgentAvailableLangfuseMcpTools,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { prisma } from "@langfuse/shared/src/db";
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
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSessionForRequest: authMocks.getServerAuthSessionForRequest,
}));

vi.mock("@/src/features/entitlements/server/hasEntitlement", () => ({
  hasEntitlement: entitlementMocks.hasEntitlement,
}));

describe("in-app agent public API route auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementMocks.hasEntitlement.mockReturnValue(true);
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
      featureFlags: {},
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
