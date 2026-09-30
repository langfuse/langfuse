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

  it("returns only the project's issues, newest first, labelled by rule", async () => {
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
      issues.map(({ description, ruleName }) => ({ description, ruleName })),
    ).toEqual([
      { description: "newer", ruleName: "removed-rule" },
      { description: "older", ruleName: "Set up evaluators" },
    ]);
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
