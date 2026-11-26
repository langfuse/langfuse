import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { V4_MIGRATION_TOP_BANNER_MESSAGE } from "@/src/features/v4-migration/v4MigrationBannerCopy";
import { getV4MigrationTopBannerState } from "@/src/features/v4-migration/server/v4MigrationTopBannerService";

const mocks = vi.hoisted(() => ({
  bannerState: {
    severity: "warning",
    message: "Action required.",
  } as { severity: "off" | "warning" | "critical"; message: string | null },
  getMigrationActionsByProject: vi.fn(),
}));

vi.mock("@/src/features/v4-migration/server/v4MigrationBannerConfig", () => ({
  getV4MigrationBannerConfig: () => mocks.bannerState,
}));

vi.mock("@/src/features/v4/server/v4TransitionService", () => ({
  getMigrationActionsByProject: mocks.getMigrationActionsByProject,
}));

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
    mocks.bannerState = { severity: "warning", message: "Action required." };
    mocks.getMigrationActionsByProject.mockReset();
    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([
        ["project-a", actionNeeded],
        ["project-c", noActionNeeded],
      ]),
    );
  });

  it("aggregates all eligible session organizations while excluding demo and deleted projects", async () => {
    await expect(
      getV4MigrationTopBannerState({
        prisma: {} as PrismaClient,
        session,
        demoOrgId: "demo-org",
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({
      severity: "warning",
      message: V4_MIGRATION_TOP_BANNER_MESSAGE,
      actionNeededCount: 1,
    });

    expect(mocks.getMigrationActionsByProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectIds: ["project-a", "project-b", "project-c"],
      }),
    );

    mocks.bannerState = { severity: "off", message: null };
    await expect(
      getV4MigrationTopBannerState({
        prisma: {} as PrismaClient,
        session,
        demoOrgId: "demo-org",
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({ severity: "off", message: null });
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

  it("shows the delayed deadline only when every actionable project is cutoff-exempt", async () => {
    const banner = {
      prisma: {} as PrismaClient,
      session,
      demoOrgId: "demo-org" as string | undefined,
      isLangfuseCloud: true,
    };

    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        cutoffExemptProjectIds: [],
      }),
    ).resolves.toMatchObject({
      message: V4_MIGRATION_TOP_BANNER_MESSAGE,
      variant: "deadline",
      href: "/v4-migration",
      linkLabel: "Check migration status",
    });

    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        cutoffExemptProjectIds: ["project-a"],
      }),
    ).resolves.toMatchObject({
      message:
        "Action required: Deadline delayed by one week, until November 23, 2026. Some features may stop working after that for at least one of your projects.",
      variant: "delayed",
      href: "/v4-migration",
      linkLabel: "Check migration status",
    });

    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([
        ["project-a", actionNeeded],
        ["project-c", actionNeeded],
      ]),
    );
    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        cutoffExemptProjectIds: ["project-a"],
      }),
    ).resolves.toMatchObject({ variant: "deadline" });

    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([["project-a", noActionNeeded]]),
    );
    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        cutoffExemptProjectIds: [],
      }),
    ).resolves.toMatchObject({
      severity: "off",
      message: null,
    });
  });

  it("shows the December deadline only when every actionable project is on the December list", async () => {
    const banner = {
      prisma: {} as PrismaClient,
      session,
      demoOrgId: "demo-org" as string | undefined,
      isLangfuseCloud: true,
    };

    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        decemberProjectIds: ["project-a"],
        cutoffExemptProjectIds: ["project-a"],
      }),
    ).resolves.toMatchObject({
      message:
        "Action required: Deadline delayed until December 31, 2026. Some features may stop working after that for at least one of your projects.",
      variant: "december",
      href: "/v4-migration",
    });

    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([
        ["project-a", actionNeeded],
        ["project-c", actionNeeded],
      ]),
    );
    await expect(
      getV4MigrationTopBannerState({
        ...banner,
        decemberProjectIds: ["project-a"],
        cutoffExemptProjectIds: ["project-a", "project-c"],
      }),
    ).resolves.toMatchObject({ variant: "delayed" });
  });
});
