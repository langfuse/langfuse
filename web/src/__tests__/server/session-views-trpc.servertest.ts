import { randomUUID } from "node:crypto";
import { onTestFinished } from "vitest";
import { type Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

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
  await prisma.organizationMembership.createMany({
    data: [
      { orgId: org.id, userId: owner.id, role: "ADMIN" },
      { orgId: org.id, userId: other.id, role: "VIEWER" },
    ],
  });
  const callerFor = (userId: string, role: "ADMIN" | "VIEWER") => {
    const session: Session = {
      expires: "1",
      user: {
        id: userId,
        canCreateOrganizations: true,
        name: "Session view test user",
        admin: false,
        featureFlags: testFeatureFlags(),
        organizations: [
          {
            id: org.id,
            name: org.name,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: project.id,
                role,
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
      },
      environment: {
        enableExperimentalFeatures: false,
        selfHostedInstancePlan: "cloud:hobby",
      },
    };
    return appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    });
  };
  const input = {
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
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: [first.id, second.id],
    });
  });

  it("pins new projects for inherited members and pins explicit project access grants", async () => {
    const { org, owner, other } = await prepare();
    const membership = await prisma.organizationMembership.update({
      where: { orgId_userId: { orgId: org.id, userId: other.id } },
      data: { role: "NONE" },
    });
    const project = await prisma.project.create({
      data: { orgId: org.id, name: "New project" },
    });
    expect(
      await prisma.sessionViewPin.findMany({
        where: { projectId: project.id },
        select: { userId: true, builtinView: true },
      }),
    ).toEqual([{ userId: owner.id, builtinView: "messages" }]);
    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: other.id,
        orgMembershipId: membership.id,
        role: "VIEWER",
      },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: {
          projectId: project.id,
          userId: other.id,
          builtinView: "messages",
        },
      }),
    ).toBe(1);
    await prisma.sessionViewPin.deleteMany({
      where: { projectId: project.id, userId: other.id },
    });
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: other.id } },
      data: { role: "MEMBER" },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: { projectId: project.id, userId: other.id },
      }),
    ).toBe(0);
  });

  it("only re-pins on a genuine access grant, including deleting a restrictive override", async () => {
    const { project, org, other } = await prepare();
    const membership = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: org.id, userId: other.id } },
    });
    await prisma.sessionViewPin.deleteMany({
      where: { projectId: project.id, userId: other.id },
    });
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role: "MEMBER" },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: { projectId: project.id, userId: other.id },
      }),
    ).toBe(0);
    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: other.id,
        orgMembershipId: membership.id,
        role: "NONE",
      },
    });
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role: "ADMIN" },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: { projectId: project.id, userId: other.id },
      }),
    ).toBe(0);
    await prisma.projectMembership.delete({
      where: { projectId_userId: { projectId: project.id, userId: other.id } },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: {
          projectId: project.id,
          userId: other.id,
          builtinView: "messages",
        },
      }),
    ).toBe(1);
    await prisma.sessionViewPin.deleteMany({
      where: { projectId: project.id, userId: other.id },
    });
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role: "AI_GATEWAY" },
    });
    await prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { role: "VIEWER" },
    });
    expect(
      await prisma.sessionViewPin.count({
        where: {
          projectId: project.id,
          userId: other.id,
          builtinView: "messages",
        },
      }),
    ).toBe(1);
  });

  it("pins Messages on access grant and never restores it on reads", async () => {
    const { project, owner, callerFor } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    expect(
      await prisma.sessionViewPin.count({
        where: {
          projectId: project.id,
          userId: owner.id,
          builtinView: "messages",
        },
      }),
    ).toBe(1);
    const initial = await Promise.all([
      caller.sessionViews.preferences({ projectId: project.id }),
      caller.sessionViews.preferences({ projectId: project.id }),
    ]);
    expect(initial).toEqual([
      { pinnedViewIds: ["messages"] },
      { pinnedViewIds: ["messages"] },
    ]);
    expect(
      await prisma.sessionViewPin.count({
        where: { projectId: project.id, userId: owner.id },
      }),
    ).toBe(1);
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [],
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
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({ pinnedViewIds: [] });
  });

  it("enforces one valid target per pin and unique built-in pins", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view } = await caller.sessionViews.create(input);
    const data = { projectId: project.id, userId: owner.id, position: 0 };
    await expect(prisma.sessionViewPin.create({ data })).rejects.toThrow();
    await expect(
      prisma.sessionViewPin.create({
        data: { ...data, viewId: view.id, builtinView: "messages" },
      }),
    ).rejects.toThrow();
    await caller.sessionViews.preferences({ projectId: project.id });
    await expect(
      prisma.sessionViewPin.create({
        data: { ...data, builtinView: "messages" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("pins for current project members only, preserves order, and requires admin access", async () => {
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
      reader.sessionViews.pinForEveryone({
        projectId: project.id,
        id: view.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await admin.sessionViews.pinForEveryone({
      projectId: project.id,
      id: view.id,
    });
    await admin.sessionViews.pinForEveryone({
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
    await admin.sessionViews.delete({ projectId: project.id, id: view.id });
    expect(
      await prisma.sessionViewPin.count({ where: { viewId: view.id } }),
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

  it("loads valid views even when a legacy row has unsupported filters", async () => {
    const { project, owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    const { view } = await caller.sessionViews.create(input);
    const invalid = await prisma.sessionView.create({
      data: {
        ...input,
        name: "Unsupported legacy preset",
        filters: [
          {
            column: "scores_avg",
            type: "numberObject",
            key: "quality",
            operator: ">",
            value: 0.5,
          },
        ],
      },
    });
    await expect(
      caller.sessionViews.list({ projectId: project.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: view.id, filters: input.filters }),
      expect.objectContaining({
        id: invalid.id,
        name: invalid.name,
        isSupported: false,
      }),
    ]);
    await expect(
      prisma.sessionView.findUnique({ where: { id: invalid.id } }),
    ).resolves.not.toBeNull();
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
  it("lets only the creator edit or delete a shared view", async () => {
    const { project, owner, other, callerFor, input } = await prepare();
    const creator = callerFor(owner.id, "ADMIN");
    const otherAdmin = callerFor(other.id, "ADMIN");
    const { view } = await creator.sessionViews.create(input);
    expect(view).toMatchObject({
      ...input,
      createdBy: owner.id,
    });
    await expect(
      otherAdmin.sessionViews.list({ projectId: project.id }),
    ).resolves.toEqual([
      expect.objectContaining({ id: view.id, ...input, canEdit: false }),
    ]);
    await expect(
      otherAdmin.sessionViews.update({ ...input, id: view.id, name: "Stolen" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      otherAdmin.sessionViews.delete({ projectId: project.id, id: view.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await creator.sessionViews.delete({ projectId: project.id, id: view.id });
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
    await caller.sessionViews.create({
      ...input,
      name: "Remaining",
    });
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: [view.id],
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

  it("rejects duplicate names after trimming whitespace", async () => {
    const { owner, callerFor, input } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    await caller.sessionViews.create(input);
    await expect(
      caller.sessionViews.create({ ...input, name: "  Generations  " }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("drops stale preference IDs", async () => {
    const { project, owner, callerFor } = await prepare();
    const caller = callerFor(owner.id, "ADMIN");
    await caller.sessionViews.setPreferences({
      projectId: project.id,
      pinnedViewIds: ["messages", "unsaved"],
    });
    await expect(
      caller.sessionViews.preferences({ projectId: project.id }),
    ).resolves.toEqual({
      pinnedViewIds: ["messages"],
    });
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
