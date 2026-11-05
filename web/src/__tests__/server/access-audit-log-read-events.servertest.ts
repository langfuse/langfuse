import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { createMocks } from "node-mocks-http";
import waitForExpect from "wait-for-expect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as SharedServer from "@langfuse/shared/src/server";
import type * as ServerAuth from "@/src/server/auth";

const staging = vi.hoisted(() => ({ fail: false }));
const auth = vi.hoisted(() => ({ session: null as Session | null }));

// The events tables exist only after the ClickHouse dev-tables setup, which the
// azure and redis-cluster CI runs skip.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  return {
    ...actual,
    stageAuditLogEvents: async (
      ...args: Parameters<typeof actual.stageAuditLogEvents>
    ) => {
      if (staging.fail) throw new Error("staging unavailable");
      return actual.stageAuditLogEvents(...args);
    },
  };
});

vi.mock("@/src/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof ServerAuth>()),
  getServerAuthSession: async () => auth.session,
}));

import {
  BatchExportFileFormat,
  BatchExportStatus,
  BatchTableNames,
  Role,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  getTraceByIdFromEventsTable,
  BatchExportQueue,
} from "@langfuse/shared/src/server";
import getTraceHandler from "@/src/pages/api/public/traces/[traceId]";
import downloadTraceHandler from "@/src/pages/api/traces/[traceId]/download";
import observationIOFieldHandler from "@/src/pages/api/traces/[traceId]/observations/[observationId]/io/[field]";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

async function setupOrg(accessAuditLogEnabled: boolean) {
  const fixture = await createOrgProjectAndApiKey({ plan: "Enterprise" });
  await prisma.organization.update({
    where: { id: fixture.orgId },
    data: { accessAuditLogEnabled },
  });
  return fixture;
}

async function accessEvents(orgId: string) {
  const rows = await prisma.auditLogStaging.findMany({
    where: {
      AND: [
        { payload: { path: ["orgId"], equals: orgId } },
        { payload: { path: ["kind"], equals: "access" } },
      ],
    },
  });
  return rows.map((row) => row.payload as Record<string, unknown>);
}

type SessionParams = {
  userId: string;
  orgId: string;
  projectId: string;
  accessAuditLogEnabled: boolean;
  supportAccess?: boolean;
  /** false signs in a user who belongs to no organization. */
  member?: boolean;
  projectRole?: Role;
};

function userSession(params: SessionParams): Session {
  const membership: NonNullable<Session["user"]>["organizations"][number] = {
    id: params.orgId,
    name: "Access Audit Org",
    role: params.supportAccess ? Role.VIEWER : Role.MEMBER,
    supportAccess: params.supportAccess,
    plan: "cloud:enterprise",
    cloudConfig: undefined,
    metadata: {},
    aiFeaturesEnabled: false,
    aiTelemetryEnabled: false,
    accessAuditLogEnabled: params.accessAuditLogEnabled,
    projects: [
      {
        id: params.projectId,
        name: "Access Audit Project",
        role: params.projectRole ?? Role.VIEWER,
        retentionDays: null,
        deletedAt: null,
        hasTraces: true,
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
  };
  return {
    expires: "1",
    user: {
      id: params.userId,
      name: "Access Audit Reader",
      email: "reader@example.com",
      canCreateOrganizations: true,
      organizations: params.member === false ? [] : [membership],
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {} as any,
  };
}

function trpcCaller(params: SessionParams) {
  const ctx = createInnerTRPCContext({
    session: userSession(params),
    headers: {},
  });
  return appRouter.createCaller({ ...ctx, prisma });
}

async function seedEventsTrace(projectId: string) {
  const traceId = randomUUID();
  const rootId = randomUUID();
  const childId = randomUUID();
  const startTime = Date.now() * 1000;
  await createEventsCh([
    createEvent({
      id: rootId,
      span_id: rootId,
      trace_id: traceId,
      project_id: projectId,
      parent_span_id: "",
      start_time: startTime,
    }),
    createEvent({
      id: childId,
      span_id: childId,
      trace_id: traceId,
      project_id: projectId,
      parent_span_id: rootId,
      start_time: startTime,
    }),
  ]);
  await waitForExpect(async () => {
    const trace = await getTraceByIdFromEventsTable({ projectId, traceId });
    expect(trace?.id).toBe(traceId);
  });
  return { traceId, observationIds: [rootId, childId], startTime };
}

async function getTraceViaPublicApi(auth: string, traceId: string) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    headers: { authorization: auth },
    query: { traceId },
  });
  await getTraceHandler(req, res);
  return res;
}

