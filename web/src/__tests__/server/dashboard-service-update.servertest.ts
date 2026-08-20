import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";

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
