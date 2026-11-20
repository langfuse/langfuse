import { randomUUID } from "node:crypto";
import { onTestFinished } from "vitest";
import { projectRoleAccessRights } from "@langfuse/shared";
import { type Session } from "next-auth";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createOrgMembership,
  createProjectMembership,
  deleteOrgMembership,
  updateOrgMembership,
} from "@langfuse/shared/memberships";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const prepare = async () => {
  const { project, org } = await createOrgProjectAndApiKey();
  const owner = await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, name: "Owner" },
  });
  const other = await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, name: "Other" },
  });
  onTestFinished(async () => {
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, other.id] } },
    });
  });
  await createOrgMembership(prisma, {
    orgId: org.id,
    userId: owner.id,
    role: "ADMIN",
  });
  await createOrgMembership(prisma, {
    orgId: org.id,
    userId: other.id,
    role: "VIEWER",
  });
  const callerFor = (
    userId: string,
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER",
  ) => {
    const session: Session = createSession({
      user: { id: userId, name: "Session view test user" },
      organizations: [
        {
          id: org.id,
          role: "OWNER",
          name: org.name,
          plan: "cloud:team",
          aiTelemetryEnabled: true,
          projects: [{ id: project.id, role, name: project.name }],
        },
      ],
      environment: { selfHostedInstancePlan: "cloud:hobby" },
    });
    return appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    });
  };
  const input = {
    ownership: "PROJECT" as const,
    projectId: project.id,
    name: "Generations",
    filters: [
      {
        column: "type",
        type: "string" as const,
        operator: "=" as const,
        value: "GENERATION",
      },
    ],
    viewMode: "list" as const,
    unmatchedTraces: "hide" as const,
  };
  return { project, org, owner, other, callerFor, input };
};

