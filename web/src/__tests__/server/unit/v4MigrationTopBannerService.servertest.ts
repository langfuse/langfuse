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
  readCache: vi.fn(),
  writeCache: vi.fn(),
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

vi.mock("@/src/features/v4/server/v4TransitionCache", () => ({
  readV4MigrationBannerCache: mocks.readCache,
  writeV4MigrationBannerCache: mocks.writeCache,
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
    mocks.readCache.mockReset();
    mocks.readCache.mockResolvedValue(null);
    mocks.writeCache.mockReset();
  });

  it("checks every eligible session organization on account-wide routes", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "project-a" }]);

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

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: { in: ["org-a"] },
          id: { in: ["project-a"] },
        }),
      }),
    );
    expect(mocks.writeCache).toHaveBeenCalledWith(["project-a"], {
      actionNeededCount: 1,
    });
  });

  it("returns the shared cached count without rerunning migration checks", async () => {
    mocks.readCache.mockResolvedValue({ actionNeededCount: 2 });
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: "project-a" }, { id: "project-c" }]);

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
    ).resolves.toMatchObject({
      severity: "warning",
      actionNeededCount: 2,
    });

    expect(mocks.getMigrationActionsByProject).not.toHaveBeenCalled();
    expect(mocks.writeCache).not.toHaveBeenCalled();
  });

  it("ignores organizations outside the session", async () => {
    const findMany = vi.fn();

    await expect(
      getV4MigrationTopBannerState({
        prisma: {
          project: { findMany },
        } as unknown as PrismaClient,
        session,
        orgId: "org-outside-session",
        demoOrgId: undefined,
        isLangfuseCloud: true,
      }),
    ).resolves.toEqual({
      severity: "off",
      message: null,
      actionNeededCount: 0,
    });

    expect(findMany).not.toHaveBeenCalled();
  });
});
