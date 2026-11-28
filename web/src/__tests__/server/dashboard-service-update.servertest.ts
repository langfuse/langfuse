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

  it("rejects old-client edits to a versioned widget while permitting ordinary classic edits", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const widget = await prisma.dashboardWidget.create({
      data: {
        projectId,
        name: "Classic",
        description: "",
        view: "OBSERVATIONS",
        dimensions: [],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
      },
    });
    const legacyRename = (name: string) => prisma.$executeRaw`
      UPDATE dashboard_widgets SET name = ${name}, updated_at = now()
      WHERE id = ${widget.id} AND project_id = ${projectId}
    `;
    await expect(legacyRename("Classic edit")).resolves.toBe(1);
    const definition = {
      version: 1,
      kind: "markdown",
      config: { title: "Note", content: "First draft" },
    };
    await prisma.dashboardWidget.update({
      where: { id: widget.id, projectId },
      data: { name: "Note", definition, revision: 1 },
    });
    const constraintViolation = { meta: { code: "23514" } };
    await expect(legacyRename("Stale edit")).rejects.toMatchObject(
      constraintViolation,
    );
    await expect(prisma.$executeRaw`
      UPDATE dashboard_widgets SET definition = NULL
      WHERE id = ${widget.id} AND project_id = ${projectId}
    `).rejects.toMatchObject(constraintViolation);
    await expect(legacyRename("Note")).resolves.toBe(1);
    const updated = {
      ...definition,
      config: { title: "Revised", content: "Second draft" },
    };
    await expect(
      prisma.dashboardWidget.update({
        where: { id: widget.id, projectId, revision: 1 },
        data: {
          name: "Revised",
          definition: updated,
          revision: { increment: 1 },
        },
      }),
    ).resolves.toMatchObject({
      name: "Revised",
      definition: updated,
      revision: 2,
    });
  });
});
