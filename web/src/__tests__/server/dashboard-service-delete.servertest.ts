import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";

describe("DashboardService.deleteDashboard", () => {
  it("deletes an existing dashboard and throws LangfuseNotFoundError on repeat delete", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "delete-me",
      "",
    );

    await DashboardService.deleteDashboard(dashboard.id, projectId);

    await expect(
      DashboardService.deleteDashboard(dashboard.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError for an unknown dashboard id", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await expect(
      DashboardService.deleteDashboard(uuidv4(), projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError when the dashboard belongs to another project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
    const dashboard = await DashboardService.createDashboard(
      otherProjectId,
      "other-project",
      "",
    );

    await expect(
      DashboardService.deleteDashboard(dashboard.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });
});
