import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { deleteSessionViewsWithoutProjectAccess } from "@/src/features/sessions/server/fns/deleteSessionViewsWithoutProjectAccess";

afterEach(() => vi.restoreAllMocks());

describe("session view cleanup after membership changes", () => {
  it("deletes only the removed user's views in the affected organization", async () => {
    vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
      null,
    );
    const remove = vi
      .spyOn(prisma.sessionView, "deleteMany")
      .mockResolvedValue({ count: 1 });

    await deleteSessionViewsWithoutProjectAccess(prisma, {
      userId: "user",
      orgId: "org",
    });

    expect(remove).toHaveBeenCalledWith({
      where: {
        createdBy: "user",
        project: { orgId: "org" },
        projectId: undefined,
      },
    });
  });

  it.each<{ orgRole: Role; projectRole: Role | null; losesAccess: boolean }>([
    { orgRole: "NONE", projectRole: null, losesAccess: true },
    { orgRole: "AI_GATEWAY", projectRole: null, losesAccess: true },
    { orgRole: "VIEWER", projectRole: null, losesAccess: false },
    { orgRole: "NONE", projectRole: "MEMBER", losesAccess: false },
    { orgRole: "ADMIN", projectRole: "NONE", losesAccess: true },
    { orgRole: "AI_GATEWAY", projectRole: "VIEWER", losesAccess: false },
  ])(
    "checks effective project access ($orgRole / $projectRole)",
    async ({ orgRole, projectRole, losesAccess }) => {
      const membership = {
        id: "membership",
        orgId: "org",
        userId: "user",
        role: orgRole,
        createdAt: new Date(),
        updatedAt: new Date(),
        ProjectMemberships:
          projectRole === null
            ? []
            : [
                {
                  id: "project-membership",
                  projectId: "project",
                  userId: "user",
                  orgMembershipId: "membership",
                  role: projectRole,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
      };
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue(
        membership,
      );
      vi.spyOn(prisma.sessionView, "findMany").mockResolvedValue([
        {
          id: "view",
          projectId: "project",
          createdBy: "user",
          name: "View",
          filters: [],
          viewMode: "list",
          unmatchedTraces: "hide",
          pinnedByDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const remove = vi
        .spyOn(prisma.sessionView, "deleteMany")
        .mockResolvedValue({ count: 1 });

      await deleteSessionViewsWithoutProjectAccess(prisma, {
        userId: "user",
        orgId: "org",
        projectId: "project",
      });

      if (losesAccess) {
        expect(remove).toHaveBeenCalledWith({
          where: {
            createdBy: "user",
            project: { orgId: "org" },
            projectId: { in: ["project"] },
          },
        });
      } else {
        expect(remove).not.toHaveBeenCalled();
      }
    },
  );
});
