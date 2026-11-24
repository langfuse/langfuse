import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { dashboardBlockPatchSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";

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

  function caller(
    project: string,
    role: "ADMIN" | "VIEWER" = "ADMIN",
    {
      email = "author@langfuse.com",
      optedIn = true,
      experimental = false,
      internalView = true,
    } = {},
  ) {
    const session = createSession({
      user: {
        id: userId,
        email,
        featureFlags: testFeatureFlags({
          dashboardBlockAuthoring: optedIn,
          internalFeatures: internalView,
        }),
      },
      environment: { enableExperimentalFeatures: experimental },
      organizations: [
        { id: orgId, role: "NONE", projects: [{ id: project, role }] },
      ],
    });
    return appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    });
  }

  function patchBlock(
    client: ReturnType<typeof caller>,
    target: { projectId: string; dashboardId: string },
    blockPatch: z.input<typeof dashboardBlockPatchSchema>,
  ) {
    return client.dashboard.updateDashboardDefinition({
      ...target,
      blockPatch,
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

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.dashboard.delete({ where: { id: managedId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("commits a concurrent classic layout and block patch to the same dashboard definition", async () => {
    const owner = caller(projectId);
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Concurrent definition updates",
      description: "",
    });
    const target = { projectId, dashboardId };
    const placement = {
      type: "widget" as const,
      id: "usage",
      widgetId: "widget-usage",
      x: 0,
      y: 0,
      x_size: 4,
      y_size: 3,
    };
    const id = randomUUID();
    const [layoutResult, blockResult] = await Promise.all([
      owner.dashboard.updateDashboardDefinition({
        ...target,
        definition: { widgets: [placement] },
      }),
      owner.dashboard.updateDashboardDefinition({
        ...target,
        blockPatch: {
          op: "upsert",
          id,
          kind: "markdown",
          config,
          expectedRevision: 0,
        },
      }),
    ]);
    expect(Object.keys(blockResult).sort()).toEqual(
      Object.keys(layoutResult).sort(),
    );
    const stored = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboardId },
      select: { definition: true },
    });
    expect(stored.definition).toMatchObject({
      version: "1",
      widgets: [placement],
      blocks: expect.arrayContaining([
        placement,
        {
          id,
          kind: "markdown",
          config: { ...config, version: 1 },
          revision: 1,
          beforePlacementId: null,
        },
      ]),
    });
  });

  it("preserves the mirrored layout, anchors, and blocks when a classic writer saves or clones the dashboard", async () => {
    const owner = caller(projectId, "ADMIN", {
      email: "author@LANGFUSE.COM",
      internalView: false,
    });
    const regular = caller(projectId, "ADMIN", {
      email: "reader@example.com",
      optedIn: false,
    });
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Notebook",
      description: "",
    });
    const target = { projectId, dashboardId };
    const placement = {
      type: "widget" as const,
      id: "",
      widgetId: "widget-a",
      x: 0,
      y: 0,
      x_size: 4,
      y_size: 3,
    };
    const secondPlacement = { ...placement, id: "部門".repeat(150), y: 3 };
    const definition = { widgets: [placement, secondPlacement] };
    await regular.dashboard.updateDashboardDefinition({
      ...target,
      definition,
    });

    const note = {
      op: "upsert" as const,
      kind: "markdown" as const,
      id: randomUUID(),
      expectedRevision: 0,
      config,
      beforePlacementId: placement.id,
    };
    const second = {
      ...note,
      id: randomUUID(),
      beforePlacementId: secondPlacement.id,
    };
    await patchBlock(owner, target, note);
    await patchBlock(owner, target, second);
    await Promise.all(
      [note, second].map(({ id }) =>
        patchBlock(owner, target, {
          op: "upsert",
          kind: "markdown",
          id,
          config: { ...config, content: id },
          expectedRevision: 1,
        }),
      ),
    );
    const expected = [note, second].map(({ id, beforePlacementId }) => ({
      id,
      kind: "markdown",
      config: { ...config, content: id, version: 1 },
      revision: 2,
      beforePlacementId,
    }));
    await expect(regular.dashboard.getDashboardBlocks(target)).resolves.toEqual(
      expected,
    );
    await expect(regular.dashboard.getDashboard(target)).resolves.toMatchObject(
      { definition, hasDashboardBlocks: true },
    );

    const moved = { ...placement, y: 9 };
    const legacyDefinition = { widgets: [moved] };
    await regular.dashboard.updateDashboardDefinition({
      ...target,
      definition: legacyDefinition,
    });
    await expect(regular.dashboard.getDashboard(target)).resolves.toMatchObject(
      {
        definition: legacyDefinition,
        hasDashboardBlocks: true,
      },
    );
    const anchored = [expected[0], { ...expected[1], beforePlacementId: null }];
    await expect(regular.dashboard.getDashboardBlocks(target)).resolves.toEqual(
      anchored,
    );

    // A legacy layout or clone override can carry extra JSON from its caller.
    const untrusted = { ...legacyDefinition, version: "1", blocks: [] };
    await regular.dashboard.updateDashboardDefinition({
      ...target,
      definition: untrusted,
    });
    const clone = await regular.dashboard.cloneDashboard({
      ...target,
      definition: untrusted,
    });
    const cloneTarget = { projectId, dashboardId: clone.id };
    await expect(
      regular.dashboard.getDashboardBlocks(cloneTarget),
    ).resolves.toEqual(anchored.map((block) => ({ ...block, revision: 1 })));
    await regular.dashboard.delete(cloneTarget);
    await expect(
      regular.dashboard.getDashboardBlocks(cloneTarget),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(regular.dashboard.getDashboardBlocks(target)).resolves.toEqual(
      anchored,
    );

    const stored = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboardId, projectId },
      select: { definition: true },
    });
    expect(stored.definition).toEqual({
      version: "1",
      widgets: [moved],
      blocks: expect.arrayContaining([moved, ...expected]),
    });
    expect(stored.definition).toMatchObject({ blocks: { length: 3 } });
  });

  it("enforces the employee opt-in, project permissions, kind and revision on block patches", async () => {
    const owner = caller(projectId, "ADMIN", {
      email: "author@clickhouse.com",
    });
    const viewer = caller(projectId, "VIEWER", {
      email: "viewer@example.com",
      optedIn: false,
    });
    const outsider = caller(otherProjectId);
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Permissions",
      description: "",
    });
    const target = { projectId, dashboardId };
    const chart = {
      op: "upsert" as const,
      id: randomUUID(),
      kind: "multiQuery" as const,
      config: multiQueryConfig,
      expectedRevision: 0,
    };
    const remove = { op: "remove" as const, id: chart.id, expectedRevision: 1 };
    await expect(
      owner.dashboard.getDashboardBlockCapabilities({ projectId }),
    ).resolves.toEqual({
      markdown: true,
      multiQuery: true,
    });

    await patchBlock(owner, target, chart);
    const [saved] = await viewer.dashboard.getDashboardBlocks(target);
    expect(saved).toMatchObject({
      id: chart.id,
      kind: "multiQuery",
      revision: 1,
    });
    for (const client of [
      viewer,
      caller(projectId, "VIEWER"),
      caller(projectId, "ADMIN", { optedIn: false, experimental: true }),
      caller(projectId, "ADMIN", {
        email: "user@example.com",
        optedIn: true,
        experimental: true,
      }),
      caller(projectId, "ADMIN", {
        email: "user@sub.langfuse.com",
        optedIn: true,
      }),
    ]) {
      await expect(
        client.dashboard.getDashboardBlockCapabilities({ projectId }),
      ).resolves.toEqual({ markdown: false, multiQuery: false });
      await expect(
        client.dashboard.getDashboardBlocks(target),
      ).resolves.toEqual([saved]);
      await expect(
        patchBlock(client, target, { ...chart, id: randomUUID() }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        patchBlock(client, target, { ...chart, expectedRevision: 1 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(patchBlock(client, target, remove)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    const mixedInput = {
      ...target,
      definition: { widgets: [] },
      blockPatch: remove,
    };
    await expect(
      owner.dashboard.updateDashboardDefinition(mixedInput as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const managed = { projectId, dashboardId: managedId };
    await expect(owner.dashboard.getDashboardBlocks(managed)).resolves.toEqual(
      [],
    );
    await expect(patchBlock(owner, managed, chart)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const foreign = { projectId: otherProjectId, dashboardId };
    await expect(
      outsider.dashboard.getDashboardBlocks(foreign),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(patchBlock(outsider, foreign, chart)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(patchBlock(outsider, foreign, remove)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      outsider.dashboard.cloneDashboard(foreign),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(patchBlock(owner, target, chart)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const note = {
      op: "upsert" as const,
      kind: "markdown" as const,
      config,
      id: randomUUID(),
      expectedRevision: 0,
    };
    await patchBlock(owner, target, note);
    const edits = await Promise.allSettled(
      ["One", "Two"].map((content) =>
        patchBlock(owner, target, {
          ...note,
          expectedRevision: 1,
          config: { ...config, content },
        }),
      ),
    );
    expect(edits.filter((edit) => edit.status === "fulfilled")).toHaveLength(1);
    expect(edits.find((edit) => edit.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    await expect(
      patchBlock(owner, target, { ...note, id: chart.id, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      patchBlock(owner, target, { ...remove, id: note.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      viewer.dashboard.getDashboardBlocks({ ...target, kinds: [] }),
    ).resolves.toEqual([]);
    await expect(
      viewer.dashboard.getDashboardBlocks({ ...target, kinds: ["multiQuery"] }),
    ).resolves.toEqual([saved]);
    const [editedNote] = await viewer.dashboard.getDashboardBlocks({
      ...target,
      kinds: ["markdown"],
    });
    expect(editedNote).toMatchObject({ id: note.id, revision: 2 });
    await patchBlock(owner, target, remove);
    await expect(viewer.dashboard.getDashboardBlocks(target)).resolves.toEqual([
      editedNote,
    ]);
  });

  it("preserves unknown block configurations and precision across patches, classic edits and same-project clones", async () => {
    const owner = caller(projectId);
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Future formats",
      description: "",
    });
    const target = { projectId, dashboardId };
    const legacy = {
      id: randomUUID(),
      kind: "markdown" as const,
      config,
      revision: 1,
      beforePlacementId: null,
    };
    const futureNote = {
      ...legacy,
      id: randomUUID(),
      revision: 7,
      config: { ...config, version: 2, sections: ["future"] },
    };
    const futureChart = {
      ...futureNote,
      id: randomUUID(),
      kind: "multiQuery" as const,
      config: { ...multiQueryConfig, version: 2, formula: "a * b" },
    };
    const malformed = {
      ...futureNote,
      id: randomUUID(),
      config: { ...config, version: null },
    };
    const opaque = {
      ...futureNote,
      id: randomUUID(),
      kind: "future",
      futureField: "keep",
    };
    await prisma.dashboard.update({
      where: { id: dashboardId, projectId },
      data: {
        definition: {
          version: "1",
          widgets: [],
          blocks: [legacy, futureNote, futureChart, malformed, opaque],
          extension: { mode: "future" },
        },
      },
    });
    // This JSON number cannot make a lossless round trip through a JavaScript Number.
    await prisma.$executeRaw`
      UPDATE dashboards SET definition = jsonb_set(definition, '{blocks,2,config,precision}', '9007199254740993.125000'::jsonb)
      WHERE id = ${dashboardId} AND project_id = ${projectId}
    `;
    const storedEntries = (id: string) => prisma.$queryRaw<
      { id: string; data: Uint8Array; revision: number }[]
    >`
      SELECT entry->>'id' AS id, jsonb_send(entry - 'revision') AS data, (entry->>'revision')::int AS revision
      FROM dashboards CROSS JOIN LATERAL jsonb_array_elements(definition->'blocks') entry
      WHERE dashboards.id = ${id} AND project_id = ${projectId} AND entry->>'id' <> ${legacy.id}
      ORDER BY entry->>'id'
    `;
    const before = await storedEntries(dashboardId);
    await expect(owner.dashboard.getDashboardBlocks(target)).resolves.toEqual([
      { ...legacy, config: { ...config, version: 1 } },
    ]);
    for (const block of [futureNote, futureChart, malformed]) {
      const identity = { id: block.id, expectedRevision: 7 };
      const contents =
        block.kind === "markdown"
          ? { kind: "markdown" as const, config }
          : { kind: "multiQuery" as const, config: multiQueryConfig };
      await expect(
        patchBlock(owner, target, { ...identity, op: "upsert", ...contents }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        patchBlock(owner, target, { ...identity, op: "remove" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await expect(
      patchBlock(owner, target, {
        id: opaque.id,
        expectedRevision: 7,
        op: "remove",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await patchBlock(owner, target, {
      ...legacy,
      op: "upsert",
      expectedRevision: 1,
    });
    await patchBlock(owner, target, {
      id: legacy.id,
      op: "remove",
      expectedRevision: 2,
    });
    await owner.dashboard.updateDashboardDefinition({
      ...target,
      definition: { widgets: [] },
    });
    const clone = await caller(projectId, "ADMIN", {
      email: "reader@example.com",
      optedIn: false,
    }).dashboard.cloneDashboard(target);
    await expect(storedEntries(dashboardId)).resolves.toEqual(before);
    await expect(storedEntries(clone.id)).resolves.toEqual(
      before.map((row) => ({
        ...row,
        revision: row.id === opaque.id ? row.revision : 1,
      })),
    );
    const document = await prisma.dashboard.findUniqueOrThrow({
      where: { id: clone.id, projectId },
      select: { definition: true },
    });
    expect(document.definition).toMatchObject({
      extension: { mode: "future" },
    });
    await expect(owner.dashboard.getDashboardBlocks(target)).resolves.toEqual(
      [],
    );
  });

  it("reads the classic projection of future dashboard documents and refuses edits to their unknown format", async () => {
    const owner = caller(projectId);
    const { id: dashboardId } = await owner.dashboard.createDashboard({
      projectId,
      name: "Future document",
      description: "",
    });
    const target = { projectId, dashboardId };
    const future = {
      version: "2",
      widgets: [],
      blocks: [],
      future: { layout: "tree" },
    };
    await prisma.dashboard.update({
      where: { id: dashboardId, projectId },
      data: { definition: future },
    });
    await expect(owner.dashboard.getDashboard(target)).resolves.toMatchObject({
      definition: { widgets: [] },
    });
    await expect(owner.dashboard.getDashboardBlocks(target)).resolves.toEqual(
      [],
    );
    await expect(
      patchBlock(owner, target, {
        op: "upsert",
        id: randomUUID(),
        kind: "markdown",
        config,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.dashboard.updateDashboardDefinition({
        ...target,
        definition: { widgets: [] },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const clone = await owner.dashboard.cloneDashboard(target);
    for (const id of [dashboardId, clone.id]) {
      await expect(
        prisma.dashboard.findUniqueOrThrow({
          where: { id, projectId },
          select: { definition: true },
        }),
      ).resolves.toEqual({ definition: future });
    }
  });
});