afterEach(() => {
  staging.fail = false;
  auth.session = null;
});

describe("access events on GET /api/public/traces/{traceId}", () => {
  it("records the read with the API key as actor", async () => {
    const { orgId, projectId, auth } = await setupOrg(true);
    const trace = createTrace({ project_id: projectId });
    await createTracesCh([trace]);

    const res = await getTraceViaPublicApi(auth, trace.id);

    expect(res._getStatusCode()).toBe(200);
    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "access",
        projectId,
        surface: "public-api",
        route: "GET /api/public/traces/{traceId}",
        resourceType: "trace",
        resourceId: trace.id,
        action: "read",
        outcome: "success",
        actor: { type: "API_KEY", apiKeyId: expect.any(String) },
        resourceRefs: [`trace:${trace.id}`, `session:${trace.session_id}`],
      }),
    ]);
  });

  it("fails the read when the event cannot be recorded", async () => {
    const { orgId, projectId, auth } = await setupOrg(true);
    const trace = createTrace({ project_id: projectId });
    await createTracesCh([trace]);
    staging.fail = true;

    const res = await getTraceViaPublicApi(auth, trace.id);

    expect(res._getStatusCode()).toBe(500);
    expect(await accessEvents(orgId)).toEqual([]);
  });
});

describe("access events on tRPC scores.byId", () => {
  it("records the read with the score and the trace it is attached to", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const score = createTraceScore({ project_id: projectId });
    await createScoresCh([score]);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.scores.byId({ projectId, scoreId: score.id });

    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        surface: "trpc",
        route: "scores.byId",
        resourceType: "score",
        resourceId: score.id,
        action: "read",
        outcome: "success",
        resourceRefs: [`score:${score.id}`, `trace:${score.trace_id}`],
      }),
    ]);
  });

  it("stores the input as validated, without keys the procedure strips", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const score = createTraceScore({ project_id: projectId });
    await createScoresCh([score]);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.scores.byId({
      padding: "x".repeat(4096),
      projectId,
      scoreId: score.id,
    } as Parameters<typeof caller.scores.byId>[0]);

    const [event] = await accessEvents(orgId);
    expect(JSON.parse(event?.params as string)).toEqual({
      projectId,
      scoreId: score.id,
    });
  });

  it("records a read without an id no resource can have", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.scores.getScoreMetadataById({
      projectId,
      id: "s".repeat(801),
    });

    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        route: "scores.getScoreMetadataById",
        outcome: "success",
        resourceRefs: [],
      }),
    ]);
    expect(events[0]).not.toHaveProperty("resourceId");
  });
});

describe("access events on tRPC events.scoresForTrace", () => {
  it("records a read with an empty trace id without failing it", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await expect(
      caller.events.scoresForTrace({ projectId, traceId: "" }),
    ).resolves.toEqual([]);

    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        route: "events.scoresForTrace",
        outcome: "success",
        resourceRefs: [],
      }),
    ]);
  });
});

