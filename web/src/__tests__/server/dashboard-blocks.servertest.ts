import { randomUUID } from "node:crypto";
import {
  HOME_DASHBOARD_PRESET_IDS,
  type dashboardBlockPatchSchema,
} from "@langfuse/shared";
import { buildHomeWidgetRecipe } from "@/src/features/dashboard-blocks/homeWidgetRecipes";
import type { z } from "zod";
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

  it("stores rich content on reusable widgets and replaces a Home placement atomically", async () => {
    const author = caller(projectId);
    const reader = caller(projectId, "VIEWER", { optedIn: false });
    const placement = {
      type: "preset" as const,
      id: "model-costs",
      presetId: "home-model-costs",
      x: 6,
      y: 3,
      x_size: 6,
      y_size: 4,
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Replace card",
        description: "",
        definition: { widgets: [placement] },
      },
    });
    const definition = {
      kind: "multiQuery" as const,
      config: multiQueryConfig,
    };
    const input = {
      projectId,
      dashboardId: dashboard.id,
      replacePlacementId: placement.id,
      definition,
    };
    await expect(
      caller(projectId, "ADMIN", {
        optedIn: false,
      }).dashboardWidgets.saveDefinition(input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(otherProjectId).dashboardWidgets.saveDefinition({
        ...input,
        projectId: otherProjectId,
      }),
    ).rejects.toThrow();
    const { widget, placementId } =
      await author.dashboardWidgets.saveDefinition(input);
    expect(widget.definition).toEqual(definition);
    const saved = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboard.id },
    });
    expect(saved.definition).toEqual({
      widgets: [
        {
          id: placement.id,
          type: "widget",
          widgetId: widget.id,
          x: 6,
          y: 3,
          x_size: 6,
          y_size: 4,
        },
      ],
    });
    expect(placementId).toBe(placement.id);
    const second = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Shared chart",
        description: "",
        definition: saved.definition!,
      },
    });
    const changed = {
      ...definition,
      config: { ...multiQueryConfig, title: "Shared title" },
    };
    await author.dashboardWidgets.saveDefinition({
      projectId,
      widgetId: widget.id,
      expectedRevision: 1,
      definition: changed,
    });
    await expect(
      reader.dashboardWidgets.get({ projectId, widgetId: widget.id }),
    ).resolves.toMatchObject({ definition: changed, revision: 2 });
    for (const dashboardId of [dashboard.id, second.id]) {
      const data = await reader.dashboard.getDashboard({
        projectId,
        dashboardId,
      });
      expect(data?.definition.widgets[0]).toMatchObject({
        widgetId: widget.id,
      });
    }
    await expect(
      author.dashboardWidgets.saveDefinition({
        projectId,
        widgetId: widget.id,
        expectedRevision: 1,
        definition,
      }),
    ).rejects.toThrow();
    await expect(
      author.dashboardWidgets.update({
        projectId,
        widgetId: widget.id,
        name: "Old writer",
        description: "",
        view: "observations",
        metrics: [{ measure: "count", agg: "count" }],
        dimensions: [],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
      }),
    ).rejects.toThrow("versioned definition");
    const count = await prisma.dashboardWidget.count({ where: { projectId } });
    await expect(author.dashboardWidgets.saveDefinition(input)).rejects.toThrow(
      "already been replaced",
    );
    expect(await prisma.dashboardWidget.count({ where: { projectId } })).toBe(
      count,
    );

    const classic = await author.dashboardWidgets.create({
      projectId,
      name: "Classic",
      description: "",
      view: "observations",
      dimensions: [],
      filters: [],
      metrics: [{ measure: "count", agg: "count" }],
      chartType: "NUMBER",
      chartConfig: { type: "NUMBER" },
    });
    const upgraded = await author.dashboardWidgets.saveDefinition({
      projectId,
      widgetId: classic.widget.id,
      expectedRevision: 0,
      definition,
    });
    expect(upgraded.widget.id).toBe(classic.widget.id);
    expect(upgraded.widget.revision).toBe(1);
  });

  it("saves every Home template on both read paths without losing its query definition", async () => {
    const author = caller(projectId);
    const reader = caller(projectId, "VIEWER", { optedIn: false });
    const failures: string[] = [];
    for (const version of ["v1", "v2"] as const) {
      for (const preset of HOME_DASHBOARD_PRESET_IDS) {
        try {
          const recipe = buildHomeWidgetRecipe(preset, {
            version,
            models: ["alpha", "beta"],
            scores: [
              { name: "Quality", source: "EVAL", dataType: "NUMERIC" },
              { name: "Quality", source: "API", dataType: "BOOLEAN" },
              {
                name: "Outcome",
                source: "ANNOTATION",
                dataType: "CATEGORICAL",
              },
            ],
          });
          if ("reason" in recipe) throw new Error(recipe.reason);
          const definition = {
            kind: "multiQuery" as const,
            config: recipe.config,
          };
          const { widget } = await author.dashboardWidgets.saveDefinition({
            projectId,
            definition,
          });
          const stored = await reader.dashboardWidgets.get({
            projectId,
            widgetId: widget.id,
          });
          expect(stored?.revision).toBe(1);
          expect(stored?.definition).toEqual(
            JSON.parse(JSON.stringify(definition)),
          );
        } catch (error) {
          failures.push(
            `${version} ${preset}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("preserves opaque JSON precision while saving and materializing widget placements", async () => {
    const author = caller(projectId);
    const sourceId = randomUUID();
    const siblingId = randomUUID();
    const opaqueId = randomUUID();
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Forward-compatible widget storage",
        description: "",
        definition: {
          version: "1",
          widgets: [],
          extension: { mode: "future" },
          blocks: [
            ...[sourceId, siblingId].map((id) => ({
              id,
              kind: "markdown",
              config: { version: 1, ...config },
              revision: 1,
              beforePlacementId: null,
            })),
            {
              id: opaqueId,
              kind: "future",
              config: { version: 9 },
              revision: 1,
            },
          ],
        },
      },
    });
    const target = { projectId, dashboardId: dashboard.id };
    await prisma.$executeRaw`
      UPDATE dashboards SET definition = jsonb_set(
        jsonb_set(definition, '{extension,precision}', '9007199254740993.125000'::jsonb),
        '{blocks,2,config,precision}', '9007199254740993.125000'::jsonb
      ) WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    const untouched = () => prisma.$queryRaw<
      {
        extension: Uint8Array;
        inline: Uint8Array | null;
      }[]
    >`
      SELECT jsonb_send(definition->'extension') AS extension,
        (SELECT jsonb_send(entry) FROM jsonb_array_elements(definition->'blocks') AS entry
          WHERE entry->>'id' = ${opaqueId}) AS inline
      FROM dashboards WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    const before = await untouched();
    const definition = {
      kind: "markdown" as const,
      config: { version: 1 as const, ...config },
    };
    await author.dashboardWidgets.saveDefinition({ ...target, definition });
    expect(await untouched()).toEqual(before);
    await author.dashboardWidgets.saveDefinition({
      ...target,
      definition,
      sourceBlockId: sourceId,
      expectedRevision: 1,
    });
    expect(await untouched()).toEqual(before);
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).rejects.toThrow("cannot migrate");
    expect(await untouched()).toEqual(before);
    // Remove the unsupported fixture so the supported sibling can be materialized.
    await prisma.$executeRaw`
      UPDATE dashboards SET definition = jsonb_set(definition, '{blocks}', (
        SELECT jsonb_agg(entry ORDER BY ord)
        FROM jsonb_array_elements(definition->'blocks') WITH ORDINALITY AS stored(entry, ord)
        WHERE entry->>'id' <> ${opaqueId}
      )) WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).resolves.toEqual({ migrated: 1 });
    expect((await untouched())[0]?.extension).toEqual(before[0]?.extension);
    const persisted = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboard.id, projectId },
    });
    expect(persisted.definition).not.toHaveProperty("blocks");
    expect(persisted.definition).not.toHaveProperty("version");
  });

  it("consumes a bound converted Home overlay when replacing its placement directly", async () => {
    const author = caller(projectId);
    const preset = {
      type: "preset" as const,
      id: "cost",
      presetId: "home-model-costs",
      x: 6,
      y: 3,
      x_size: 6,
      y_size: 4,
    };
    const overlay = {
      id: randomUUID(),
      kind: "convertedPreset",
      revision: 2,
      sourcePreset: { placementId: preset.id, presetId: preset.presetId },
      beforePlacementId: null,
      config: {
        version: 2,
        title: "Converted",
        description: "",
        tabs: [
          {
            id: "main",
            label: "Main",
            queries: multiQueryConfig.queries,
            display: multiQueryConfig.display,
          },
        ],
      },
    };
    const note = {
      id: randomUUID(),
      kind: "markdown",
      revision: 1,
      beforePlacementId: null,
      config: { version: 1, ...config },
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Replace converted placement",
        description: "",
        definition: {
          version: "1",
          widgets: [preset],
          blocks: [preset, overlay, note],
          extension: { preserved: true },
        },
      },
    });
    const target = { projectId, dashboardId: dashboard.id };
    const input = {
      ...target,
      replacePlacementId: preset.id,
      replacePresetId: preset.presetId,
      definition: { kind: "multiQuery" as const, config: multiQueryConfig },
    };
    await prisma.$executeRaw`
      UPDATE dashboards SET definition = jsonb_set(definition, '{blocks,1,config,version}', '3'::jsonb)
      WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    const storedBytes = () => prisma.$queryRaw<{ definition: Uint8Array }[]>`
      SELECT jsonb_send(definition) AS definition FROM dashboards
      WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    const future = await storedBytes();
    const widgetCount = await prisma.dashboardWidget.count({
      where: { projectId },
    });
    await expect(
      author.dashboardWidgets.saveDefinition(input),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await storedBytes()).toEqual(future);
    expect(await prisma.dashboardWidget.count({ where: { projectId } })).toBe(
      widgetCount,
    );
    await prisma.$executeRaw`
      UPDATE dashboards SET definition = jsonb_set(definition, '{blocks,1,config,version}', '2'::jsonb)
      WHERE id = ${dashboard.id} AND project_id = ${projectId}
    `;
    const { widget } = await author.dashboardWidgets.saveDefinition(input);
    const saved = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboard.id, projectId },
    });
    expect(saved.definition).toEqual({
      version: "1",
      extension: { preserved: true },
      widgets: [
        { ...preset, type: "widget", widgetId: widget.id, presetId: undefined },
      ],
      blocks: [
        { ...preset, type: "widget", widgetId: widget.id, presetId: undefined },
        note,
      ],
    });
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).resolves.toEqual({ migrated: 1 });
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).resolves.toEqual({ migrated: 0 });
  });

  it("migrates inline charts and Markdown transactionally and only once", async () => {
    const author = caller(projectId);
    const preset = {
      type: "preset" as const,
      id: "cost",
      presetId: "home-model-costs",
      x: 0,
      y: 0,
      x_size: 6,
      y_size: 4,
    };
    const note = {
      id: randomUUID(),
      kind: "markdown",
      config: { version: 1, title: "Note", content: "**Keep this**" },
      revision: 1,
      beforePlacementId: preset.id,
    };
    const chart = {
      id: randomUUID(),
      kind: "multiQuery",
      config: multiQueryConfig,
      revision: 1,
      beforePlacementId: null,
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Inline migration",
        description: "",
        definition: {
          version: "1",
          widgets: [preset],
          blocks: [preset, note, chart],
        },
      },
    });
    const target = { projectId, dashboardId: dashboard.id };
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).resolves.toEqual({ migrated: 2 });
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).resolves.toEqual({ migrated: 0 });
    const stored = await prisma.dashboard.findUniqueOrThrow({
      where: { id: dashboard.id },
    });
    expect(Object.keys(stored.definition!)).toEqual(["widgets"]);
    const placements = (
      stored.definition as {
        widgets: { type: string; widgetId?: string; y: number }[];
      }
    ).widgets;
    const definitions = await prisma.dashboardWidget.findMany({
      where: {
        projectId,
        id: {
          in: placements.flatMap((item) =>
            item.widgetId ? [item.widgetId] : [],
          ),
        },
      },
      select: { definition: true },
    });
    expect(definitions.map((item) => item.definition)).toEqual(
      expect.arrayContaining([
        { kind: "markdown", config: note.config },
        { kind: "multiQuery", config: multiQueryConfig },
      ]),
    );
    expect(placements.find((item) => item.type === "preset")?.y).toBe(2);

    const future = {
      version: "1",
      widgets: [],
      blocks: [note, { kind: "future", id: "unknown" }],
    };
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: { definition: future },
    });
    const before = await prisma.dashboardWidget.count({ where: { projectId } });
    await expect(
      author.dashboardWidgets.migrateInlineWidgets(target),
    ).rejects.toThrow("cannot migrate");
    expect(await prisma.dashboardWidget.count({ where: { projectId } })).toBe(
      before,
    );
    expect(
      (
        await prisma.dashboard.findUniqueOrThrow({
          where: { id: dashboard.id },
        })
      ).definition,
    ).toEqual(future);
  });

  it("reads a legacy layout without writing and keeps a classic edit as ordinary placements", async () => {
    const editor = caller(projectId, "ADMIN", { optedIn: false });
    const geometry = { x: 0, y: 0, x_size: 4, y_size: 3 };
    const widget = {
      ...geometry,
      id: "latency",
      type: "widget" as const,
      widgetId: "latency-chart",
    };
    const preset = {
      ...geometry,
      y: 3,
      id: "usage",
      type: "preset" as const,
      presetId: "home-model-usage",
    };
    const original = { widgets: [widget, preset] };
    const { id: dashboardId, updatedAt } = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Legacy layout",
        description: "",
        definition: original,
      },
      select: { id: true, updatedAt: true },
    });
    const target = { projectId, dashboardId };
    const stored = () =>
      prisma.dashboard.findUniqueOrThrow({
        where: { id: dashboardId, projectId },
        select: { definition: true, updatedAt: true },
      });
    const [dashboard, blocks] = await Promise.all([
      editor.dashboard.getDashboard(target),
      editor.dashboard.getDashboardBlocks(target),
    ]);
    expect(dashboard).toMatchObject({
      definition: original,
      hasDashboardBlocks: false,
    });
    expect(blocks).toEqual([]);
    await expect(stored()).resolves.toEqual({
      definition: original,
      updatedAt,
    });

    const widgets = [
      { ...preset, y: 0 },
      { ...widget, y: 3 },
    ];
    await editor.dashboard.updateDashboardDefinition({
      ...target,
      definition: { widgets },
    });
    expect((await stored()).definition).toEqual({ widgets });
    await expect(editor.dashboard.getDashboard(target)).resolves.toMatchObject({
      hasDashboardBlocks: false,
    });
  });

  it("converts one preset in its existing grid slot and restores it after revision-checked edits", async () => {
    const preset = {
      id: "left",
      type: "preset" as const,
      presetId: "home-traces" as const,
      x: 6,
      y: 2,
      x_size: 5,
      y_size: 4,
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Converted preset",
        description: "",
        definition: { widgets: [preset] },
      },
    });
    const target = { projectId, dashboardId: dashboard.id };
    const owner = caller(projectId);
    const reader = caller(projectId, "VIEWER", { optedIn: false });
    const patch = {
      op: "convertPreset" as const,
      id: randomUUID(),
      expectedRevision: 0 as const,
      sourcePreset: {
        placementId: preset.id,
        presetId: preset.presetId,
      },
      config: {
        version: 2 as const,
        title: "Traces",
        description: "",
        tabs: [
          {
            id: "trace",
            label: "Traces",
            queries: multiQueryConfig.queries,
            display: multiQueryConfig.display,
          },
        ],
      },
    };
    await expect(patchBlock(reader, target, patch)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      patchBlock(caller(projectId, "ADMIN", { optedIn: false }), target, patch),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      patchBlock(owner, target, {
        ...patch,
        sourcePreset: { ...patch.sourcePreset, presetId: "home-model-costs" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await patchBlock(owner, target, patch);
    const editable = { ...target, includeConvertedPresets: true };
    const [chart] = await reader.dashboard.getDashboardBlocks(editable);
    expect(chart).toMatchObject({
      kind: "multiQuery",
      revision: 1,
      id: patch.id,
      sourcePreset: patch.sourcePreset,
    });
    expect(await reader.dashboard.getDashboardBlocks(target)).toEqual([]);
    await expect(
      patchBlock(owner, target, { ...patch, id: randomUUID() }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.dashboard.updateDashboardDefinition({
        ...target,
        definition: { widgets: [] },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.dashboard.updateDashboardDefinition({
        ...target,
        definition: { widgets: [preset, { ...preset, x: 0 }] },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const moved = { ...preset, x: 0, y: 7, x_size: 7, y_size: 5 };
    await owner.dashboard.updateDashboardDefinition({
      ...target,
      definition: { widgets: [moved] },
    });
    await patchBlock(owner, target, {
      op: "upsert",
      id: patch.id,
      expectedRevision: 1,
      kind: "multiQuery",
      config: { ...patch.config, title: "Custom traces" },
    });
    const clone = await owner.dashboard.cloneDashboard(target);
    const cloneTarget = { ...editable, dashboardId: clone.id };
    expect(
      await reader.dashboard.getDashboardBlocks(cloneTarget),
    ).toMatchObject([
      {
        id: patch.id,
        revision: 1,
        sourcePreset: patch.sourcePreset,
        config: { title: "Custom traces" },
      },
    ]);
    await expect(
      patchBlock(owner, target, {
        op: "restorePreset",
        id: patch.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await patchBlock(owner, target, {
      op: "restorePreset",
      id: patch.id,
      expectedRevision: 2,
    });
    expect(await reader.dashboard.getDashboardBlocks(editable)).toEqual([]);
    expect(
      (await reader.dashboard.getDashboard(target)).definition.widgets,
    ).toEqual([moved]);
    await patchBlock(owner, target, patch);
    const removal = {
      op: "remove" as const,
      id: patch.id,
      expectedRevision: 1,
    };
    await expect(patchBlock(reader, target, removal)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const classicEditor = caller(projectId, "ADMIN", {
      email: "editor@example.com",
      optedIn: false,
    });
    await patchBlock(classicEditor, target, removal);
    expect(
      (await reader.dashboard.getDashboard(target)).definition.widgets,
    ).toEqual([]);
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
    const persistedClone = await prisma.dashboard.findUniqueOrThrow({
      where: { id: clone.id, projectId },
    });
    expect(clone.updatedAt).toEqual(persistedClone.updatedAt);
    expect(clone.updatedBy).toBe(persistedClone.updatedBy);
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
