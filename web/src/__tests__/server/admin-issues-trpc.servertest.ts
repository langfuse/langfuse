import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Mock } from "vitest";
import type { Session } from "next-auth";
import type { Role } from "@langfuse/shared";

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  AdminIssueDetectionQueue,
  createOrgProjectAndApiKey,
  QueueJobs,
} from "@langfuse/shared/src/server";

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    AdminIssueDetectionQueue: { getInstance: vi.fn() },
  };
});

const __orgIds: string[] = [];

const prepare = async ({ projectRole }: { projectRole: Role }) => {
  const { project, org } = await createOrgProjectAndApiKey();
  __orgIds.push(org.id);

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: projectRole,
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: projectRole,
              retentionDays: 30,
              deletedAt: null,
              hasTraces: false,
              name: project.name,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });
  return { project, caller };
};

describe("adminIssues.getIssues", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  it("returns only the latest issue per rule in the project, newest first", async () => {
    const { caller, project } = await prepare({ projectRole: "ADMIN" });
    const { project: otherProject } = await prepare({ projectRole: "ADMIN" });
    await prisma.issueLog.createMany({
      data: [
        {
          projectId: project.id,
          issueDefinitionId: "observations-without-evaluators",
          description: "older",
          priority: 3,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        ...Array.from({ length: 101 }, (_, index) => ({
          projectId: project.id,
          issueDefinitionId: "observations-without-evaluators",
          description: index === 100 ? "latest" : "duplicate",
          priority: 3,
          createdAt: new Date(Date.UTC(2026, 0, 3, 0, 0, index)),
          ignoredAt: index === 100 ? new Date("2026-01-04T00:00:00Z") : null,
        })),
        {
          projectId: project.id,
          issueDefinitionId: "removed-rule",
          description: "newer",
          priority: 0,
          createdAt: new Date("2026-01-02T00:00:00Z"),
        },
        {
          projectId: otherProject.id,
          issueDefinitionId: "observations-without-evaluators",
          description: "other project",
          priority: 1,
        },
      ],
    });

    const issues = await caller.adminIssues.getIssues({
      projectId: project.id,
    });

    expect(
      issues.map(({ description, ruleName, ctaLabel }) => ({
        description,
        ruleName,
        ctaLabel,
      })),
    ).toEqual([
      {
        description: "latest",
        ruleName: "Set up evaluators",
        ctaLabel: "Create evaluator",
      },
      {
        description: "newer",
        ruleName: "removed-rule",
        ctaLabel: "View details",
      },
    ]);
    expect(issues[0]?.ignoredAt).toEqual(new Date("2026-01-04T00:00:00Z"));
  });
});

describe("adminIssues.setIgnored", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  it("ignores and restores only an issue in the current project", async () => {
    const { caller, project } = await prepare({ projectRole: "ADMIN" });
    const { project: otherProject } = await prepare({ projectRole: "ADMIN" });
    const issue = await prisma.issueLog.create({
      data: {
        projectId: project.id,
        issueDefinitionId: "rule",
        description: "test",
        priority: 0,
      },
    });
    const foreignIssue = await prisma.issueLog.create({
      data: {
        projectId: otherProject.id,
        issueDefinitionId: "rule",
        description: "foreign",
        priority: 0,
      },
    });

    await caller.adminIssues.setIgnored({
      projectId: project.id,
      issueId: issue.id,
      ignored: true,
    });
    expect(
      (await prisma.issueLog.findUniqueOrThrow({ where: { id: issue.id } }))
        .ignoredAt,
    ).not.toBeNull();
    await caller.adminIssues.setIgnored({
      projectId: project.id,
      issueId: issue.id,
      ignored: false,
    });
    expect(
      (await prisma.issueLog.findUniqueOrThrow({ where: { id: issue.id } }))
        .ignoredAt,
    ).toBeNull();
    await expect(
      caller.adminIssues.setIgnored({
        projectId: project.id,
        issueId: foreignIssue.id,
        ignored: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (
        await prisma.issueLog.findUniqueOrThrow({
          where: { id: foreignIssue.id },
        })
      ).ignoredAt,
    ).toBeNull();
  });

  it("rejects members without edit access", async () => {
    const { caller, project } = await prepare({ projectRole: "MEMBER" });
    await expect(
      caller.adminIssues.setIgnored({
        projectId: project.id,
        issueId: "missing",
        ignored: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("adminIssues.setDone", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  it("marks an issue done and undone without changing another project", async () => {
    const { caller, project } = await prepare({ projectRole: "ADMIN" });
    const { project: otherProject } = await prepare({ projectRole: "ADMIN" });
    const issue = await prisma.issueLog.create({
      data: {
        projectId: project.id,
        issueDefinitionId: "rule",
        description: "test",
        priority: 0,
      },
    });
    const foreign = await prisma.issueLog.create({
      data: {
        projectId: otherProject.id,
        issueDefinitionId: "rule",
        description: "test",
        priority: 0,
      },
    });
    await caller.adminIssues.setDone({
      projectId: project.id,
      issueId: issue.id,
      done: true,
    });
    expect(
      (await prisma.issueLog.findUniqueOrThrow({ where: { id: issue.id } }))
        .doneAt,
    ).not.toBeNull();
    await caller.adminIssues.setDone({
      projectId: project.id,
      issueId: issue.id,
      done: false,
    });
    expect(
      (await prisma.issueLog.findUniqueOrThrow({ where: { id: issue.id } }))
        .doneAt,
    ).toBeNull();
    await expect(
      caller.adminIssues.setDone({
        projectId: project.id,
        issueId: foreign.id,
        done: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await prisma.issueLog.findUniqueOrThrow({ where: { id: foreign.id } }))
        .doneAt,
    ).toBeNull();
  });
});

describe("adminIssues.runDetection", () => {
  const add = vi.fn();

  beforeEach(() => {
    add.mockReset().mockResolvedValue(undefined);
    (AdminIssueDetectionQueue.getInstance as Mock).mockReturnValue({ add });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: __orgIds } } });
  });

  it("queues one deduplicated detection job for the project", async () => {
    const { caller, project } = await prepare({ projectRole: "ADMIN" });

    await caller.adminIssues.runDetection({ projectId: project.id });

    expect(add).toHaveBeenCalledExactlyOnceWith(
      QueueJobs.AdminIssueDetectionJob,
      expect.objectContaining({ payload: { projectId: project.id } }),
      { deduplication: { id: `admin-issue-detection-${project.id}` } },
    );
  });

  it("rejects members without automations:CUD", async () => {
    const { caller, project } = await prepare({ projectRole: "MEMBER" });

    await expect(
      caller.adminIssues.runDetection({ projectId: project.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(add).not.toHaveBeenCalled();
  });
});
