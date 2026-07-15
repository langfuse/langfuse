import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableDashboardWidgetResponse,
  PatchUnstableDashboardWidgetResponse,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  DeleteDashboardPlacementResponse,
  DeleteUnstableDashboardResponse,
  GetUnstableDashboardsResponse,
  PatchDashboardPlacementResponse,
  PostDashboardPlacementResponse,
  PostUnstableDashboardResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import { UnstablePublicApiErrorResponse } from "@/src/features/public-api/types/unstable-public-evals-contract";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { nanoid } from "nanoid";

const widget = {
  name: "API widget",
  description: "Created via unstable API",
  view: "observations" as const,
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "NUMBER" as const,
};

describe("unstable dashboard API", () => {
  it("manages dashboards, widgets, and placements without leaving broken references", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );
    const dashboardFilters = [
      {
        column: "environment",
        type: "string" as const,
        operator: "=" as const,
        value: "production",
      },
    ];
    const createdDashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      {
        name: "API dashboard",
        description: "Created via unstable API",
        filters: dashboardFilters,
      },
      auth,
    );
    expect(createdDashboard.body.filters).toEqual(dashboardFilters);

    await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/placements`,
      {
        type: "widget",
        id: "placement-1",
        widgetId: createdWidget.body.id,
        x: 0,
        y: 0,
        width: 4,
        height: 3,
      },
      auth,
    );

    const blockedDelete = await makeAPICall(
      "DELETE",
      `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
      undefined,
      auth,
    );
    expect(blockedDelete.status).toBe(409);
    expect(UnstablePublicApiErrorResponse.parse(blockedDelete.body).code).toBe(
      "conflict",
    );

    const moved = await makeZodVerifiedAPICall(
      PatchDashboardPlacementResponse,
      "PATCH",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/placements/placement-1`,
      { x: 4 },
      auth,
    );
    // Partial move: omitted fields keep their current values.
    expect(moved.body).toMatchObject({
      id: "placement-1",
      x: 4,
      y: 0,
      width: 4,
      height: 3,
    });

    await makeZodVerifiedAPICall(
      DeleteDashboardPlacementResponse,
      "DELETE",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/placements/placement-1`,
      undefined,
      auth,
    );
    await makeZodVerifiedAPICall(
      DeleteUnstableDashboardWidgetResponse,
      "DELETE",
      `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
      undefined,
      auth,
    );
    await makeZodVerifiedAPICall(
      DeleteUnstableDashboardResponse,
      "DELETE",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}`,
      undefined,
      auth,
    );
  });

  it("paginates project dashboards with correct totals and excludes Langfuse-managed dashboards", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const first = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Dashboard A", description: "" },
      auth,
    );
    const second = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Dashboard B", description: "" },
      auth,
    );
    // Langfuse-managed dashboards (projectId null) sort first by updatedAt
    // and must be neither returned nor counted by the public API.
    const langfuseManaged = await prisma.dashboard.create({
      data: {
        id: `langfuse-managed-${nanoid()}`,
        projectId: null,
        name: "Langfuse managed",
        description: "",
        definition: { widgets: [] },
      },
    });
    try {
      const page1 = await makeZodVerifiedAPICall(
        GetUnstableDashboardsResponse,
        "GET",
        "/api/public/unstable/dashboards?page=1&limit=1",
        undefined,
        auth,
      );
      expect(page1.body.data).toHaveLength(1);
      expect([first.body.id, second.body.id]).toContain(page1.body.data[0].id);
      expect(page1.body.meta).toMatchObject({
        page: 1,
        limit: 1,
        totalItems: 2,
        totalPages: 2,
      });
    } finally {
      await prisma.dashboard.delete({ where: { id: langfuseManaged.id } });
    }
  });

  it("rejects creating a dashboard whose definition references a missing widget", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboards",
      {
        name: "Broken dashboard",
        description: "",
        definition: {
          widgets: [
            {
              type: "widget",
              id: "placement-1",
              widgetId: "does-not-exist",
              x: 0,
              y: 0,
              width: 4,
              height: 3,
            },
          ],
        },
      },
      auth,
    );
    expect(response.status).toBe(404);
  });

  it("allows placing Langfuse-managed widgets on a project dashboard", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const langfuseWidget = await prisma.dashboardWidget.create({
      data: {
        id: `langfuse-widget-${nanoid()}`,
        projectId: null,
        name: "Langfuse managed widget",
        description: "",
        view: "OBSERVATIONS",
        dimensions: [],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        minVersion: 2,
      },
    });
    try {
      const dashboard = await makeZodVerifiedAPICall(
        PostUnstableDashboardResponse,
        "POST",
        "/api/public/unstable/dashboards",
        { name: "Dashboard with managed widget", description: "" },
        auth,
      );
      const placed = await makeZodVerifiedAPICall(
        PostDashboardPlacementResponse,
        "POST",
        `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
        { type: "widget", widgetId: langfuseWidget.id },
        auth,
      );
      expect(placed.body).toMatchObject({
        type: "widget",
        widgetId: langfuseWidget.id,
      });
    } finally {
      await prisma.dashboardWidget.delete({
        where: { id: langfuseWidget.id },
      });
    }
  });

  it("validates preset placements against the preset registry", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const dashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Preset dashboard", description: "" },
      auth,
    );

    const unknownPreset = await makeAPICall(
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      { type: "preset", presetId: "does-not-exist" },
      auth,
    );
    expect(unknownPreset.status).toBe(404);

    const placed = await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      { type: "preset", presetId: "home-score-analytics" },
      auth,
    );
    expect(placed.body).toMatchObject({
      type: "preset",
      presetId: "home-score-analytics",
    });
  });

  it("appends placements with server defaults when id and position are omitted", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );
    const dashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Auto-append dashboard", description: "" },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      {
        type: "widget",
        id: "placement-1",
        widgetId: createdWidget.body.id,
        x: 0,
        y: 0,
        width: 4,
        height: 3,
      },
      auth,
    );

    const appended = await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      { type: "widget", widgetId: createdWidget.body.id },
      auth,
    );
    // Appended below the existing 3-row tile with the UI's 6x6 default size.
    expect(appended.body).toMatchObject({
      type: "widget",
      id: expect.any(String),
      widgetId: createdWidget.body.id,
      x: 0,
      y: 3,
      width: 6,
      height: 6,
    });
  });

  it("rejects duplicate placement ids with a conflict", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );
    const dashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Duplicate placement dashboard", description: "" },
      auth,
    );
    const placement = {
      type: "widget",
      id: "placement-1",
      widgetId: createdWidget.body.id,
    };
    await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      placement,
      auth,
    );
    const duplicate = await makeAPICall(
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      placement,
      auth,
    );
    expect(duplicate.status).toBe(409);
    expect(UnstablePublicApiErrorResponse.parse(duplicate.body).code).toBe(
      "conflict",
    );
  });

  it("does not expose dashboards across projects", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const { auth: otherAuth } = await createOrgProjectAndApiKey();
    const dashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Private dashboard", description: "" },
      auth,
    );
    const crossProjectRead = await makeAPICall(
      "GET",
      `/api/public/unstable/dashboards/${dashboard.body.id}`,
      undefined,
      otherAuth,
    );
    expect(crossProjectRead.status).toBe(404);
  });

  it("derives chartConfig on chartType changes and rejects contradictions", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );

    const contradiction = await makeAPICall(
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
      { chartType: "PIE", chartConfig: { type: "NUMBER" } },
      auth,
    );
    expect(contradiction.status).toBe(400);

    // A bare chartType change resets the chartConfig to the new type.
    const changed = await makeZodVerifiedAPICall(
      PatchUnstableDashboardWidgetResponse,
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
      { chartType: "PIE" },
      auth,
    );
    expect(changed.body.chartType).toBe("PIE");
    expect(changed.body.chartConfig).toEqual({ type: "PIE" });
  });
});
