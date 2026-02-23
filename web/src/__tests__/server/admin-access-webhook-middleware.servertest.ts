/** @jest-environment node */

import type { Session } from "next-auth";
import * as z from "zod/v4";

jest.mock("@/src/server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: jest.fn(),
}));

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
import { sendAdminAccessWebhook } from "@/src/server/adminAccessWebhook";
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
  const mockSendAdminAccessWebhook = jest.mocked(sendAdminAccessWebhook);
  const mockGetTraceById = jest.mocked(getTraceById);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTraceById.mockResolvedValue({
      id: "trace-id",
      input: "{}",
      output: "{}",
      public: false,
      sessionId: null,
    } as any);
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
    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "admin@langfuse.com",
      projectId,
      orgId,
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

    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "admin@langfuse.com",
      projectId,
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
    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "admin@langfuse.com",
      projectId,
    });
  });
});
