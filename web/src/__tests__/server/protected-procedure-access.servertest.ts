import type { Session } from "next-auth";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import * as z from "zod";
import { env } from "@/src/env.mjs";

vi.mock("@langfuse/shared/src/server", async () => {
  const originalModule = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    getTraceById: vi.fn(),
    getTraceByIdFromEventsTable: vi.fn(),
  };
});

import {
  createTRPCRouter,
  createInnerTRPCContext,
  protectedProjectProcedureWithoutTracing,
  protectedGetEventsTraceProcedure,
  protectedGetSessionProcedure,
} from "@/src/server/api/trpc";
import {
  getTraceById,
  getTraceByIdFromEventsTable,
} from "@langfuse/shared/src/server";

const middlewareTestRouter = createTRPCRouter({
  project: protectedProjectProcedureWithoutTracing
    .input(z.object({ projectId: z.string() }))
    .query(() => ({ ok: true })),
  eventsTrace: protectedGetEventsTraceProcedure
    .input(
      z.object({
        traceId: z.string(),
        projectId: z.string(),
        timestamp: z.date().optional(),
      }),
    )
    .query(({ ctx }) => ({ timestamp: ctx.trace?.timestamp })),
  session: protectedGetSessionProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(() => ({ ok: true })),
});

const staffSession = (
  projects: Array<{ id: string; name?: string }> = [],
): Session =>
  createSession({
    user: {
      id: "staff-user-id",
      email: "staff@langfuse.com",
      name: "Staff User",
    },
    organizations: [
      {
        id: "session-org-id",
        name: "Session Organization",
        role: "OWNER",
        supportAccess: false,
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name ?? "Project",
        })),
      },
    ],
  });

const createTestCaller = (params: {
  session: Session | null;
  projectOrgId?: string;
  traceSession?: { public: boolean } | null;
}) => {
  const mockPrisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        orgId: params.projectOrgId ?? "db-org-id",
      }),
    },
    traceSession: {
      findFirst: vi.fn().mockResolvedValue(
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

describe("protected procedure access", () => {
  const mockGetTraceById = vi.mocked(getTraceById);
  const mockGetTraceByIdFromEventsTable = vi.mocked(
    getTraceByIdFromEventsTable,
  );
  const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  const setWriteMode = (
    writeMode: typeof env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
  ) => {
    Object.assign(env, { LANGFUSE_MIGRATION_V4_WRITE_MODE: writeMode });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    setWriteMode("dual");
    mockGetTraceById.mockResolvedValue({
      id: "trace-id",
      input: "{}",
      output: "{}",
      public: false,
      sessionId: null,
    } as unknown as Awaited<ReturnType<typeof getTraceById>>);
    mockGetTraceByIdFromEventsTable.mockResolvedValue({
      id: "trace-id",
      input: null,
      output: null,
      public: true,
      sessionId: null,
      timestamp: new Date("2025-01-01T00:00:00.000Z"),
    } as unknown as Awaited<ReturnType<typeof getTraceByIdFromEventsTable>>);
  });

  afterAll(() => {
    setWriteMode(originalWriteMode);
  });

  it("authorizes a session member without loading the project row", async () => {
    const projectId = "member-project-id";
    const { caller, mockPrisma } = createTestCaller({
      session: staffSession([{ id: projectId }]),
    });

    await expect(caller.project({ projectId })).resolves.toEqual({ ok: true });
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled();
  });

  it("rejects non-members even when the session carries a legacy admin flag", async () => {
    const session = staffSession([]);
    const { caller } = createTestCaller({
      session: {
        ...session,
        user: { ...session.user, admin: true } as Session["user"],
      },
    });

    await expect(
      caller.project({ projectId: "project-id-non-member" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it.each(["dual", "events_only"] as const)(
    "uses a minimal canonical events trace lookup for authorization in %s mode",
    async (writeMode) => {
      setWriteMode(writeMode);
      const timestamp = new Date("2025-01-01T12:00:00.000Z");
      const { caller } = createTestCaller({
        session: null,
        traceSession: null,
      });

      const result = await caller.eventsTrace({
        traceId: "trace-id",
        projectId: "project-id",
        timestamp,
      });

      expect(mockGetTraceByIdFromEventsTable).toHaveBeenCalledWith({
        traceId: "trace-id",
        projectId: "project-id",
        excludeInputOutput: true,
        excludeMetadata: true,
        renderingProps: {
          truncated: true,
          shouldJsonParse: false,
        },
      });
      expect(mockGetTraceById).not.toHaveBeenCalled();
      expect(result.timestamp).toEqual(new Date("2025-01-01T00:00:00.000Z"));
    },
  );

  it("uses the legacy trace lookup for events procedures in legacy mode", async () => {
    setWriteMode("legacy");
    const timestamp = new Date("2025-01-01T12:00:00.000Z");
    mockGetTraceById.mockResolvedValueOnce({
      id: "trace-id",
      input: "{}",
      output: "{}",
      public: true,
      sessionId: null,
    } as unknown as Awaited<ReturnType<typeof getTraceById>>);
    const { caller } = createTestCaller({
      session: null,
      traceSession: null,
    });

    await caller.eventsTrace({
      traceId: "trace-id",
      projectId: "project-id",
      timestamp,
    });

    expect(mockGetTraceById).toHaveBeenCalledWith({
      traceId: "trace-id",
      projectId: "project-id",
      timestamp,
      fromTimestamp: undefined,
      renderingProps: {
        truncated: false,
        shouldJsonParse: false,
      },
    });
    expect(mockGetTraceByIdFromEventsTable).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access to a private events trace", async () => {
    mockGetTraceByIdFromEventsTable.mockResolvedValueOnce({
      id: "private-trace-id",
      input: null,
      output: null,
      public: false,
      sessionId: null,
      timestamp: new Date("2025-01-01T00:00:00.000Z"),
    } as unknown as Awaited<ReturnType<typeof getTraceByIdFromEventsTable>>);
    const { caller } = createTestCaller({ session: null });

    await expect(
      caller.eventsTrace({
        traceId: "private-trace-id",
        projectId: "project-id",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not resolve an events trace from another project", async () => {
    mockGetTraceByIdFromEventsTable.mockResolvedValueOnce(undefined);
    const { caller } = createTestCaller({ session: null });

    await expect(
      caller.eventsTrace({
        traceId: "trace-id",
        projectId: "wrong-project-id",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("loads the session row when a member opens a private session", async () => {
    const projectId = "session-project-id";
    const { caller, mockPrisma } = createTestCaller({
      session: staffSession([{ id: projectId }]),
      traceSession: { public: false },
    });

    await expect(
      caller.session({
        sessionId: "session-id",
        projectId,
      }),
    ).resolves.toEqual({ ok: true });
    expect(mockPrisma.traceSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-id",
        projectId,
      },
      select: {
        public: true,
      },
    });
  });

  it("rejects an empty session id before checking access", async () => {
    const { caller, mockPrisma } = createTestCaller({
      session: staffSession([]),
    });

    await expect(
      caller.session({ sessionId: "", projectId: "project-id" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockPrisma.traceSession.findFirst).not.toHaveBeenCalled();
  });
});
