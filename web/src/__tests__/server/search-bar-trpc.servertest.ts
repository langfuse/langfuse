import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { SEARCH_BAR_PROJECT_METADATA_KEY } from "@/src/features/search-bar/constants";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

type TestSetup = Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;
type ProjectRole = "ADMIN" | "MEMBER" | "VIEWER" | "NONE";

function createCallerForProjectRole({
  setup,
  projectRole = "ADMIN",
  orgId = setup.org.id,
}: {
  setup: TestSetup;
  projectRole?: ProjectRole;
  orgId?: string;
}) {
  const session: Session = {
    expires: "1",
    user: {
      id: uuidv4(),
      name: "Search Bar Test User",
      canCreateOrganizations: true,
      admin: false,
      organizations: [
        {
          id: orgId,
          name: setup.org.name,
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: setup.project.id,
              role: projectRole,
              name: setup.project.name,
              deletedAt: null,
              retentionDays: null,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        templateFlag: true,
        excludeClickhouseRead: false,
      },
    },
    environment: {} as Session["environment"],
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("searchBar.setEnabled RPC", () => {
  const orgIds: string[] = [];

  afterAll(async () => {
    if (orgIds.length === 0) return;

    await prisma.organization.deleteMany({
      where: { id: { in: orgIds } },
    });
  });

  it("allows project admins to toggle the search bar and preserves existing metadata", async () => {
    const setup = await createOrgProjectAndApiKey();
    orgIds.push(setup.org.id);

    await prisma.project.update({
      where: { id: setup.project.id },
      data: {
        metadata: {
          existing: "keep-me",
        },
      },
    });

    const caller = createCallerForProjectRole({ setup, projectRole: "ADMIN" });

    await expect(
      caller.searchBar.setEnabled({
        projectId: setup.project.id,
        enabled: true,
      }),
    ).resolves.toEqual({ searchBarEnabled: true });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: setup.project.id },
    });
    expect(project.metadata).toMatchObject({
      existing: "keep-me",
      [SEARCH_BAR_PROJECT_METADATA_KEY]: true,
    });

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        projectId: setup.project.id,
        resourceType: "project",
        resourceId: setup.project.id,
        action: "update",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.userProjectRole).toBe("ADMIN");

    const after = auditLog?.after ? JSON.parse(auditLog.after) : null;
    expect(after?.metadata).toMatchObject({
      existing: "keep-me",
      [SEARCH_BAR_PROJECT_METADATA_KEY]: true,
    });
  });

  it("rejects project members and leaves metadata unchanged", async () => {
    const setup = await createOrgProjectAndApiKey();
    orgIds.push(setup.org.id);

    const caller = createCallerForProjectRole({ setup, projectRole: "MEMBER" });

    await expect(
      caller.searchBar.setEnabled({
        projectId: setup.project.id,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: setup.project.id },
    });
    expect(project.metadata ?? {}).not.toHaveProperty(
      SEARCH_BAR_PROJECT_METADATA_KEY,
    );

    const auditLogs = await prisma.auditLog.count({
      where: {
        projectId: setup.project.id,
        resourceType: "project",
        resourceId: setup.project.id,
        action: "update",
      },
    });
    expect(auditLogs).toBe(0);
  });

  it("does not update a project outside the caller's session organization", async () => {
    const setup = await createOrgProjectAndApiKey();
    const otherSetup = await createOrgProjectAndApiKey();
    orgIds.push(setup.org.id, otherSetup.org.id);

    const caller = createCallerForProjectRole({
      setup,
      projectRole: "ADMIN",
      orgId: otherSetup.org.id,
    });

    await expect(
      caller.searchBar.setEnabled({
        projectId: setup.project.id,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: setup.project.id },
    });
    expect(project.metadata ?? {}).not.toHaveProperty(
      SEARCH_BAR_PROJECT_METADATA_KEY,
    );
  });
});
