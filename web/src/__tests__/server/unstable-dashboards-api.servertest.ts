import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableDashboardWidgetResponse,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  DashboardPlacementResponse,
  DeleteDashboardPlacementResponse,
  DeleteUnstableDashboardResponse,
  PostUnstableDashboardResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import { UnstablePublicApiErrorResponse } from "@/src/features/public-api/types/unstable-public-evals-contract";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const widget = {
  name: "API widget",
  description: "Created via unstable API",
  view: "observations" as const,
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "NUMBER" as const,
  chartConfig: { type: "NUMBER" as const },
  minVersion: 2,
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
    const createdDashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "API dashboard", description: "Created via unstable API" },
      auth,
    );

    await makeZodVerifiedAPICall(
      DashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/widgets`,
      {
        type: "widget",
        id: "placement-1",
        widgetId: createdWidget.body.id,
        x: 0,
        y: 0,
        x_size: 4,
        y_size: 3,
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
      DashboardPlacementResponse,
      "PATCH",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/widgets/placement-1`,
      {
        type: "widget",
        id: "placement-1",
        widgetId: createdWidget.body.id,
        x: 4,
        y: 0,
        x_size: 4,
        y_size: 3,
      },
      auth,
    );
    expect(moved.body.definition.widgets[0]).toMatchObject({ x: 4 });

    await makeZodVerifiedAPICall(
      DeleteDashboardPlacementResponse,
      "DELETE",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/widgets/placement-1`,
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
});
