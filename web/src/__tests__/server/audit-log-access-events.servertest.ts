import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  QueueJobs,
} from "@langfuse/shared/src/server";

const mockAdd = vi.fn();

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const originalModule = await importOriginal<Record<string, unknown>>();
  return {
    ...originalModule,
    AuditLogQueue: {
      getInstance: vi.fn(() => ({ add: mockAdd })),
    },
  };
});

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  ACCESS_EVENT_PARAMS_MAX_CHARS,
  serializeAccessEventParams,
} from "@/src/features/audit-logs/accessEvents";

const buildSession = (args: {
  userId: string;
  orgId: string;
  projectId: string;
}): Session => ({
  expires: "1",
  user: {
    id: args.userId,
    canCreateOrganizations: true,
    name: "Access Test User",
    organizations: [
      {
        id: args.orgId,
        name: "Access Test Org",
        role: "MEMBER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: args.projectId,
            role: "VIEWER",
            retentionDays: 30,
            deletedAt: null,
            name: "Access Test Project",
            hasTraces: true,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
      searchBar: false,
      v4BetaToggleVisible: false,
      observationEvals: false,
      experimentsV4Enabled: false,
    },
    admin: false,
  },
  environment: {} as Session["environment"],
});

const createCaller = (session: Session | null) => {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

const enqueuedPayloads = () =>
  mockAdd.mock.calls.map(
    (call) =>
      (call[1] as { payload: Record<string, unknown> }).payload as Record<
        string,
        unknown
      >,
  );

describe("tRPC access events", () => {
  let orgId: string;
  let projectId: string;
  let userId: string;
  let traceId: string;

  beforeEach(async () => {
    mockAdd.mockReset();
    mockAdd.mockResolvedValue(undefined);

    const created = await createOrgProjectAndApiKey();
    orgId = created.orgId;
    projectId = created.projectId;
    userId = randomUUID();
    traceId = randomUUID();
    await createTracesCh([
      createTrace({ id: traceId, project_id: projectId, name: "access-me" }),
    ]);
  });

  it("records a single read through a trace getter and derives the org from the membership", async () => {
    const caller = createCaller(buildSession({ userId, orgId, projectId }));

    const trace = await caller.traces.byId({ traceId, projectId });
    expect(trace?.id).toBe(traceId);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toBe(QueueJobs.AuditLogJob);
    const payload = enqueuedPayloads()[0];
    expect(payload).toMatchObject({
      org_id: orgId,
      project_id: projectId,
      event_kind: "access",
      actor_type: "USER",
      user_id: userId,
      api_key_id: "",
      user_org_role: "MEMBER",
      user_project_role: "VIEWER",
      resource_type: "trace",
      resource_id: traceId,
      action: "read",
      surface: "trpc",
      route: "traces.byId",
      result_count: 1,
      before: "",
      after: "",
    });
    expect(JSON.parse(payload.params as string)).toMatchObject({
      traceId,
      projectId,
    });
    expect(typeof payload.id).toBe("string");
    expect(typeof payload.timestamp).toBe("string");
  });

  it("records a list through a project procedure with the returned row count", async () => {
    const caller = createCaller(buildSession({ userId, orgId, projectId }));

    const result = await caller.traces.all({
      projectId,
      filter: [],
      searchQuery: null,
      searchType: ["id"],
      orderBy: { column: "timestamp", order: "DESC" },
      page: 0,
      limit: 50,
    });
    expect(result.traces.map((t) => t.id)).toContain(traceId);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const payload = enqueuedPayloads()[0];
    expect(payload).toMatchObject({
      org_id: orgId,
      project_id: projectId,
      event_kind: "access",
      user_id: userId,
      user_org_role: "MEMBER",
      user_project_role: "VIEWER",
      resource_type: "trace",
      resource_id: "",
      action: "list",
      route: "traces.all",
      result_count: result.traces.length,
    });
    expect(JSON.parse(payload.params as string)).toMatchObject({
      projectId,
      limit: 50,
      page: 0,
    });
  });

  it("ignores procedures that are not on the allowlist", async () => {
    const caller = createCaller(buildSession({ userId, orgId, projectId }));

    await caller.traces.countAll({
      projectId,
      filter: [],
      searchQuery: null,
      searchType: ["id"],
      orderBy: null,
    });

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("does not record reads that fail", async () => {
    const caller = createCaller(buildSession({ userId, orgId, projectId }));

    await expect(
      caller.traces.byId({ traceId: randomUUID(), projectId }),
    ).rejects.toThrow();

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("does not record anonymous views of public traces", async () => {
    const publicTraceId = randomUUID();
    await createTracesCh([
      createTrace({ id: publicTraceId, project_id: projectId, public: true }),
    ]);
    const caller = createCaller(null);

    const trace = await caller.traces.byId({
      traceId: publicTraceId,
      projectId,
    });
    expect(trace?.id).toBe(publicTraceId);

    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("fails open when the queue rejects", async () => {
    mockAdd.mockRejectedValueOnce(new Error("redis down"));
    const caller = createCaller(buildSession({ userId, orgId, projectId }));

    const trace = await caller.traces.byId({ traceId, projectId });

    expect(trace?.id).toBe(traceId);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});

describe("serializeAccessEventParams", () => {
  it("keeps small inputs verbatim", () => {
    expect(serializeAccessEventParams({ a: 1 })).toBe('{"a":1}');
    expect(serializeAccessEventParams(undefined)).toBe("");
  });

  it("replaces oversized inputs with a truncated preview", () => {
    const big = { filter: "x".repeat(ACCESS_EVENT_PARAMS_MAX_CHARS * 2) };
    const parsed = JSON.parse(serializeAccessEventParams(big));
    expect(parsed.truncated).toBe(true);
    expect(parsed.originalLength).toBe(JSON.stringify(big).length);
    expect(parsed.preview).toHaveLength(ACCESS_EVENT_PARAMS_MAX_CHARS);
  });
});
