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

vi.mock("@/src/features/v4-migration/server/legacyApiBannerSource", () => ({
  getLegacyApiBannerState: ({ orgId }: { orgId: string }) =>
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
    admin: false,
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
    mocks.bannerStateByOrgId.set("demo-org", warningState);
    mocks.getMigrationActionsByProject.mockReset();
    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([["project-a", actionNeeded]]),
    );
  });

  it("checks account scope while excluding demo and exempt organizations", async () => {
    const findMany = vi.fn();

    await expect(
      getV4MigrationTopBannerState({
        prisma: {
          project: { findMany },
        } as unknown as PrismaClient,
        session,
        orgId: undefined,
        demoOrgId: "demo-org",
        isLangfuseCloud: true,
      }),
    ).resolves.toEqual({
      severity: "warning",
      message: "Action required.",
      actionNeededCount: 1,
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(mocks.getMigrationActionsByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds: ["project-a"] }),
    );
  });

  it("checks only the requested organization scope", async () => {
    const findMany = vi.fn();

    await expect(
      getV4MigrationTopBannerState({
        prisma: {
          project: { findMany },
        } as unknown as PrismaClient,
        session,
        orgId: "org-a",
        demoOrgId: undefined,
        isLangfuseCloud: true,
      }),
    ).resolves.toEqual({
      severity: "warning",
      message: "Action required.",
      actionNeededCount: 1,
    });

    expect(findMany).not.toHaveBeenCalled();
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
    const findMany = vi.fn();

    await expect(
      getV4MigrationTopBannerState({
        prisma: {
          project: { findMany },
        } as unknown as PrismaClient,
        session: scopedSession,
        orgId: "org-a",
        demoOrgId: undefined,
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({ actionNeededCount: 1 });

    expect(mocks.getMigrationActionsByProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds }),
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("supports global-admin organization scopes authorized by the router", async () => {
    mocks.bannerStateByOrgId.set("org-customer", warningState);
    mocks.getMigrationActionsByProject.mockResolvedValue(
      new Map([["project-customer", actionNeeded]]),
    );
    const findMany = vi.fn().mockResolvedValue([{ id: "project-customer" }]);
    const adminSession = {
      ...session,
      user: {
        ...session.user!,
        admin: true,
        organizations: [],
      },
    } as Session;

    await expect(
      getV4MigrationTopBannerState({
        prisma: {
          project: { findMany },
        } as unknown as PrismaClient,
        session: adminSession,
        orgId: "org-customer",
        demoOrgId: undefined,
        isLangfuseCloud: true,
      }),
    ).resolves.toMatchObject({
      severity: "warning",
      actionNeededCount: 1,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          orgId: { in: ["org-customer"] },
          deletedAt: null,
        },
      }),
    );
  });
});
