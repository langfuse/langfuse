import type { Session } from "next-auth";
import * as z from "zod";
import { TRPCError } from "@trpc/server";

// Session fixture sub-object types; casts keep the runtime fixtures unchanged
// while satisfying newer required fields on the session user type.
type SessionUser = NonNullable<Session["user"]>;
type SessionProjects = SessionUser["organizations"][number]["projects"];
type SessionFeatureFlags = SessionUser["featureFlags"];

const { recordTraceViewAuditMock } = vi.hoisted(() => ({
  recordTraceViewAuditMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/src/features/audit-logs/recordTraceViewAudit", () => ({
  recordTraceViewAudit: recordTraceViewAuditMock,
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const originalModule = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...originalModule,
    getTraceById: vi.fn(),
  };
});

import {
  createTRPCRouter,
  createInnerTRPCContext,
  protectedGetTraceProcedure,
} from "@/src/server/api/trpc";
import { getTraceById } from "@langfuse/shared/src/server";

// Register under the real `traces.*` / `events.*` paths so the middleware sees
// the same `opts.path` it gates on in production (AUDITED_TRACE_VIEW_PROCEDURES).
// All share enforceTraceAccess, but only the content-detail views are audited:
// `traces.byIdWithObservationsAndScores` (v3) and `events.byTraceId` (v4). The
// per-row table-cell fetch `traces.byId` must NOT be audited. That the audited
// paths still resolve to real prod procedures is guarded separately by
// recordTraceViewAudit.drift.servertest.ts.
const traceViewInput = z.object({
  traceId: z.string(),
  projectId: z.string(),
});
const middlewareTestRouter = createTRPCRouter({
  traces: createTRPCRouter({
    byId: protectedGetTraceProcedure
      .input(traceViewInput)
      .query(() => ({ ok: true })),
    byIdWithObservationsAndScores: protectedGetTraceProcedure
      .input(traceViewInput)
      .query(() => ({ ok: true })),
  }),
  events: createTRPCRouter({
    byTraceId: protectedGetTraceProcedure
      .input(traceViewInput)
      .query(() => ({ ok: true })),
  }),
});

const PROJECT_ID = "project-id";
const ORG_ID = "org-id";
const TRACE_ID = "trace-id";

const createMemberSession = (): Session => ({
  expires: "1",
  user: {
    id: "member-user-id",
    email: "member@langfuse.com",
    canCreateOrganizations: true,
    name: "Member User",
    organizations: [
      {
        id: ORG_ID,
        name: "Member Organization",
        role: "MEMBER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        projects: [
          {
            id: PROJECT_ID,
            role: "MEMBER",
            retentionDays: 30,
            deletedAt: null,
            name: "Project",
          },
        ] as SessionProjects,
      } as SessionUser["organizations"][number],
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    } as SessionFeatureFlags,
    admin: false,
  },
  environment: {} as any,
});

const createAdminNonMemberSession = (): Session => ({
  expires: "1",
  user: {
    id: "admin-user-id",
    email: "admin@langfuse.com",
    canCreateOrganizations: true,
    name: "Admin User",
    organizations: [],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    } as SessionFeatureFlags,
    admin: true,
  },
  environment: {} as any,
});

