import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

describe("DashboardService update methods", () => {
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

describe("DashboardService listDashboards", () => {
  it("returns the creator name, and Langfuse for curated templates", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `dashboard-list-${uuidv4().substring(0, 8)}@test.com`,
        name: "Ada Lovelace",
      },
    });

    const projectDashboard = await DashboardService.createDashboard(
      projectId,
      "Project board",
      "",
      user.id,
    );
    const langfuseDashboard = await prisma.dashboard.create({
      data: {
        name: "Curated template",
        description: "",
        projectId: null,
        definition: { widgets: [] },
      },
    });

    const { dashboards } = await DashboardService.listDashboards({
      projectId,
    });
    const byId = Object.fromEntries(
      dashboards.map((dashboard) => [dashboard.id, dashboard]),
    );

    expect(byId[projectDashboard.id]?.createdByName).toBe("Ada Lovelace");
    expect(byId[langfuseDashboard.id]?.createdByName).toBe("Langfuse");
  });

  it("lists project dashboards first, then templates by updatedAt", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    const olderProject = await DashboardService.createDashboard(
      projectId,
      "Older project board",
      "",
    );
    const newerProject = await DashboardService.createDashboard(
      projectId,
      "Newer project board",
      "",
    );
    const olderTemplate = await prisma.dashboard.create({
      data: {
        name: "Older template",
        description: "",
        projectId: null,
        definition: { widgets: [] },
      },
    });
    const newerTemplate = await prisma.dashboard.create({
      data: {
        name: "Newer template",
        description: "",
        projectId: null,
        definition: { widgets: [] },
      },
    });

    await prisma.dashboard.update({
      where: { id: olderProject.id },
      data: { updatedAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    await prisma.dashboard.update({
      where: { id: newerProject.id },
      data: { updatedAt: new Date("2021-01-01T00:00:00.000Z") },
    });
    await prisma.dashboard.update({
      where: { id: olderTemplate.id },
      data: { updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    });
    await prisma.dashboard.update({
      where: { id: newerTemplate.id },
      data: { updatedAt: new Date("2026-09-02T00:00:00.000Z") },
    });

    const { dashboards } = await DashboardService.listDashboards({
      projectId,
      orderBy: { column: "updatedAt", order: "DESC" },
    });
    const listedIds = dashboards.map((dashboard) => dashboard.id);
    const projectIds = new Set([olderProject.id, newerProject.id]);
    const lastProjectIndex = listedIds.findLastIndex((id) =>
      projectIds.has(id),
    );
    const firstTemplateIndex = listedIds.findIndex(
      (id) => id === olderTemplate.id || id === newerTemplate.id,
    );

    expect(listedIds.indexOf(newerProject.id)).toBeLessThan(
      listedIds.indexOf(olderProject.id),
    );
    expect(lastProjectIndex).toBeLessThan(firstTemplateIndex);
    expect(listedIds.indexOf(newerTemplate.id)).toBeLessThan(
      listedIds.indexOf(olderTemplate.id),
    );
  });
});
