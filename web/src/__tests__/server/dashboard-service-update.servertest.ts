import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import {
  getStudioPresetReplacement,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@langfuse/shared/src/env";

describe("DashboardService update methods", () => {
  const originalStudioEnabled =
    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED;

  afterEach(() => {
    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = originalStudioEnabled;
  });

  it("accepts only one concurrent definition replacement from the same revision", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "Concurrent edits",
      "",
    );
    const revision = new Date("2026-01-01T00:00:00.000Z");
    await prisma.dashboard.update({
      where: { id: dashboard.id, projectId },
      data: { updatedAt: revision },
    });
    const definitions = ["First edit", "Second edit"].map((presetId) => ({
      widgets: [
        {
          id: uuidv4(),
          type: "preset" as const,
          presetId,
          x: 0,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
      ],
    }));
    const attempts = await Promise.allSettled(
      definitions.map((definition) =>
        DashboardService.updateDashboardDefinition(
          dashboard.id,
          projectId,
          definition,
          undefined,
          undefined,
          revision,
        ),
      ),
    );
    const saved = attempts.filter((attempt) => attempt.status === "fulfilled");
    const stale = attempts.filter((attempt) => attempt.status === "rejected");
    expect(saved).toHaveLength(1);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.reason).toBeInstanceOf(LangfuseConflictError);
    expect(
      (await DashboardService.getDashboard(dashboard.id, projectId))!
        .definition,
    ).toEqual(saved[0]!.value.definition);

    const unversioned = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
    );
    expect(unversioned.definition.widgets).toEqual([]);
  });

  it("gates prototype writes and preserves placements outside the writer's capabilities", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const text = {
      type: "text" as const,
      id: uuidv4(),
      title: "Reading guide",
      content: "Keep this note",
      x: 0,
      y: 0,
      x_size: 6,
      y_size: 2,
    };
    const query = {
      type: "query" as const,
      id: uuidv4(),
      config: getStudioPresetReplacement("home-traces")[0],
      x: 0,
      y: 2,
      x_size: 6,
      y_size: 6,
    };
    const widgets = [text, query];
    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = "false";
    for (const placement of widgets)
      await expect(
        DashboardService.createDashboard(
          projectId,
          "Disabled prototype",
          "",
          undefined,
          { widgets: [placement] },
        ),
      ).rejects.toThrow("Dashboard studio is not enabled");
    expect(await prisma.dashboard.count({ where: { projectId } })).toBe(0);

    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = "true";
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "Compatibility",
      "",
      undefined,
      { widgets },
    );
    await expect(
      DashboardService.updateDashboardDefinition(dashboard.id, projectId, {
        widgets,
      }),
    ).rejects.toThrow("supported placement types");

    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = "false";
    await expect(
      DashboardService.updateDashboardDefinition(
        dashboard.id,
        projectId,
        { widgets },
        undefined,
        ["widget", "preset", "query", "text"],
      ),
    ).rejects.toThrow("Dashboard studio is not enabled");
    const oldSave = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
    );
    expect(oldSave.definition.widgets).toEqual(widgets);
    const disabledSave = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
      undefined,
      ["widget", "preset", "query", "text"],
    );
    expect(disabledSave.definition.widgets).toEqual(widgets);

    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = "true";
    const informedSave = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
      undefined,
      ["widget", "preset", "query", "text"],
    );
    expect(informedSave.definition.widgets).toEqual([]);

    env.LANGFUSE_EXPERIMENTAL_DASHBOARD_STUDIO_ENABLED = "false";
    const legacy = await DashboardService.createDashboard(
      projectId,
      "Legacy dashboard",
      "",
    );
    expect(legacy.definition.widgets).toEqual([]);
  });

  it("throw LangfuseNotFoundError instead of P2025 for a missing dashboard", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const missingId = uuidv4();

    await expect(
      DashboardService.updateDashboardDefinition(missingId, projectId, {
        widgets: [],
      }),
    ).rejects.toThrow(LangfuseNotFoundError);

    await expect(
      DashboardService.updateDashboard(missingId, projectId, "name", ""),
    ).rejects.toThrow(LangfuseNotFoundError);

    await expect(
      DashboardService.updateDashboardFilters(missingId, projectId, []),
    ).rejects.toThrow(LangfuseNotFoundError);
  });
});