describe("session views", () => {
  it("allows duplicate private names and promotes private views without changing their ID", async () => {
    const { owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "MEMBER");
    const { view } = await creator.sessionViews.create({
      ...input,
      ownership: "PRIVATE",
    });
    await callerFor(other.id, "MEMBER").sessionViews.create({
      ...input,
      ownership: "PRIVATE",
    });
    await expect(
      creator.sessionViews.create({ ...input, ownership: "PRIVATE" }),
    ).resolves.toMatchObject({ view: { name: input.name } });
    await expect(
      creator.sessionViews.update({ ...input, id: view.id }),
    ).resolves.toMatchObject({ view: { id: view.id, ownership: "PROJECT" } });
    await expect(
      creator.sessionViews.update({
        ...input,
        id: view.id,
        ownership: "PRIVATE",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("requires confirmation and ownership before converting and pinning a private view", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "ADMIN");
    const { view } = await creator.sessionViews.create({
      ...input,
      ownership: "PRIVATE",
    });
    const pin = {
      projectId: project.id,
      id: view.id,
      isPinnedByDefaultForProject: true,
    };
    await expect(creator.sessionViews.setDefaultPin(pin)).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
      },
    );
    await expect(
      callerFor(other.id, "ADMIN").sessionViews.setDefaultPin({
        ...pin,
        promoteToProject: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await creator.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages"],
      unpinnedViewIds: [view.id],
    });
    await creator.sessionViews.setDefaultPin({
      ...pin,
      promoteToProject: true,
    });
    await expect(
      callerFor(other.id, "VIEWER").sessionViews.list({
        projectId: project.id,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: view.id,
          ownership: "PROJECT",
          isPinnedByDefaultForProject: true,
        }),
      ]),
    );
    await expect(
      creator.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: ["messages"] });
  });
  it("requires project write permission for promotion through either mutation", async () => {
    const { owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "MEMBER");
    const { view } = await caller.sessionViews.create({
      ...input,
      ownership: "PRIVATE",
    });
    const original = projectRoleAccessRights.MEMBER;
    onTestFinished(() => {
      projectRoleAccessRights.MEMBER = original;
    });
    projectRoleAccessRights.MEMBER = original.filter(
      (scope) => scope !== "SessionViews:CUD",
    );
    await expect(
      caller.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.sessionViews.setDefaultPin({
        projectId: input.projectId,
        id: view.id,
        isPinnedByDefaultForProject: true,
        promoteToProject: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("checks project view scopes independently of queue and private view scopes", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const { view } = await callerFor(owner.id, "ADMIN").sessionViews.create(
      input,
    );
    const original = projectRoleAccessRights.MEMBER;
    onTestFinished(() => {
      projectRoleAccessRights.MEMBER = original;
    });
    projectRoleAccessRights.MEMBER = original.filter(
      (scope) => scope !== "SessionViews:CUD" && scope !== "SessionViews:read",
    );
    const member = callerFor(other.id, "MEMBER");
    expect(await member.sessionViews.list({ projectId: project.id })).toEqual(
      [],
    );
    await expect(
      member.sessionViews.create({ ...input, name: "Denied" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      member.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await member.sessionViews.create({
      ...input,
      ownership: "PRIVATE",
      name: "Allowed private",
    });
    const scoreConfig = await prisma.scoreConfig.create({
      data: { projectId: project.id, name: "Quality", dataType: "NUMERIC" },
    });
    await expect(
      member.annotationQueues.create({
        projectId: project.id,
        name: "Denied attachment",
        scoreConfigIds: [scoreConfig.id],
        sessionViewId: view.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    projectRoleAccessRights.MEMBER = original.filter(
      (scope) =>
        scope !== "annotationQueues:CUD" &&
        scope !== "TableViewPresets:CUD" &&
        scope !== "TableViewPresets:read",
    );
    await expect(
      member.sessionViews.update({
        ...input,
        id: view.id,
        name: "Project writer",
      }),
    ).resolves.toMatchObject({ view: { name: "Project writer" } });
    await expect(
      member.sessionViews.create({
        ...input,
        ownership: "PRIVATE",
        name: "Denied private",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps private views invisible to other members and administrators, including pins", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "MEMBER");
    const { ownership: _ownership, ...privateInput } = input;
    const { view } = await creator.sessionViews.create(privateInput);
    expect(view).toMatchObject({ ownership: "PRIVATE" });
    await prisma.sessionViewPinOverride.create({
      data: {
        projectId: project.id,
        userId: other.id,
        viewId: view.id,
        position: 0,
      },
    });
    await prisma.sessionView.update({
      where: { projectId: project.id, id: view.id },
      data: { isPinnedByDefaultForProject: true },
    });
    for (const role of ["MEMBER", "ADMIN", "OWNER"] as const) {
      const outsider = callerFor(other.id, role);
      expect(
        await outsider.sessionViews.list({ projectId: project.id }),
      ).toEqual([]);
      await expect(
        outsider.sessionViews.update({ ...privateInput, id: view.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        outsider.sessionViews.delete({ projectId: project.id, id: view.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await outsider.sessionViews.setPreferences({
        projectId: project.id,
        pinnedViewIds: [view.id],
      });
      expect(
        await outsider.sessionViews.preferences({ projectId: project.id }),
      ).toEqual({ pinnedViewIds: ["messages"] });
      await expect(
        outsider.sessionViews.setDefaultPin({
          projectId: project.id,
          id: view.id,
          isPinnedByDefaultForProject: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
  it("allows deleting a view while another user updates an existing pin", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const admin = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const { view } = await admin.sessionViews.create(input);
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
      unpinnedViewIds: ["messages"],
    });
    let pinWrite: Promise<void> | undefined;
    const deletion = prisma.$transaction(
      async (tx) => {
        const [connection] = await tx.$queryRaw<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid
        `;
        await tx.$queryRaw`
        SELECT id FROM session_views
        WHERE project_id = ${project.id} AND id = ${view.id}
        FOR UPDATE
      `;
        let pinWriteFinished = false;
        pinWrite = reader.sessionViews
          .setPreferences({
            projectId: project.id,
            pinnedViewIds: ["messages"],
            unpinnedViewIds: [view.id],
          })
          .finally(() => {
            pinWriteFinished = true;
          });
        // Observe the actual lock wait so the competing deletion is deterministic.
        // An in-place pin update can finish without waiting on the view row.
        pinWrite.catch(() => undefined);
        await vi.waitFor(
          async () => {
            const [activity] = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database()
                  AND ${connection!.pid} = ANY(pg_blocking_pids(pid))
          ) AS waiting
        `;
            expect(pinWriteFinished || activity?.waiting).toBe(true);
          },
          { timeout: 3000, interval: 10 },
        );
        await tx.sessionView.delete({
          where: { projectId: project.id, id: view.id },
        });
      },
      { timeout: 10000 },
    );
    await expect(deletion).resolves.toBeUndefined();
    await expect(pinWrite).resolves.toBeUndefined();
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: ["messages"] });
  });

  it("preserves every pin and distinct positions for concurrent first saves", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        caller.sessionViews.create({
          ...input,
          name: `Concurrent view ${index}`,
        }),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "fulfilled",
      "fulfilled",
    ]);
    const viewIds = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value.view.id] : [],
    );
    const pins = await prisma.sessionViewPinOverride.findMany({
      where: {
        projectId: project.id,
        userId: owner.id,
        viewId: { not: null },
      },
      orderBy: { position: "asc" },
    });
    expect(pins.map((pin) => pin.position)).toEqual([0, 1, 2, 3]);
    expect(new Set(pins.map((pin) => pin.viewId))).toEqual(new Set(viewIds));
    const { pinnedViewIds } = await caller.sessionViews.preferences({
      projectId: project.id,
    });
    expect(pinnedViewIds).toHaveLength(5);
    expect(new Set(pinnedViewIds)).toEqual(new Set(["messages", ...viewIds]));
  });

  it.each<{
    orgRole: Role;
    projectRole: Exclude<Role, "AI_GATEWAY"> | null;
    losesAccess: boolean;
  }>([
    { orgRole: "NONE", projectRole: null, losesAccess: true },
    { orgRole: "AI_GATEWAY", projectRole: null, losesAccess: true },
    { orgRole: "VIEWER", projectRole: null, losesAccess: false },
    { orgRole: "NONE", projectRole: "MEMBER", losesAccess: false },
    { orgRole: "ADMIN", projectRole: "NONE", losesAccess: false },
    { orgRole: "AI_GATEWAY", projectRole: "VIEWER", losesAccess: false },
  ])(
    "only deletes owned views when effective project access is lost ($orgRole / $projectRole)",
    async ({ orgRole, projectRole, losesAccess }) => {
      const { project, org, owner, other, callerFor, input } = await prepare();
      const admin = callerFor(owner.id, "ADMIN");
      const creator = callerFor(other.id, "ADMIN");
      const { view } = await creator.sessionViews.create({
        ...input,
        ownership: "PRIVATE",
      });
      const membership = await updateOrgMembership(prisma, {
        orgId: org.id,
        userId: other.id,
        role: orgRole,
      });
      await createProjectMembership(prisma, {
        orgId: org.id,
        projectId: project.id,
        userId: other.id,
        orgMembershipId: membership.id,
        role: "MEMBER",
      });
      const { view: retained } = await admin.sessionViews.create({
        ...input,
        name: "Other owner's view",
      });
      await admin.members.updateProjectRole({
        orgId: org.id,
        orgMembershipId: membership.id,
        userId: other.id,
        projectId: project.id,
        projectRole,
      });
      expect(
        await prisma.sessionView.findUnique({ where: { id: view.id } }),
      ).toEqual(losesAccess ? null : expect.objectContaining({ id: view.id }));
      expect(
        await prisma.sessionView.findUnique({ where: { id: retained.id } }),
      ).not.toBeNull();
      expect(
        await prisma.sessionViewPinOverride.count({
          where: { viewId: view.id },
        }),
      ).toBe(losesAccess ? 0 : 1);
      expect(
        await prisma.sessionViewPinOverride.count({
          where: { projectId: project.id, userId: other.id, viewId: null },
        }),
      ).toBe(1);
    },
  );

  it("deletes owned views and pins when organization membership is removed", async () => {
    const { project, org, owner, other, callerFor, input } = await prepare();
    const { view } = await callerFor(other.id, "ADMIN").sessionViews.create({
      ...input,
      ownership: "PRIVATE",
    });
    const { view: projectView } = await callerFor(
      other.id,
      "ADMIN",
    ).sessionViews.create(input);
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: org.id, userId: other.id } },
    });
    await callerFor(owner.id, "ADMIN").members.deleteMembership({
      orgId: org.id,
      orgMembershipId: membership.id,
    });
    expect(
      await prisma.sessionView.findUnique({ where: { id: view.id } }),
    ).toBeNull();
    expect(
      await prisma.sessionView.findUnique({ where: { id: projectView.id } }),
    ).toMatchObject({ ownership: "PROJECT" });
    expect(
      await prisma.sessionViewPinOverride.count({ where: { viewId: view.id } }),
    ).toBe(0);
    expect(
      await prisma.sessionViewPinOverride.count({
        where: { projectId: project.id, userId: other.id, viewId: null },
      }),
    ).toBe(1);
  });

  it("appends new custom pins after reordered Messages and preserves the Messages opt-out when defaults change", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const admin = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const { view: first } = await admin.sessionViews.create(input);
    await admin.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [first.id, "messages"],
    });
    const { view: second } = await admin.sessionViews.create({
      ...input,
      name: "Second",
    });
    await expect(
      admin.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [first.id, "messages", second.id],
    });
    await admin.sessionViews.setDefaultPin({
      isPinnedByDefaultForProject: true,
      projectId: project.id,
      id: first.id,
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages", first.id],
    });
    expect(
      await prisma.sessionViewPinOverride.count({
        where: { projectId: project.id, userId: other.id },
      }),
    ).toBe(0);
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [first.id],
      unpinnedViewIds: ["messages"],
    });
    await admin.sessionViews.setDefaultPin({
      isPinnedByDefaultForProject: true,
      projectId: project.id,
      id: second.id,
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [first.id, second.id],
    });
  });

  it("uses pinned IDs for ordering, deduplicating and dropping stale targets", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view: first } = await caller.sessionViews.create(input);
    const { view: second } = await caller.sessionViews.create({
      ...input,
      name: "Second",
    });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [second.id, "missing", "messages", first.id, second.id],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [second.id, "messages", first.id],
    });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [first.id, second.id],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [first.id, second.id],
    });
  });

  it("preserves explicit unpins across membership removal and re-grant", async () => {
    const { project, org, other, callerFor } = await prepare();
    const caller = callerFor(other.id, "VIEWER");
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
      unpinnedViewIds: ["messages"],
    });
    await deleteOrgMembership(prisma, { orgId: org.id, userId: other.id });
    await createOrgMembership(prisma, {
      orgId: org.id,
      userId: other.id,
      role: "VIEWER",
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
  });

  it("defaults to Messages without writing preferences and persists explicit unpins", async () => {
    const { project, owner, callerFor } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    expect(
      await prisma.sessionViewPinOverride.count({
        where: {
          projectId: project.id,
          userId: owner.id,
        },
      }),
    ).toBe(0);
    const initial = await Promise.all([
      caller.sessionViews.preferences({ projectId: project.id }),
      caller.sessionViews.preferences({ projectId: project.id }),
    ]);
    expect(initial).toEqual([
      { pinnedViewIds: ["messages"] },
      { pinnedViewIds: ["messages"] },
    ]);
    expect(
      await prisma.sessionViewPinOverride.count({
        where: { projectId: project.id, userId: owner.id },
      }),
    ).toBe(0);
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: ["messages"] });
  });

  it("honors an explicit unpin before the first preferences query", async () => {
    const { project, owner, callerFor } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
  });

  it("enforces override uniqueness and project isolation, and preserves Messages when a view is deleted", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view } = await caller.sessionViews.create(input);
    const data = { projectId: project.id, userId: owner.id, position: 0 };
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      prisma.sessionViewPinOverride.create({ data: { ...data, viewId: null } }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      prisma.sessionViewPinOverride.create({
        data: { ...data, viewId: view.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    const foreign = await createOrgProjectAndApiKey();
    onTestFinished(async () => {
      await prisma.organization.delete({ where: { id: foreign.org.id } });
    });
    await expect(
      prisma.sessionViewPinOverride.create({
        data: { ...data, projectId: foreign.project.id, viewId: view.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.sessionViewPinOverride.create({
        data: { ...data, projectId: randomUUID(), viewId: null },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      prisma.sessionViewPinOverride.create({
        data: { ...data, userId: randomUUID(), viewId: null },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await caller.sessionViews.delete({ projectId: project.id, id: view.id });
    expect(
      await prisma.sessionViewPinOverride.count({
        where: { viewId: view.id },
      }),
    ).toBe(0);
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
  });

  it("stores project defaults independently, preserves personal overrides, and requires project view write access", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const admin = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const { view } = await admin.sessionViews.create(input);
    const { view: second } = await admin.sessionViews.create({
      ...input,
      name: "Second",
    });
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages", second.id],
    });
    await expect(
      reader.sessionViews.setDefaultPin({
        isPinnedByDefaultForProject: true,
        projectId: project.id,
        id: view.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await admin.sessionViews.setDefaultPin({
      isPinnedByDefaultForProject: true,
      projectId: project.id,
      id: view.id,
    });
    await admin.sessionViews.setDefaultPin({
      isPinnedByDefaultForProject: true,
      projectId: project.id,
      id: view.id,
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages", second.id, view.id],
    });
    await expect(
      admin.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages", view.id, second.id],
    });
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages", second.id],
      unpinnedViewIds: [view.id],
    });
    await admin.sessionViews.setDefaultPin({
      projectId: project.id,
      id: view.id,
      isPinnedByDefaultForProject: false,
    });
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages", second.id],
    });
    await admin.sessionViews.setDefaultPin({
      projectId: project.id,
      id: view.id,
      isPinnedByDefaultForProject: true,
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: ["messages", second.id] });
    expect(
      (await reader.sessionViews.list({ projectId: project.id })).find(
        (candidate) => candidate.id === view.id,
      )?.isPinnedByDefaultForProject,
    ).toBe(true);
    await admin.sessionViews.delete({ projectId: project.id, id: view.id });
    expect(
      await prisma.sessionViewPinOverride.count({ where: { viewId: view.id } }),
    ).toBe(0);
  });
  it("stores opt-in pins independently of newly created views", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const { view } = await creator.sessionViews.create(input);
    const unpinned = await prisma.sessionView.create({
      data: {
        ...input,
        name: "Unpinned view",
      },
    });
    await expect(
      creator.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages", view.id],
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: ["messages"] });
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [unpinned.id],
      unpinnedViewIds: ["messages"],
    });
    const { view: another } = await creator.sessionViews.create({
      ...input,
      name: "Another view",
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [unpinned.id],
    });
    await expect(
      creator.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages", view.id, another.id],
    });
  });

  it("rejects score filters when creating or updating views", async () => {
    const { owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view } = await caller.sessionViews.create(input);
    const filters = [
      {
        column: "scores_avg",
        type: "numberObject" as const,
        key: "quality",
        operator: ">" as const,
        value: 0.5,
      },
    ];
    await expect(
      caller.sessionViews.create({ ...input, name: "Scores", filters }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.sessionViews.update({ ...input, id: view.id, filters }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each([
    {
      column: "commentContent",
      type: "string" as const,
      operator: "starts with" as const,
      value: "secret",
    },
    {
      column: "commentCount",
      type: "number" as const,
      operator: ">" as const,
      value: 0,
    },
  ])(
    "rejects anonymous public-session filtering on $column",
    async (filter) => {
      const { project } = await prepare();
      const sessionId = randomUUID();
      await prisma.traceSession.create({
        data: { id: sessionId, projectId: project.id, public: true },
      });
      const caller = appRouter.createCaller({
        ...createInnerTRPCContext({ session: null, headers: {} }),
        prisma,
      });
      await expect(
        caller.sessions.tracesFromEvents({
          projectId: project.id,
          sessionId,
          filter: [filter],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    },
  );

  it("lets administrators manage orphaned views and reports missing IDs", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const admin = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const view = await prisma.sessionView.create({ data: input });
    await expect(
      reader.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.sessionViews.list({ projectId: project.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: view.id, canEdit: true }),
    ]);
    await admin.sessionViews.update({
      ...input,
      id: view.id,
      name: "Recovered",
    });
    await admin.sessionViews.delete({ projectId: project.id, id: view.id });
    await expect(
      admin.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      admin.sessionViews.delete({ projectId: project.id, id: view.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("lets project writers manage other creators' project views while denying viewers", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "MEMBER");
    const otherMember = callerFor(other.id, "MEMBER");
    const { view } = await creator.sessionViews.create(input);
    expect(view).toMatchObject({
      ...input,
      createdBy: owner.id,
    });
    await expect(
      otherMember.sessionViews.list({ projectId: project.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: view.id, ...input, canEdit: true }),
    ]);
    await expect(
      otherMember.sessionViews.update({
        ...input,
        id: view.id,
        name: "Stolen",
      }),
    ).resolves.toMatchObject({ view: { name: "Stolen" } });
    await creator.sessionViews.update({
      ...input,
      id: view.id,
      name: "Creator edit",
    });
    const demotedCreator = callerFor(owner.id, "VIEWER");
    await expect(
      demotedCreator.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      demotedCreator.sessionViews.delete({
        projectId: project.id,
        id: view.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const role of ["ADMIN", "OWNER"] as const) {
      const administrator = callerFor(other.id, role);
      await expect(
        administrator.sessionViews.list({ projectId: project.id }),
      ).resolves.toEqual([
        expect.objectContaining({ id: view.id, canEdit: true }),
      ]);
      await administrator.sessionViews.update({
        ...input,
        id: view.id,
        name: `${role} edit`,
      });
    }
    await callerFor(other.id, "ADMIN").sessionViews.delete({
      projectId: project.id,
      id: view.id,
    });
    await expect(
      prisma.sessionView.findUnique({ where: { id: view.id } }),
    ).resolves.toBeNull();
  });

  it("persists configuration when creating and updating a view", async () => {
    const { owner, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "ADMIN");
    const { view } = await creator.sessionViews.create(input);
    expect(view).toMatchObject({
      ...input,
      createdBy: owner.id,
    });
    await expect(
      creator.sessionViews.update({
        ...input,
        id: view.id,
        name: "Renamed",
        viewMode: "conversational",
        unmatchedTraces: "show",
      }),
    ).resolves.toMatchObject({
      view: {
        name: "Renamed",
        viewMode: "conversational",
        unmatchedTraces: "show",
        filters: input.filters,
      },
    });
  });

  it("stores independent preferences for each user, including Messages, without changing the shared view", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "ADMIN");
    const reader = callerFor(other.id, "VIEWER");
    const { view } = await creator.sessionViews.create(input);
    await creator.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
      unpinnedViewIds: ["messages"],
    });
    await reader.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages"],
    });
    await expect(
      creator.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [view.id],
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages"],
    });
    await expect(
      reader.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reader.sessionViews.create({ ...input, name: "Forbidden" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reader.sessionViews.delete({ projectId: project.id, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await creator.sessionViews.delete({ projectId: project.id, id: view.id });
    await expect(
      creator.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [],
    });
    await expect(
      reader.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages"],
    });
  });

  it("drops deleted view IDs when preferences are next written", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view } = await caller.sessionViews.create(input);
    const { view: remaining } = await caller.sessionViews.create({
      ...input,
      name: "Remaining",
    });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
      unpinnedViewIds: ["messages", remaining.id],
    });

    await caller.sessionViews.delete({ projectId: project.id, id: view.id });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id, "messages"],
    });

    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages"],
    });
  });

  it("allows creating and renaming project views to duplicate names", async () => {
    const { owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view: first } = await caller.sessionViews.create(input);
    const { view: duplicate } = await caller.sessionViews.create({
      ...input,
      name: "  Generations  ",
    });
    expect(duplicate.name).toBe(input.name);
    expect(duplicate.id).not.toBe(first.id);
    const { view: renamed } = await caller.sessionViews.create({
      ...input,
      name: "Another view",
    });
    await expect(
      caller.sessionViews.update({ ...input, id: renamed.id }),
    ).resolves.toMatchObject({ view: { id: renamed.id, name: input.name } });
  });

  it("isolates views and preferences across projects", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const foreign = await createOrgProjectAndApiKey();
    onTestFinished(async () => {
      await prisma.organization.delete({ where: { id: foreign.org.id } });
    });
    const view = await prisma.sessionView.create({
      data: { ...input, projectId: foreign.project.id, createdBy: owner.id },
    });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
      unpinnedViewIds: ["messages"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [],
    });
    await expect(
      caller.sessionViews.update({ ...input, id: view.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.sessionViews.delete({ projectId: project.id, id: view.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.sessionViews.list({ projectId: foreign.project.id }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