describe("refused tRPC reads", () => {
  it("records the id the route names, without params or ids no resource can have", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const scoreId = randomUUID();
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
      member: false,
    });

    await expect(
      caller.scores.getScoreMetadataById({
        projectId,
        id: scoreId,
        traceId: "t".repeat(801),
      } as Parameters<typeof caller.scores.getScoreMetadataById>[0]),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        route: "scores.getScoreMetadataById",
        resourceId: scoreId,
        outcome: "denied",
        resourceRefs: [`score:${scoreId}`],
      }),
    ]);
    expect(events[0]).not.toHaveProperty("params");
  });

  it("keeps the refusal when the event cannot be recorded", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
      member: false,
    });
    staging.fail = true;

    await expect(
      caller.scores.getScoreMetadataById({ projectId, id: randomUUID() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("access events on tRPC batchExport.create", () => {
  const exportInput = (projectId: string) => ({
    projectId,
    name: "trace export",
    query: { tableName: BatchTableNames.Traces, filter: null, orderBy: null },
    format: BatchExportFileFormat.CSV,
  });

  it("records the export with its params and destination", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
      projectRole: Role.MEMBER,
    });

    await caller.batchExport.create(exportInput(projectId));

    const exportRow = await prisma.batchExport.findFirstOrThrow({
      where: { projectId },
    });
    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        surface: "trpc",
        route: "batchExport.create",
        resourceType: "batchExport",
        resourceId: exportRow.id,
        action: "export",
        resourceRefs: [],
      }),
    ]);
    expect(JSON.parse(events[0]?.params as string)).toEqual({
      ...exportInput(projectId),
      destination: "batch-export",
    });
  });

  it("fails the export without queueing it when the event cannot be recorded", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
      projectRole: Role.MEMBER,
    });
    const add = vi.spyOn(BatchExportQueue.getInstance()!, "add");
    staging.fail = true;

    try {
      await expect(
        caller.batchExport.create(exportInput(projectId)),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(add).not.toHaveBeenCalled();
    } finally {
      add.mockRestore();
    }
    const exportRow = await prisma.batchExport.findFirstOrThrow({
      where: { projectId },
    });
    expect(exportRow.status).toBe(BatchExportStatus.FAILED);
  });
});

const maybe = eventsTableAvailable ? describe : describe.skip;

maybe("access events on trace and observation downloads", () => {
  it("records a trace download with its row count", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId } = await seedEventsTrace(projectId);
    auth.session = userSession({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { traceId, projectId },
    });

    await downloadTraceHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        surface: "internal-api",
        route: "GET /api/traces/{traceId}/download",
        resourceType: "trace",
        resourceId: traceId,
        action: "download",
        resourceRefs: [`trace:${traceId}`],
        resultCount: 2,
      }),
    ]);
    expect(JSON.parse(events[0]?.params as string)).toEqual({
      traceId,
      projectId,
      destination: "download",
    });
  });

  it("records an observation IO field download before streaming it", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId, observationIds, startTime } =
      await seedEventsTrace(projectId);
    const observationId = observationIds[0]!;
    auth.session = userSession({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {
        traceId,
        observationId,
        field: "metadata",
        projectId,
        startTime: new Date(startTime / 1000).toISOString(),
      },
    });

    await observationIOFieldHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        surface: "internal-api",
        route:
          "GET /api/traces/{traceId}/observations/{observationId}/io/{field}",
        resourceType: "observation",
        resourceId: observationId,
        action: "download",
        resourceRefs: [`observation:${observationId}`, `trace:${traceId}`],
        resultCount: 1,
      }),
    ]);
  });
});

maybe("access events on tRPC events.all", () => {
  it("records the list with every returned observation and its trace", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId, observationIds } = await seedEventsTrace(projectId);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.events.all({
      projectId,
      filter: [],
      searchQuery: null,
      searchType: [],
      page: 0,
      limit: 50,
      orderBy: null,
    });

    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        route: "events.all",
        resourceType: "observation",
        action: "list",
        resultCount: 2,
      }),
    ]);
    expect(events[0]).not.toHaveProperty("resourceId");
    expect(events[0]?.resourceRefs).toEqual(
      expect.arrayContaining([
        `trace:${traceId}`,
        ...observationIds.map((id) => `observation:${id}`),
      ]),
    );
  });
});

