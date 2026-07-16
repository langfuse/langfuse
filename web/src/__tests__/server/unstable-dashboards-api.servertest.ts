import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableDashboardWidgetResponse,
  GetUnstableDashboardWidgetResponse,
  GetUnstableDashboardWidgetsResponse,
  PatchUnstableDashboardWidgetResponse,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import {
  DeleteDashboardPlacementResponse,
  DeleteUnstableDashboardResponse,
  GetUnstableDashboardResponse,
  GetUnstableDashboardsResponse,
  PatchDashboardPlacementResponse,
  PatchUnstableDashboardResponse,
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
    const { auth, projectId, publicKey } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );
    const listedWidgets = await makeZodVerifiedAPICall(
      GetUnstableDashboardWidgetsResponse,
      "GET",
      "/api/public/unstable/dashboard-widgets?page=1&limit=50",
      undefined,
      auth,
    );
    expect(listedWidgets.body.data.map(({ id }) => id)).toContain(
      createdWidget.body.id,
    );
    await expect(
      makeZodVerifiedAPICall(
        GetUnstableDashboardWidgetResponse,
        "GET",
        `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
        undefined,
        auth,
      ),
    ).resolves.toMatchObject({ body: { id: createdWidget.body.id } });

    const updatedWidget = await makeZodVerifiedAPICall(
      PatchUnstableDashboardWidgetResponse,
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${createdWidget.body.id}`,
      { name: "Updated API widget" },
      auth,
    );
    expect(updatedWidget.body.name).toBe("Updated API widget");

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

    await expect(
      makeZodVerifiedAPICall(
        GetUnstableDashboardResponse,
        "GET",
        `/api/public/unstable/dashboards/${createdDashboard.body.id}`,
        undefined,
        auth,
      ),
    ).resolves.toMatchObject({ body: { id: createdDashboard.body.id } });

    const updatedFilters = [
      {
        column: "environment",
        type: "string" as const,
        operator: "=" as const,
        value: "staging",
      },
    ];
    const updatedDashboard = await makeZodVerifiedAPICall(
      PatchUnstableDashboardResponse,
      "PATCH",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}`,
      {
        name: "Updated API dashboard",
        description: "Updated via unstable API",
        filters: updatedFilters,
        definition: {
          widgets: [
            {
              type: "preset",
              id: "preset-placement",
              presetId: "home-score-analytics",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
            },
          ],
        },
      },
      auth,
    );
    expect(updatedDashboard.body).toMatchObject({
      name: "Updated API dashboard",
      description: "Updated via unstable API",
      filters: updatedFilters,
      definition: {
        widgets: [
          expect.objectContaining({
            id: "preset-placement",
            presetId: "home-score-analytics",
          }),
        ],
      },
    });

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

    const duplicatePlacement = await makeAPICall(
      "POST",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/placements`,
      {
        type: "widget",
        id: "placement-1",
        widgetId: createdWidget.body.id,
      },
      auth,
    );
    expect(duplicatePlacement.status).toBe(409);
    expect(
      UnstablePublicApiErrorResponse.parse(duplicatePlacement.body).code,
    ).toBe("conflict");

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
      DeleteDashboardPlacementResponse,
      "DELETE",
      `/api/public/unstable/dashboards/${createdDashboard.body.id}/placements/preset-placement`,
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

    await expect(
      prisma.dashboardWidget.findUnique({
        where: { id: createdWidget.body.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.dashboard.findUnique({
        where: { id: createdDashboard.body.id },
      }),
    ).resolves.toBeNull();

    const apiKey = await prisma.apiKey.findFirstOrThrow({
      where: { projectId, publicKey },
      select: { id: true },
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        projectId,
        apiKeyId: apiKey.id,
        resourceId: {
          in: [createdDashboard.body.id, createdWidget.body.id],
        },
      },
    });
    const dashboardAuditLogs = auditLogs.filter(
      ({ resourceId }) => resourceId === createdDashboard.body.id,
    );
    const widgetAuditLogs = auditLogs.filter(
      ({ resourceId }) => resourceId === createdWidget.body.id,
    );
    expect(dashboardAuditLogs.map(({ action }) => action).sort()).toEqual(
      [
        "create",
        "update",
        "update",
        "update",
        "update",
        "update",
        "delete",
      ].sort(),
    );
    expect(widgetAuditLogs.map(({ action }) => action).sort()).toEqual(
      ["create", "update", "delete"].sort(),
    );
    for (const auditLog of auditLogs) {
      expect(auditLog).toMatchObject({
        projectId,
        apiKeyId: apiKey.id,
        type: "API_KEY",
      });
      if (auditLog.action === "create") {
        expect(auditLog.before).toBeNull();
        expect(auditLog.after).not.toBeNull();
      } else if (auditLog.action === "update") {
        expect(auditLog.before).not.toBeNull();
        expect(auditLog.after).not.toBeNull();
      } else if (auditLog.action === "delete") {
        expect(auditLog.before).not.toBeNull();
        expect(auditLog.after).toBeNull();
      }
    }
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
      const managedRead = await makeAPICall(
        "GET",
        `/api/public/unstable/dashboards/${langfuseManaged.id}`,
        undefined,
        auth,
      );
      expect(managedRead.status).toBe(404);
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

  it("rejects definitions with duplicate placement ids", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const createdWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      widget,
      auth,
    );
    const placement = {
      type: "widget",
      id: "placement-1",
      widgetId: createdWidget.body.id,
      x: 0,
      y: 0,
      width: 4,
      height: 3,
    };
    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboards",
      {
        name: "Duplicate placement ids",
        description: "",
        definition: { widgets: [placement, { ...placement, y: 3 }] },
      },
      auth,
    );
    expect(response.status).toBe(400);
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

      const listed = await makeZodVerifiedAPICall(
        GetUnstableDashboardWidgetsResponse,
        "GET",
        "/api/public/unstable/dashboard-widgets?page=1&limit=50",
        undefined,
        auth,
      );
      expect(listed.body.data.map(({ id }) => id)).not.toContain(
        langfuseWidget.id,
      );
      for (const [method, body] of [
        ["GET", undefined],
        ["PATCH", { name: "Cannot rename managed widget" }],
        ["DELETE", undefined],
      ] as const) {
        const response = await makeAPICall(
          method,
          `/api/public/unstable/dashboard-widgets/${langfuseWidget.id}`,
          body,
          auth,
        );
        expect(response.status).toBe(404);
      }
      await expect(
        prisma.dashboardWidget.findUnique({
          where: { id: langfuseWidget.id },
        }),
      ).resolves.toMatchObject({
        projectId: null,
        name: "Langfuse managed widget",
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

  it("does not expose or mutate dashboards and widgets across projects", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const { auth: otherAuth } = await createOrgProjectAndApiKey();
    const ownerWidget = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      { ...widget, name: "Private widget" },
      auth,
    );
    const dashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Private dashboard", description: "" },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDashboardPlacementResponse,
      "POST",
      `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
      {
        type: "widget",
        id: "private-placement",
        widgetId: ownerWidget.body.id,
      },
      auth,
    );
    const otherDashboard = await makeZodVerifiedAPICall(
      PostUnstableDashboardResponse,
      "POST",
      "/api/public/unstable/dashboards",
      { name: "Other dashboard", description: "" },
      otherAuth,
    );

    const [otherDashboards, otherWidgets] = await Promise.all([
      makeZodVerifiedAPICall(
        GetUnstableDashboardsResponse,
        "GET",
        "/api/public/unstable/dashboards?page=1&limit=50",
        undefined,
        otherAuth,
      ),
      makeZodVerifiedAPICall(
        GetUnstableDashboardWidgetsResponse,
        "GET",
        "/api/public/unstable/dashboard-widgets?page=1&limit=50",
        undefined,
        otherAuth,
      ),
    ]);
    expect(otherDashboards.body.data.map(({ id }) => id)).not.toContain(
      dashboard.body.id,
    );
    expect(otherWidgets.body.data.map(({ id }) => id)).not.toContain(
      ownerWidget.body.id,
    );

    const forbiddenRequests = [
      [
        "GET",
        `/api/public/unstable/dashboards/${dashboard.body.id}`,
        undefined,
      ],
      [
        "PATCH",
        `/api/public/unstable/dashboards/${dashboard.body.id}`,
        { name: "Cross-project rename" },
      ],
      [
        "DELETE",
        `/api/public/unstable/dashboards/${dashboard.body.id}`,
        undefined,
      ],
      [
        "POST",
        `/api/public/unstable/dashboards/${dashboard.body.id}/placements`,
        { type: "preset", presetId: "home-score-analytics" },
      ],
      [
        "PATCH",
        `/api/public/unstable/dashboards/${dashboard.body.id}/placements/private-placement`,
        { x: 3 },
      ],
      [
        "DELETE",
        `/api/public/unstable/dashboards/${dashboard.body.id}/placements/private-placement`,
        undefined,
      ],
      [
        "GET",
        `/api/public/unstable/dashboard-widgets/${ownerWidget.body.id}`,
        undefined,
      ],
      [
        "PATCH",
        `/api/public/unstable/dashboard-widgets/${ownerWidget.body.id}`,
        { name: "Cross-project widget rename" },
      ],
      [
        "DELETE",
        `/api/public/unstable/dashboard-widgets/${ownerWidget.body.id}`,
        undefined,
      ],
    ] as const;
    for (const [method, path, body] of forbiddenRequests) {
      const response = await makeAPICall(method, path, body, otherAuth);
      expect(response.status).toBe(404);
    }

    const foreignReference = await makeAPICall(
      "POST",
      `/api/public/unstable/dashboards/${otherDashboard.body.id}/placements`,
      { type: "widget", widgetId: ownerWidget.body.id },
      otherAuth,
    );
    expect(foreignReference.status).toBe(404);

    const ownerDashboard = await makeZodVerifiedAPICall(
      GetUnstableDashboardResponse,
      "GET",
      `/api/public/unstable/dashboards/${dashboard.body.id}`,
      undefined,
      auth,
    );
    expect(ownerDashboard.body).toMatchObject({
      name: "Private dashboard",
      definition: {
        widgets: [expect.objectContaining({ id: "private-placement", x: 0 })],
      },
    });
    const ownerWidgetRead = await makeZodVerifiedAPICall(
      GetUnstableDashboardWidgetResponse,
      "GET",
      `/api/public/unstable/dashboard-widgets/${ownerWidget.body.id}`,
      undefined,
      auth,
    );
    expect(ownerWidgetRead.body.name).toBe("Private widget");
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
