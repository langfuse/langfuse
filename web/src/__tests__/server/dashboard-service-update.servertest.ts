import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError } from "@langfuse/shared";

describe("DashboardService update methods", () => {
  it("preserves placements an older editor cannot write and permits an informed editor to delete them", async () => {
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
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "Compatibility",
      "",
      undefined,
      { widgets: [text] },
    );
    const oldSave = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
    );
    expect(oldSave.definition.widgets).toEqual([text]);
    const informedSave = await DashboardService.updateDashboardDefinition(
      dashboard.id,
      projectId,
      { widgets: [] },
      undefined,
      ["widget", "preset", "query", "text"],
    );
    expect(informedSave.definition.widgets).toEqual([]);
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