maybe("access events on tRPC experiments.batchIO", () => {
  it("records the read with the run behind every returned output", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const experimentId = randomUUID();
    const itemId = randomUUID();
    const traceId = randomUUID();
    const rootId = randomUUID();
    await createEventsCh([
      createEvent({
        id: rootId,
        span_id: rootId,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: "",
        experiment_id: experimentId,
        experiment_name: "experiment",
        experiment_item_id: itemId,
        experiment_item_root_span_id: rootId,
        start_time: Date.now() * 1000,
      }),
    ]);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.experiments.batchIO({
      projectId,
      itemIds: [itemId],
      baseExperimentId: experimentId,
      compExperimentIds: [],
    });

    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        route: "experiments.batchIO",
        resultCount: 1,
        resourceRefs: [`observation:${rootId}`, `trace:${traceId}`],
      }),
    ]);
  });
});

maybe("access events on tRPC events.byTraceId", () => {
  it("records the read with the user, the trace and its observations", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId, observationIds } = await seedEventsTrace(projectId);
    const userId = randomUUID();
    const caller = trpcCaller({
      userId,
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });

    await caller.events.byTraceId({ projectId, traceId });

    const events = await accessEvents(orgId);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "access",
        projectId,
        surface: "trpc",
        route: "events.byTraceId",
        resourceId: traceId,
        resultCount: 2,
        actor: expect.objectContaining({
          type: "USER",
          userId,
          orgRole: Role.MEMBER,
          projectRole: Role.VIEWER,
        }),
      }),
    ]);
    expect(events[0]?.resourceRefs).toEqual(
      expect.arrayContaining([
        `trace:${traceId}`,
        ...observationIds.map((id) => `observation:${id}`),
      ]),
    );
    expect(events[0]?.actor).not.toHaveProperty("supportAccess");
  });

  it("records nothing for an org that has not opted in", async () => {
    const { orgId, projectId } = await setupOrg(false);
    const { traceId } = await seedEventsTrace(projectId);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: false,
    });

    await caller.events.byTraceId({ projectId, traceId });

    expect(await accessEvents(orgId)).toEqual([]);
  });

  it("records a support access read as such in an org that has not opted in", async () => {
    const { orgId, projectId } = await setupOrg(false);
    const { traceId } = await seedEventsTrace(projectId);
    const userId = randomUUID();
    const caller = trpcCaller({
      userId,
      orgId,
      projectId,
      accessAuditLogEnabled: false,
      supportAccess: true,
    });

    await caller.events.byTraceId({ projectId, traceId });

    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        route: "events.byTraceId",
        resourceId: traceId,
        actor: expect.objectContaining({
          type: "USER",
          userId,
          orgRole: Role.VIEWER,
          supportAccess: true,
        }),
      }),
    ]);
  });

  it("fails the read when the event cannot be recorded", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId } = await seedEventsTrace(projectId);
    const caller = trpcCaller({
      userId: randomUUID(),
      orgId,
      projectId,
      accessAuditLogEnabled: true,
    });
    staging.fail = true;

    await expect(
      caller.events.byTraceId({ projectId, traceId }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("records a refused read by a non-member as denied", async () => {
    const { orgId, projectId } = await setupOrg(true);
    const { traceId } = await seedEventsTrace(projectId);
    const userId = randomUUID();
    const caller = trpcCaller({
      userId,
      orgId,
      projectId,
      accessAuditLogEnabled: true,
      member: false,
    });

    await expect(
      caller.events.byTraceId({ projectId, traceId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(await accessEvents(orgId)).toEqual([
      expect.objectContaining({
        route: "events.byTraceId",
        resourceType: "trace",
        resourceId: traceId,
        action: "read",
        outcome: "denied",
        outcomeReason: "UNAUTHORIZED",
        resourceRefs: [`trace:${traceId}`],
        actor: {
          type: "USER",
          userId,
          name: expect.any(String),
          email: expect.any(String),
        },
      }),
    ]);
  });
});
