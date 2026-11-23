import { randomUUID } from "node:crypto";
import { prisma } from "@langfuse/shared/src/db";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";

const allowlists = vi.hoisted(() => ({
  markdown: [] as string[],
  multiQuery: [] as string[],
}));

vi.mock(import("@/src/env.mjs"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "LANGFUSE_DASHBOARD_MARKDOWN_ENABLED_PROJECT_IDS")
          return allowlists.markdown;
        if (property === "LANGFUSE_DASHBOARD_MULTI_QUERY_ENABLED_PROJECT_IDS")
          return allowlists.multiQuery;
        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

describe("project dashboard blocks", () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  const managedId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const config = { title: "Read this", content: "## A note" };
  const multiQueryConfig = {
    version: 1 as const,
    title: "Records",
    description: "",
    queries: [
      {
        id: "a",
        label: "Records",
        view: "observations" as const,
        metrics: [
          { id: "count", measure: "count", aggregation: "count" as const },
        ],
        filters: [],
        dimensions: [],
      },
    ],
    display: { chartType: "NUMBER" as const },
  };

  function caller(project: string, role: "ADMIN" | "VIEWER" = "ADMIN") {
    const session = createSession({
      user: { id: userId },
      organizations: [
        { id: orgId, role: "NONE", projects: [{ id: project, role }] },
      ],
    });
    return appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    });
  }

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId } });
    await prisma.dashboard.create({
      data: {
        id: managedId,
        name: "Managed template",
        description: "",
        definition: { widgets: [] },
      },
    });
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Dashboard block fixtures",
        projects: {
          create: [projectId, otherProjectId].map((id) => ({ id, name: id })),
        },
      },
    });
  });

  beforeEach(() => {
    allowlists.markdown.length = 0;
    allowlists.multiQuery.length = 0;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.dashboard.delete({ where: { id: managedId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("preserves anchored blocks across legacy saves and flag rollback, then clones and cascades them", async () => {
    const owner = caller(projectId);
    const dashboard = await owner.dashboard.createDashboard({
      projectId,
      name: "Notebook",
      description: "",
    });
    const target = { projectId, dashboardId: dashboard.id };
    const placement = {
      type: "widget" as const,
      id: "placement-a",
      widgetId: "widget-a",
      x: 0,
      y: 0,
      x_size: 4,
      y_size: 3,
    };
    await owner.dashboard.updateDashboardDefinition({
      ...target,
      definition: { widgets: [placement] },
    });

    const create = {
      ...target,
      kind: "markdown" as const,
      id: randomUUID(),
      expectedRevision: 0,
      config,
      beforePlacementId: placement.id,
    };
    await expect(
      owner.dashboardBlocks.capabilities({ projectId }),
    ).resolves.toEqual({ markdown: false, multiQuery: false });
    await expect(owner.dashboardBlocks.save(create)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    allowlists.markdown.push(projectId);
    const block = await owner.dashboardBlocks.save(create);
    expect(block).toMatchObject({
      id: create.id,
      revision: 1,
      config,
      beforePlacementId: placement.id,
    });
    const edited = await owner.dashboardBlocks.save({
      ...target,
      kind: "markdown",
      id: block.id,
      expectedRevision: 1,
      config: { ...config, content: "Updated note" },
    });
    expect(edited.beforePlacementId).toBe(placement.id);
    const second = await owner.dashboardBlocks.save({
      ...create,
      id: randomUUID(),
    });
    const legacy = await owner.dashboard.getDashboard(target);
    expect(legacy.definition).toEqual({ widgets: [placement] });
    await expect(
      prisma.dashboard.findUniqueOrThrow({
        where: { id: dashboard.id },
        select: { definition: true },
      }),
    ).resolves.toEqual({ definition: legacy.definition });

    allowlists.markdown.length = 0;
    await expect(owner.dashboardBlocks.getAll(target)).resolves.toEqual([]);
    const clone = await owner.dashboard.cloneDashboard(target);
    const cloneTarget = { projectId, dashboardId: clone.id };
    await owner.dashboard.updateDashboardDefinition({
      ...target,
      definition: { widgets: [] },
    });

    allowlists.markdown.push(projectId);
    await expect(owner.dashboardBlocks.getAll(cloneTarget)).resolves.toEqual([
      { ...edited, revision: 1 },
      second,
    ]);
    await expect(owner.dashboardBlocks.getAll(target)).resolves.toEqual(
      [edited, second].map((b) => ({ ...b, beforePlacementId: null })),
    );
    await owner.dashboard.delete(cloneTarget);
    expect(
      await prisma.dashboardBlock.count({ where: { dashboardId: clone.id } }),
    ).toBe(0);
    expect(await owner.dashboardBlocks.getAll(target)).toHaveLength(2);
  });

  it("enforces kind gates, tenant and role scopes, and atomic per-block revisions", async () => {
    const owner = caller(projectId);
    const viewer = caller(projectId, "VIEWER");
    const outsider = caller(otherProjectId);
    const dashboard = await owner.dashboard.createDashboard({
      projectId,
      name: "Permissions",
      description: "",
    });
    const target = { projectId, dashboardId: dashboard.id };
    const write = {
      ...target,
      id: randomUUID(),
      kind: "markdown" as const,
      expectedRevision: 0,
      config,
    };
    const chart = {
      ...target,
      id: randomUUID(),
      kind: "multiQuery" as const,
      expectedRevision: 0,
      config: multiQueryConfig,
    };
    allowlists.markdown.push(projectId, otherProjectId);
    await expect(owner.dashboardBlocks.save(chart)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(viewer.dashboardBlocks.save(write)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      owner.dashboardBlocks.getAll({ projectId, dashboardId: managedId }),
    ).resolves.toEqual([]);
    await expect(
      owner.dashboardBlocks.save({ ...write, dashboardId: managedId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const first = await owner.dashboardBlocks.save(write);
    await expect(owner.dashboardBlocks.save(write)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(viewer.dashboardBlocks.getAll(target)).resolves.toEqual([
      first,
    ]);

    const foreign = { projectId: otherProjectId, dashboardId: dashboard.id };
    await expect(
      outsider.dashboardBlocks.getAll(foreign),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.dashboardBlocks.save({ ...write, ...foreign, id: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.dashboardBlocks.remove({
        ...foreign,
        id: first.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      outsider.dashboard.cloneDashboard(foreign),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updates = await Promise.allSettled(
      ["One", "Two"].map((content) =>
        owner.dashboardBlocks.save({
          ...write,
          expectedRevision: 1,
          config: { ...config, content },
        }),
      ),
    );
    expect(updates.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect(updates.find((s) => s.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    await expect(
      owner.dashboardBlocks.remove({
        ...target,
        id: first.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    allowlists.markdown.length = 0;
    allowlists.multiQuery.push(projectId);
    await expect(
      owner.dashboardBlocks.save({ ...chart, id: first.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const savedChart = await owner.dashboardBlocks.save(chart);
    await expect(
      owner.dashboardBlocks.getAll({ ...target, kinds: [] }),
    ).resolves.toEqual([]);
    await expect(
      owner.dashboardBlocks.getAll({ ...target, kinds: ["markdown"] }),
    ).resolves.toEqual([]);
    await expect(
      owner.dashboardBlocks.getAll({
        ...target,
        kinds: ["markdown", "multiQuery"],
      }),
    ).resolves.toEqual([savedChart]);
    await expect(owner.dashboardBlocks.getAll(target)).resolves.toEqual([
      savedChart,
    ]);
    await expect(
      owner.dashboardBlocks.remove({
        ...target,
        id: first.id,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.dashboardBlocks.save({
        ...chart,
        id: first.id,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    allowlists.markdown.push(projectId);
    await expect(
      owner.dashboardBlocks.getAll({ ...target, kinds: ["multiQuery"] }),
    ).resolves.toEqual([savedChart]);
    await expect(
      owner.dashboardBlocks.remove({
        ...target,
        id: first.id,
        expectedRevision: 2,
      }),
    ).resolves.toEqual({ success: true });
    await expect(owner.dashboardBlocks.getAll(target)).resolves.toEqual([
      savedChart,
    ]);
  });

  it("keeps future block formats opaque across reads, revision-checked writes, deletion, and cloning", async () => {
    allowlists.markdown.push(projectId);
    allowlists.multiQuery.push(projectId);
    const owner = caller(projectId);
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Format compatibility",
      description: "",
    });
    const target = { projectId, dashboardId };
    const legacyId = randomUUID();
    const futureMarkdown = randomUUID();
    const futureChart = randomUUID();
    const malformed = randomUUID();
    const future = [
      {
        id: futureMarkdown,
        kind: "markdown" as const,
        config: { ...config, version: 2, sections: [{ value: "Future note" }] },
      },
      {
        id: futureChart,
        kind: "multiQuery" as const,
        config: {
          ...multiQueryConfig,
          version: 2,
          formula: { terms: ["a", "b"] },
        },
      },
      {
        id: malformed,
        kind: "markdown" as const,
        config: { ...config, version: null },
      },
    ];
    await prisma.dashboardBlock.createMany({
      data: [
        { dashboardId, id: legacyId, kind: "markdown", config },
        ...future.map((row) => ({ ...row, dashboardId, revision: 7 })),
      ],
    });

    // This future value loses precision if a clone decodes and re-encodes it in JavaScript.
    await prisma.$executeRaw`
      UPDATE dashboard_blocks SET config = jsonb_set(config, '{precision}', '9007199254740993.125000'::jsonb)
      WHERE dashboard_id = ${dashboardId} AND id = ${futureChart}::uuid
    `;
    const storedBytes = (id: string) => prisma.$queryRaw<
      { id: string; config: Uint8Array; revision: number }[]
    >`
      SELECT id::text, jsonb_send(config) AS config, revision
      FROM dashboard_blocks WHERE dashboard_id = ${id} ORDER BY id
    `;
    const before = await storedBytes(dashboardId);

    await expect(owner.dashboardBlocks.getAll(target)).resolves.toEqual([
      {
        id: legacyId,
        kind: "markdown",
        revision: 1,
        beforePlacementId: null,
        config: { ...config, version: 1 },
      },
    ]);
    for (const row of future) {
      const identity = { ...target, id: row.id, expectedRevision: 7 };
      const save =
        row.kind === "markdown"
          ? owner.dashboardBlocks.save({
              ...identity,
              kind: "markdown",
              config,
            })
          : owner.dashboardBlocks.save({
              ...identity,
              kind: "multiQuery",
              config: multiQueryConfig,
            });
      await expect(save).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        owner.dashboardBlocks.remove(identity),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }

    const clone = await owner.dashboard.cloneDashboard(target);
    await expect(storedBytes(dashboardId)).resolves.toEqual(before);
    await expect(storedBytes(clone.id)).resolves.toEqual(
      before.map((row) => ({ ...row, revision: 1 })),
    );
    const legacy = await owner.dashboardBlocks.save({
      ...target,
      id: legacyId,
      expectedRevision: 1,
      kind: "markdown",
      config,
    });
    expect(legacy.config).toEqual({ ...config, version: 1 });
    await expect(
      prisma.dashboardBlock.findUniqueOrThrow({
        where: { dashboardId_id: { dashboardId, id: legacyId } },
        select: { config: true },
      }),
    ).resolves.toEqual({ config: { ...config, version: 1 } });
    await expect(
      owner.dashboardBlocks.remove({
        ...target,
        id: legacyId,
        expectedRevision: 2,
      }),
    ).resolves.toEqual({ success: true });
  });
});
