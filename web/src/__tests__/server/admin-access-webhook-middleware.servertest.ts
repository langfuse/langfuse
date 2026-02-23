/** @jest-environment node */

import type { Session } from "next-auth";
import * as z from "zod/v4";
import { env } from "@/src/env.mjs";

jest.mock("@langfuse/shared/src/server", () => {
  const originalModule = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    getTraceById: jest.fn(),
  };
});

import {
  createTRPCRouter,
  createInnerTRPCContext,
  protectedProjectProcedureWithoutTracing,
  protectedGetTraceProcedure,
  protectedGetSessionProcedure,
} from "@/src/server/api/trpc";
import { resetAdminAccessWebhookCacheForTests } from "@/src/server/adminAccessWebhook";
import { getTraceById } from "@langfuse/shared/src/server";

const middlewareTestRouter = createTRPCRouter({
  project: protectedProjectProcedureWithoutTracing
    .input(z.object({ projectId: z.string() }))
    .query(() => ({ ok: true })),
  trace: protectedGetTraceProcedure
    .input(z.object({ traceId: z.string(), projectId: z.string() }))
    .query(() => ({ ok: true })),
  session: protectedGetSessionProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(() => ({ ok: true })),
});

const createAdminSession = (
  projects: Array<{ id: string; name?: string }> = [],
): Session => ({
  expires: "1",
  user: {
    id: "admin-user-id",
    email: "admin@langfuse.com",
    canCreateOrganizations: true,
    name: "Admin User",
    organizations: [
      {
        id: "session-org-id",
        name: "Session Organization",
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: projects.map((project) => ({
          id: project.id,
          role: "OWNER",
          retentionDays: 30,
          deletedAt: null,
          name: project.name ?? "Project",
        })),
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    },
    admin: true,
  },
  environment: {} as any,
});

const createTestCaller = (params: {
  session: Session;
  projectOrgId?: string;
  traceSession?: { public: boolean } | null;
}) => {
  const mockPrisma = {
    project: {
      findFirst: jest.fn().mockResolvedValue({
        orgId: params.projectOrgId ?? "db-org-id",
      }),
    },
    traceSession: {
      findFirst: jest.fn().mockResolvedValue(
        params.traceSession ?? {
          public: false,
        },
      ),
    },
  };

  const context = createInnerTRPCContext({
    session: params.session,
    headers: {},
  });

  return {
    caller: middlewareTestRouter.createCaller({
      ...context,
      prisma: mockPrisma as any,
    }),
    mockPrisma,
  };
};

describe("admin access webhook in tRPC authorization middleware", () => {
  const mockGetTraceById = jest.mocked(getTraceById);
  const originalWebhook = env.LANGFUSE_ADMIN_ACCESS_WEBHOOK;
  const originalRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeAll(() => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = "https://example.com/hook";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
  });

  beforeEach(() => {
    resetAdminAccessWebhookCacheForTests();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
    mockGetTraceById.mockResolvedValue({
      id: "trace-id",
      input: "{}",
      output: "{}",
      public: false,
      sessionId: null,
    } as any);
  });

  afterAll(() => {
    (env as any).LANGFUSE_ADMIN_ACCESS_WEBHOOK = originalWebhook;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
  });

  it("sends webhook when admin accesses a project they are not a member of", async () => {
    const projectId = "project-id-non-member";
    const orgId = "org-id-from-db";
    const { caller, mockPrisma } = createTestCaller({
      session: createAdminSession([]),
      projectOrgId: orgId,
    });

    await caller.project({ projectId });

    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
      select: {
        orgId: true,
      },
      where: {
        id: projectId,
        deletedAt: null,
      },
    });
    const fetchSpy = jest.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toMatchObject({
      email: "admin@langfuse.com",
      project: projectId,
      org: orgId,
    });
  });

  it("sends webhook when admin accesses trace in a project they are not a member of", async () => {
    const projectId = "trace-project-id";
    const { caller } = createTestCaller({
      session: createAdminSession([]),
    });

    await caller.trace({
      traceId: "trace-id",
      projectId,
    });

    const fetchSpy = jest.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toMatchObject({
      email: "admin@langfuse.com",
      project: projectId,
      org: null,
    });
  });

  it("sends webhook when admin accesses session in a project they are not a member of", async () => {
    const projectId = "session-project-id";
    const { caller, mockPrisma } = createTestCaller({
      session: createAdminSession([]),
      traceSession: { public: false },
    });

    await caller.session({
      sessionId: "session-id",
      projectId,
    });

    expect(mockPrisma.traceSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-id",
        projectId,
      },
      select: {
        public: true,
      },
    });
    const fetchSpy = jest.mocked(globalThis.fetch);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toMatchObject({
      email: "admin@langfuse.com",
      project: projectId,
      org: null,
    });
  });
});
