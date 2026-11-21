import { randomUUID } from "crypto";
import { prisma, type Role } from "@langfuse/shared/src/db";
import {
  type BillableEventType,
  clickhouseClient,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { getOrgUsageBreakdown } from "@/src/features/organization-usage/server/usageBreakdown";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const createOrgWithProjects = async (
  projects: { name: string; deleted?: boolean }[],
) => {
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: randomUUID() },
  });
  const created = await Promise.all(
    projects.map((project) =>
      prisma.project.create({
        data: {
          id: randomUUID(),
          name: project.name,
          orgId: org.id,
          deletedAt: project.deleted ? new Date() : null,
        },
      }),
    ),
  );
  return { orgId: org.id, projectIds: created.map((project) => project.id) };
};

const callerWithOrgRole = (orgId: string, role: Role) => {
  const session: Session = createSession({
    user: { canCreateOrganizations: false },
    organizations: [{ id: orgId, role, name: "Org", plan: "oss" }],
    environment: { selfHostedInstancePlan: "oss" },
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
};

/** Inserts ledger rows directly, to place them at chosen ingestion times. */
const insertBillableEvents = (
  rows: Array<{
    projectId: string;
    eventType: BillableEventType;
    eventId: string;
    at: string;
  }>,
) =>
  clickhouseClient().insert({
    table: "billable_events",
    format: "JSONEachRow",
    values: rows.map((row) => ({
      ingested_at: row.at.slice(0, 19).replace("T", " "),
      project_id: row.projectId,
      event_type: row.eventType,
      event_id: row.eventId,
      event_time: row.at.slice(0, 19).replace("T", " "),
      event_bytes: 0,
    })),
  });

const sortRows = <
  T extends { bucket: string; projectId: string; unitType: string },
>(
  rows: T[],
) =>
  [...rows].sort(
    (a, b) =>
      a.bucket.localeCompare(b.bucket) ||
      a.projectId.localeCompare(b.projectId) ||
      a.unitType.localeCompare(b.unitType),
  );

describe("getOrgUsageBreakdown", () => {
  it("counts billable units of the org's live projects by created_at in legacy mode", async () => {
    const {
      orgId,
      projectIds: [alpha, beta, deleted],
    } = await createOrgWithProjects([
      { name: "alpha" },
      { name: "beta" },
      { name: "gone", deleted: true },
    ]);
    const {
      projectIds: [otherOrgProject],
    } = await createOrgWithProjects([{ name: "other" }]);

    await createTracesCh([
      // Billed when ingested, not when the trace happened
      createTrace({
        project_id: alpha,
        timestamp: new Date("2026-07-01T10:00:00Z"),
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
      // `to` is exclusive
      createTrace({
        project_id: alpha,
        created_at: new Date("2026-08-06T00:00:00Z"),
      }),
      createTrace({
        project_id: deleted,
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
      createTrace({
        project_id: otherOrgProject,
        created_at: new Date("2026-08-03T10:00:00Z"),
      }),
    ]);
    await createObservationsCh([
      createObservation({
        project_id: alpha,
        created_at: new Date("2026-08-04T01:00:00Z"),
      }),
      createObservation({
        project_id: alpha,
        created_at: new Date("2026-08-04T23:59:00Z"),
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: beta,
        created_at: new Date("2026-08-04T12:00:00Z"),
      }),
      createTraceScore({
        project_id: beta,
        data_type: "CORRECTION",
        created_at: new Date("2026-08-04T12:00:00Z"),
      }),
    ]);

    const result = await getOrgUsageBreakdown({
      prisma,
      orgId,
      from: new Date("2026-08-03T00:00:00Z"),
      to: new Date("2026-08-06T00:00:00Z"),
      writeMode: "legacy",
    });

    expect(result.granularity).toBe("day");
    expect(result.usageRecordedFrom).toBeNull();
    expect(result.buckets).toEqual([
      "2026-08-03T00:00:00.000Z",
      "2026-08-04T00:00:00.000Z",
      "2026-08-05T00:00:00.000Z",
    ]);
    expect(result.projects).toEqual([
      { id: alpha, name: "alpha" },
      { id: beta, name: "beta" },
    ]);
    expect(sortRows(result.rows)).toEqual(
      sortRows([
        {
          bucket: "2026-08-03T00:00:00.000Z",
          projectId: alpha,
          unitType: "traces",
          count: 1,
        },
        {
          bucket: "2026-08-04T00:00:00.000Z",
          projectId: alpha,
          unitType: "observations",
          count: 2,
        },
        {
          bucket: "2026-08-04T00:00:00.000Z",
          projectId: beta,
          unitType: "scores",
          count: 1,
        },
      ]),
    );
  });

  it("reads the billable_events ledger once the events tables are written", async () => {
    const {
      orgId,
      projectIds: [alpha, deleted],
    } = await createOrgWithProjects([
      { name: "alpha" },
      { name: "gone", deleted: true },
    ]);
    const {
      projectIds: [otherOrgProject],
    } = await createOrgWithProjects([{ name: "other" }]);

    await insertBillableEvents([
      // Ingested twice in one bucket, so counted once
      {
        projectId: alpha,
        eventType: "trace",
        eventId: "t-1",
        at: "2026-08-03T10:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "trace",
        eventId: "t-1",
        at: "2026-08-03T11:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "observation",
        eventId: "o-1",
        at: "2026-08-04T01:00:00Z",
      },
      {
        projectId: alpha,
        eventType: "topic_facet_summary",
        eventId: "f-1",
        at: "2026-08-04T02:00:00Z",
      },
      {
        projectId: deleted,
        eventType: "score",
        eventId: "s-1",
        at: "2026-08-04T12:00:00Z",
      },
      {
        projectId: otherOrgProject,
        eventType: "score",
        eventId: "s-2",
        at: "2026-08-04T12:00:00Z",
      },
    ]);
    // Deletes and retention do not lower billed usage, so the legacy tables
    // are not read.
    await createTracesCh([
      createTrace({
        project_id: alpha,
        created_at: new Date("2026-08-05T10:00:00Z"),
      }),
    ]);

    for (const writeMode of ["dual", "events_only"] as const) {
      const result = await getOrgUsageBreakdown({
        prisma,
        orgId,
        from: new Date("2026-08-03T00:00:00Z"),
        to: new Date("2026-08-06T00:00:00Z"),
        writeMode,
      });

      expect(sortRows(result.rows)).toEqual(
        sortRows([
          {
            bucket: "2026-08-03T00:00:00.000Z",
            projectId: alpha,
            unitType: "traces",
            count: 1,
          },
          {
            bucket: "2026-08-04T00:00:00.000Z",
            projectId: alpha,
            unitType: "observations",
            count: 1,
          },
          {
            bucket: "2026-08-04T00:00:00.000Z",
            projectId: alpha,
            unitType: "topicFacetSummaries",
            count: 1,
          },
        ]),
      );
      expect(
        new Date(result.usageRecordedFrom ?? "").getTime(),
      ).toBeLessThanOrEqual(new Date("2026-08-03T10:00:00Z").getTime());
    }
  });

  it("puts ClickHouse week buckets on the generated Monday axis", async () => {
    const {
      orgId,
      projectIds: [projectId],
    } = await createOrgWithProjects([{ name: "weekly" }]);

    await createTracesCh([
      // Wednesday
      createTrace({
        project_id: projectId,
        created_at: new Date("2026-06-10T15:00:00Z"),
      }),
    ]);

    const result = await getOrgUsageBreakdown({
      prisma,
      orgId,
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-07-15T00:00:00Z"),
      writeMode: "legacy",
    });

    expect(result.granularity).toBe("week");
    expect(result.buckets[0]).toBe("2026-04-27T00:00:00.000Z");
    expect(result.rows).toEqual([
      {
        bucket: "2026-06-08T00:00:00.000Z",
        projectId,
        unitType: "traces",
        count: 1,
      },
    ]);
    expect(result.buckets).toContain(result.rows[0].bucket);
  });
});

describe("organizationUsage.breakdown", () => {
  // No entitlement gates this endpoint, so the org role is the only thing
  // keeping members from seeing usage of projects they cannot access.
  it("is readable by org admins but not by members", async () => {
    const { orgId } = await createOrgWithProjects([{ name: "admin-check" }]);
    const input = {
      orgId,
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-02T00:00:00Z"),
    };

    await expect(
      callerWithOrgRole(orgId, "ADMIN").organizationUsage.breakdown(input),
    ).resolves.toMatchObject({ granularity: "hour" });
    await expect(
      callerWithOrgRole(orgId, "MEMBER").organizationUsage.breakdown(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
