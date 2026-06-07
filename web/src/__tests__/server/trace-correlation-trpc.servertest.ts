import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

const createSession = ({
  orgId,
  sourceProjectId,
  relatedProjectId,
  orgRole = "OWNER",
}: {
  orgId: string;
  sourceProjectId: string;
  relatedProjectId: string;
  orgRole?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "NONE";
}): Session => ({
  expires: "2026-01-01T00:00:00.000Z",
  user: {
    id: "user-1",
    name: "User",
    email: "user@example.com",
    canCreateOrganizations: true,
    admin: false,
    organizations: [
      {
        id: orgId,
        name: "Org",
        role: orgRole,
        plan: "cloud:hobby",
        cloudConfig: undefined,
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        crossProjectTraceTrackingEnabled: true,
        crossProjectTraceCorrelationKey: "crossProjectCorrelationId",
        projects: [
          {
            id: sourceProjectId,
            name: "Source Project",
            role: "ADMIN",
            retentionDays: 30,
            deletedAt: null,
            hasTraces: true,
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: relatedProjectId,
            name: "Readable Related Project",
            role: "VIEWER",
            retentionDays: 30,
            deletedAt: null,
            hasTraces: true,
            metadata: {},
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
    featureFlags: {
      excludeClickhouseRead: false,
      templateFlag: true,
    },
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
  },
});

describe("traces.relatedAcrossProjects", () => {
  it("creates organizations with cross-project trace tracking disabled by default", async () => {
    const { orgId } = await createOrgProjectAndApiKey();

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        crossProjectTraceTrackingEnabled: true,
        crossProjectTraceCorrelationKey: true,
      },
    });

    expect(organization).toEqual({
      crossProjectTraceTrackingEnabled: false,
      crossProjectTraceCorrelationKey: "crossProjectCorrelationId",
    });
  });

  it("persists organization trace-correlation settings and enforces update access", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const ownerCaller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: createSession({
          orgId,
          sourceProjectId: projectId,
          relatedProjectId: projectId,
          orgRole: "OWNER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      ownerCaller.organizations.update({
        orgId,
        crossProjectTraceTrackingEnabled: true,
      }),
    ).resolves.toBe(true);
    await expect(
      ownerCaller.organizations.update({
        orgId,
        crossProjectTraceCorrelationKey: "agent.workflow_id",
      }),
    ).resolves.toBe(true);
    await expect(
      ownerCaller.organizations.update({
        orgId,
        crossProjectTraceCorrelationKey: "invalid key with spaces",
      }),
    ).rejects.toThrow();

    const memberCaller = appRouter.createCaller({
      ...createInnerTRPCContext({
        session: createSession({
          orgId,
          sourceProjectId: projectId,
          relatedProjectId: projectId,
          orgRole: "MEMBER",
        }),
        headers: {},
      }),
      prisma,
    });

    await expect(
      memberCaller.organizations.update({
        orgId,
        crossProjectTraceTrackingEnabled: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        crossProjectTraceTrackingEnabled: true,
        crossProjectTraceCorrelationKey: true,
      },
    });
    expect(organization).toEqual({
      crossProjectTraceTrackingEnabled: true,
      crossProjectTraceCorrelationKey: "agent.workflow_id",
    });
  });

  it("returns only same-org readable sibling trace links", async () => {
    const { orgId, projectId: sourceProjectId } =
      await createOrgProjectAndApiKey();
    const { projectId: otherOrgProjectId } = await createOrgProjectAndApiKey();
    await prisma.organization.update({
      where: { id: orgId },
      data: { crossProjectTraceTrackingEnabled: true },
    });

    const relatedProject = await prisma.project.create({
      data: {
        id: randomUUID(),
        orgId,
        name: "Readable Related Project",
      },
    });
    const hiddenProject = await prisma.project.create({
      data: {
        id: randomUUID(),
        orgId,
        name: "Hidden Related Project",
      },
    });

    const traceId = randomUUID();
    const sourceSiblingTraceId = randomUUID();
    const relatedTraceId = randomUUID();
    const hiddenTraceId = randomUUID();
    const otherOrgTraceId = randomUUID();
    const correlationValue = randomUUID();
    const timestamp = new Date("2026-01-01T12:00:00.000Z");
    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: sourceProjectId,
        timestamp: timestamp.getTime(),
        name: "source-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: sourceSiblingTraceId,
        project_id: sourceProjectId,
        timestamp: timestamp.getTime(),
        name: "source-project-sibling-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: relatedTraceId,
        project_id: relatedProject.id,
        timestamp: timestamp.getTime(),
        name: "readable-related-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: hiddenTraceId,
        project_id: hiddenProject.id,
        timestamp: timestamp.getTime(),
        name: "hidden-related-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: otherOrgTraceId,
        project_id: otherOrgProjectId,
        timestamp: timestamp.getTime(),
        name: "other-org-related-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
    ]);

    const ctx = createInnerTRPCContext({
      session: createSession({
        orgId,
        sourceProjectId,
        relatedProjectId: relatedProject.id,
      }),
      headers: {},
    });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    const result = await caller.traces.relatedAcrossProjects({
      projectId: sourceProjectId,
      traceId,
      timestamp,
      minStartTime: null,
      maxStartTime: null,
    });

    expect(result.enabled).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.related).toHaveLength(1);
    expect(result.related[0]).toEqual(
      expect.objectContaining({
        projectId: relatedProject.id,
        projectName: relatedProject.name,
        traceId: relatedTraceId,
        traceName: "readable-related-trace",
        source: "traces",
      }),
    );
    expect(result.related[0].htmlPath).toBe(
      `/project/${relatedProject.id}/traces/${relatedTraceId}?timestamp=2026-01-01T12%3A00%3A00.000Z`,
    );
    expect(result.related.map((trace) => trace.traceId)).not.toContain(
      sourceSiblingTraceId,
    );
    expect(result.related.map((trace) => trace.traceId)).not.toContain(
      otherOrgTraceId,
    );
  });

  it("rejects callers without source project access before lookup", async () => {
    const { orgId, projectId } = await createOrgProjectAndApiKey();
    const session = createSession({
      orgId,
      sourceProjectId: "different-project",
      relatedProjectId: randomUUID(),
    });
    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    await expect(
      caller.traces.relatedAcrossProjects({
        projectId,
        traceId: randomUUID(),
        timestamp: new Date("2026-01-01T12:00:00.000Z"),
        minStartTime: null,
        maxStartTime: null,
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("does not return a legacy related trace when its latest metadata no longer matches", async () => {
    const { orgId, projectId: sourceProjectId } =
      await createOrgProjectAndApiKey();
    await prisma.organization.update({
      where: { id: orgId },
      data: { crossProjectTraceTrackingEnabled: true },
    });

    const relatedProject = await prisma.project.create({
      data: {
        id: randomUUID(),
        orgId,
        name: "Readable Related Project",
      },
    });

    const traceId = randomUUID();
    const relatedTraceId = randomUUID();
    const correlationValue = randomUUID();
    const timestamp = new Date("2026-01-01T12:00:00.000Z");
    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: sourceProjectId,
        timestamp: timestamp.getTime(),
        event_ts: timestamp.getTime(),
        name: "source-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: relatedTraceId,
        project_id: relatedProject.id,
        timestamp: timestamp.getTime(),
        event_ts: timestamp.getTime(),
        name: "old-related-trace",
        metadata: { crossProjectCorrelationId: correlationValue },
      }),
      createTrace({
        id: relatedTraceId,
        project_id: relatedProject.id,
        timestamp: timestamp.getTime(),
        event_ts: timestamp.getTime() + 1,
        name: "updated-related-trace",
        metadata: {},
      }),
    ]);

    const ctx = createInnerTRPCContext({
      session: createSession({
        orgId,
        sourceProjectId,
        relatedProjectId: relatedProject.id,
      }),
      headers: {},
    });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    const result = await caller.traces.relatedAcrossProjects({
      projectId: sourceProjectId,
      traceId,
      timestamp,
      minStartTime: null,
      maxStartTime: null,
    });

    expect(result.enabled).toBe(true);
    expect(result.related).toEqual([]);
  });
});
