import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getV4MigrationTopBannerState } from "@/src/features/v4-migration/server/v4MigrationTopBannerService";

const mocks = vi.hoisted(() => ({
  bannerStateByOrgId: new Map<
    string,
    {
      severity: "off" | "warning" | "critical";
      message: string | null;
      exempt: boolean;
    }
  >(),
  getMigrationActionsByProject: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/server/v4MigrationBannerConfig", () => ({
  getV4MigrationBannerConfig: ({ orgId }: { orgId: string }) =>
    mocks.bannerStateByOrgId.get(orgId) ?? {
      severity: "off",
      message: null,
      exempt: false,
    },
}));

vi.mock("@/src/features/v4/server/v4TransitionService", () => ({
  getMigrationActionsByProject: mocks.getMigrationActionsByProject,
}));

const warningState = {
  severity: "warning" as const,
  message: "Action required.",
  exempt: false,
};

const session = {
  user: {
    organizations: [
      {
        id: "org-a",
        name: "Org A",
        projects: [{ id: "project-a", name: "Project A", deletedAt: null }],
      },
      {
        id: "org-b",
        name: "Org B",
        projects: [{ id: "project-b", name: "Project B", deletedAt: null }],
      },
      {
        id: "org-c",
        name: "Org C",
        projects: [
          { id: "project-c", name: "Project C", deletedAt: null },
          {
            id: "project-deleted",
            name: "Deleted Project",
            deletedAt: new Date("2026-01-01"),
          },
        ],
      },
      {
        id: "demo-org",
        name: "Demo",
        projects: [{ id: "demo-project", name: "Demo", deletedAt: null }],
      },
    ],
  },
} as unknown as Session;

const actionNeeded = {
  forceV3Experience: false,
  sdkActionNeeded: true,
  experimentsActionNeeded: false,
  apisActionNeeded: false,
  evalsActionNeeded: false,
  exportsActionNeeded: false,
};

const noActionNeeded = {
  ...actionNeeded,
  sdkActionNeeded: false,
};

describe("getV4MigrationTopBannerState", () => {
  beforeEach(() => {
    mocks.bannerStateByOrgId = new Map();
    mocks.bannerStateByOrgId.set("org-a", warningState);
    mocks.bannerStateByOrgId.set("org-b", {
      severity: "off",
      message: null,
      exempt: true,
    });
    mocks.bannerStateByOrgId.set("org-c", warningState);
    mocks.bannerStateByOrgId.set("demo-org", warningState);
    mocks.getMigrationActionsByProject.mockReset();
    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([
        ["project-a", actionNeeded],
        ["project-c", noActionNeeded],
      ]),
    );
  });

  it("aggregates all eligible session organizations while excluding demo, exempt, and deleted projects", async () => {
    await expect(
      getV4MigrationTopBannerState({
        prisma: {} as PrismaClient,
        session,
        demoOrgId: "demo-org",
        isLangfuseCloud: true,
      }),
    ).resolves.toEqual({
      severity: "warning",
      message: "Action required.",
      actionNeededCount: 1,
    });

    expect(mocks.getMigrationActionsByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds: ["project-a", "project-c"] }),
    );
  });

  it("counts actionable projects and excludes forced-v3 projects", async () => {
    const projectIds = ["project-a", "project-ready", "project-partner"];
    const scopedSession = {
      ...session,
      user: {
        ...session.user!,
        organizations: [
          {
            ...session.user!.organizations[0],
            projects: projectIds.map((id) => ({
              id,
              name: id,
              deletedAt: null,
            })),
          },
        ],
      },
    } as unknown as Session;
    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([
        ["project-a", actionNeeded],
        ["project-ready", noActionNeeded],
        ["project-partner", { ...actionNeeded, forceV3Experience: true }],
      ]),
    );

    await expect(
      getV4MigrationTopBannerState({
        prisma: {} as PrismaClient,
        session: scopedSession,
        demoOrgId: undefined,
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({ actionNeededCount: 1 });

    expect(mocks.getMigrationActionsByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds }),
    );
  });
});
