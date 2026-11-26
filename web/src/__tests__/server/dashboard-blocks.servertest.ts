import { randomUUID } from "node:crypto";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { buildHomeWidgetRecipe } from "@/src/features/dashboard-blocks/homeWidgetRecipes";
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
  const multiQueryConfig = {
    title: "Records",
    description: "",
    tabs: [
      {
        id: "main",
        label: "Records",
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
      },
    ],
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
      version: 1 as const,
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
            version: 1 as const,
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

  it("keeps query errors readable while rejecting invalid edits", async () => {
    const author = caller(projectId);
    const definition = {
      version: 1 as const,
      kind: "multiQuery" as const,
      config: multiQueryConfig,
    };
    const { widget } = await author.dashboardWidgets.saveDefinition({
      projectId,
      definition,
    });
    const invalid = {
      ...definition,
      config: {
        ...multiQueryConfig,
        tabs: multiQueryConfig.tabs.map((tab) => ({
          ...tab,
          formulas: [
            {
              id: "broken",
              label: "Missing operand",
              expression: "missing.count",
              format: "number" as const,
            },
          ],
        })),
      },
    };
    await prisma.dashboardWidget.update({
      where: { id: widget.id, projectId },
      data: { definition: invalid, revision: { increment: 1 } },
    });
    const reader = caller(projectId, "VIEWER", { optedIn: false });
    await expect(
      reader.dashboardWidgets.get({ projectId, widgetId: widget.id }),
    ).resolves.toMatchObject({ definition: invalid });
    const list = await reader.dashboardWidgets.all({
      projectId,
      limit: 100,
      page: 1,
      orderBy: null,
    });
    expect(list.widgets).toContainEqual(
      expect.objectContaining({ id: widget.id, definition: invalid }),
    );
    await expect(
      author.dashboardWidgets.saveDefinition({
        projectId,
        widgetId: widget.id,
        expectedRevision: widget.revision! + 1,
        definition: invalid,
      }),
    ).rejects.toThrow();
  });

  it("keeps classic layout edits and clones as plain widget placements", async () => {
    const author = caller(projectId, "ADMIN", { optedIn: false });
    const placement = {
      id: "home-card",
      type: "preset" as const,
      presetId: "home-model-costs",
      x: 0,
      y: 0,
      x_size: 6,
      y_size: 5,
    };
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Classic",
        description: "",
        definition: { widgets: [placement] },
      },
    });
    const definition = { widgets: [{ ...placement, y: 4 }] };
    const clone = await author.dashboard.cloneDashboard({
      projectId,
      dashboardId: dashboard.id,
      definition,
    });
    const saved = await prisma.dashboard.findUniqueOrThrow({
      where: { id: clone.id, projectId },
    });
    expect(saved.definition).toEqual(definition);
    expect(clone.updatedAt).toEqual(saved.updatedAt);
    await expect(
      author.dashboard.updateDashboardDefinition({
        projectId,
        dashboardId: clone.id,
        definition: { widgets: [] },
      }),
    ).resolves.toMatchObject({ definition: { widgets: [] } });
  });
});
