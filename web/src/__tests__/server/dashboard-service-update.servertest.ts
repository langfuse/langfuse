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
});