const createTestCaller = (params: {
  session: Session;
  dbProjectOrgId?: string | null;
  traceSession?: { public: boolean } | null;
}) => {
  const mockPrisma = {
    project: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          params.dbProjectOrgId === null
            ? null
            : { orgId: params.dbProjectOrgId ?? "db-org-id" },
        ),
    },
    traceSession: {
      findFirst: vi
        .fn()
        .mockResolvedValue(params.traceSession ?? { public: false }),
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

describe("trace-view audit in tRPC trace-access middleware", () => {
  const mockGetTraceById = vi.mocked(getTraceById);

  beforeEach(() => {
    vi.clearAllMocks();
    recordTraceViewAuditMock.mockResolvedValue(undefined);
    mockGetTraceById.mockResolvedValue({
      id: TRACE_ID,
      input: "{}",
      output: "{}",
      public: false,
      sessionId: null,
    } as any);
  });

  it("records a read audit when a project member views a trace", async () => {
    const { caller } = createTestCaller({ session: createMemberSession() });

    await caller.traces.byIdWithObservationsAndScores({
      traceId: TRACE_ID,
      projectId: PROJECT_ID,
    });

    expect(recordTraceViewAuditMock).toHaveBeenCalledTimes(1);
    expect(recordTraceViewAuditMock).toHaveBeenCalledWith({
      session: {
        user: { id: "member-user-id" },
        orgId: ORG_ID,
        orgRole: "MEMBER",
        projectId: PROJECT_ID,
        projectRole: "MEMBER",
      },
      resourceId: TRACE_ID,
    });
  });

  it("records a read audit for the v4 events-backed detail view (events.byTraceId)", async () => {
    // v4 beta fetches trace content via events.byTraceId, not
    // traces.byIdWithObservationsAndScores. It hits the same middleware and
    // must be audited too, or the audit guarantee silently fails for v4 users.
    const { caller } = createTestCaller({ session: createMemberSession() });

    await caller.events.byTraceId({
      traceId: TRACE_ID,
      projectId: PROJECT_ID,
    });

    expect(recordTraceViewAuditMock).toHaveBeenCalledTimes(1);
    expect(recordTraceViewAuditMock).toHaveBeenCalledWith({
      session: {
        user: { id: "member-user-id" },
        orgId: ORG_ID,
        orgRole: "MEMBER",
        projectId: PROJECT_ID,
        projectRole: "MEMBER",
      },
      resourceId: TRACE_ID,
    });
  });

  it("does NOT record an audit when a logged-in non-member views a public trace", async () => {
    // Access is granted because the trace is public, but there is no
    // member org to attribute and the user is not an admin, so there is no
    // actor to audit — the view must pass through without an audit row.
    mockGetTraceById.mockResolvedValue({
      id: TRACE_ID,
      input: "{}",
      output: "{}",
      public: true,
      sessionId: null,
    } as any);
    const nonMemberSession = createAdminNonMemberSession();
    nonMemberSession.user!.admin = false;
    const { caller } = createTestCaller({ session: nonMemberSession });

    await caller.traces.byIdWithObservationsAndScores({
      traceId: TRACE_ID,
      projectId: PROJECT_ID,
    });

    expect(recordTraceViewAuditMock).not.toHaveBeenCalled();
  });

  it("does NOT record an audit for traces.byId (table IO/metadata cell fetch)", async () => {
    // byId backs the per-row input/output/metadata cells in the traces table,
    // fired for every visible row on list render — auditing it is a false
    // positive. Only the full detail view counts as a view.
    const { caller } = createTestCaller({ session: createMemberSession() });

    await caller.traces.byId({ traceId: TRACE_ID, projectId: PROJECT_ID });

    expect(recordTraceViewAuditMock).not.toHaveBeenCalled();
  });

  it("records a read audit for an admin non-member, resolving the org from the db", async () => {
    const { caller, mockPrisma } = createTestCaller({
      session: createAdminNonMemberSession(),
      dbProjectOrgId: "db-org-id",
    });

    await caller.traces.byIdWithObservationsAndScores({
      traceId: TRACE_ID,
      projectId: PROJECT_ID,
    });

    // Admin org resolution happens off the request path, so wait for the
    // fire-and-forget chain to settle before asserting.
    await vi.waitFor(() =>
      expect(recordTraceViewAuditMock).toHaveBeenCalledTimes(1),
    );
    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
      select: { orgId: true },
      where: { id: PROJECT_ID, deletedAt: null },
    });
    expect(recordTraceViewAuditMock).toHaveBeenCalledWith({
      session: {
        user: { id: "admin-user-id" },
        orgId: "db-org-id",
        orgRole: "OWNER",
        projectId: PROJECT_ID,
        projectRole: "OWNER",
      },
      resourceId: TRACE_ID,
    });
  });

  it("does not record an audit when access is denied (non-member, non-admin, private trace)", async () => {
    // Non-admin, non-member session on a private trace → UNAUTHORIZED.
    const deniedSession = createAdminNonMemberSession();
    deniedSession.user!.admin = false;
    const { caller } = createTestCaller({ session: deniedSession });

    await expect(
      caller.traces.byIdWithObservationsAndScores({
        traceId: TRACE_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow(TRPCError);

    expect(recordTraceViewAuditMock).not.toHaveBeenCalled();
  });

  it("does not record an audit when the trace is not found", async () => {
    mockGetTraceById.mockResolvedValue(null as any);
    const { caller } = createTestCaller({ session: createMemberSession() });

    await expect(
      caller.traces.byIdWithObservationsAndScores({
        traceId: TRACE_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow(TRPCError);

    expect(recordTraceViewAuditMock).not.toHaveBeenCalled();
  });
});
