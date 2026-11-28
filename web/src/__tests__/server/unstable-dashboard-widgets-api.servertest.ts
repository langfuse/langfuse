import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableDashboardWidgetResponse,
  GetUnstableDashboardWidgetsResponse,
  GetUnstableDashboardWidgetResponse,
  PatchUnstableDashboardWidgetResponse,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { StructuredPublicApiErrorResponse } from "@/src/features/public-api/types/structuredPublicApiErrorSchema";
import {
  GetUnstableDashboardResponse,
  PatchUnstableDashboardResponse,
} from "@/src/features/public-api/types/unstable-dashboards";
import { DashboardWidgetViews, prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import type { z } from "zod";

const baseWidgetBody = {
  name: "API widget",
  description: "Created via unstable API",
  view: "observations" as const,
  dimensions: [],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "NUMBER" as const,
};

const legacyTracesWidgetInput = {
  name: "Legacy traces widget",
  description: "Seeded outside the unstable API",
  view: DashboardWidgetViews.TRACES,
  dimensions: [{ field: "name" }],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "NUMBER" as const,
  chartConfig: { type: "NUMBER" as const },
};

const expectUnstableError = (
  response: Awaited<ReturnType<typeof makeAPICall>>,
  params: {
    status: number;
    code: z.infer<typeof StructuredPublicApiErrorResponse>["code"];
  },
) => {
  expect(response.status).toBe(params.status);
  const body = StructuredPublicApiErrorResponse.parse(response.body);
  expect(body.code).toBe(params.code);
  return body;
};

describe("/api/public/unstable/dashboard-widgets API", () => {
  it("returns unreadable widget definitions and preserves their placements and stored content", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const classic = await DashboardService.createWidget(
      projectId,
      legacyTracesWidgetInput,
    );
    const definition = {
      version: 1 as const,
      kind: "markdown" as const,
      config: { title: "Note", content: "Supported" },
    };
    const { widget: supported } = await DashboardService.saveWidgetDefinition(
      projectId,
      { definition },
    );
    const unreadable = await Promise.all(
      [
        {
          version: 999,
          kind: "markdown",
          config: { content: "Future content" },
        },
        { version: 1, kind: "multiQuery", config: { tabs: "invalid" } },
      ].map(async (stored, index) => {
        const widget = await DashboardService.createWidget(
          projectId,
          legacyTracesWidgetInput,
        );
        return prisma.dashboardWidget.update({
          where: { id: widget.id },
          data: {
            definition: stored,
            chartConfig: { type: "FUTURE_CHART" },
            revision: index === 0 ? -1 : 1,
          },
        });
      }),
    );
    const list = await makeZodVerifiedAPICall(
      GetUnstableDashboardWidgetsResponse,
      "GET",
      "/api/public/unstable/dashboard-widgets",
      undefined,
      auth,
    );
    expect(list.status).toBe(200);
    expect(list.body.data.map((row) => row.id).sort()).toEqual(
      [
        classic.id,
        supported.id,
        ...unreadable.map((widget) => widget.id),
      ].sort(),
    );
    expect(list.body.meta.totalItems).toBe(4);
    for (const widget of unreadable) {
      const expected = {
        id: widget.id,
        invalid: true,
        view: widget.view,
        chartType: widget.chartType,
        revision: widget.revision,
        definition: widget.definition,
        filters: widget.filters,
        dimensions: widget.dimensions,
        metrics: widget.metrics,
        chartConfig: widget.chartConfig,
      };
      expect(
        list.body.data.find((item) => item.id === widget.id),
      ).toMatchObject(expected);
      const get = await makeZodVerifiedAPICall(
        GetUnstableDashboardWidgetResponse,
        "GET",
        `/api/public/unstable/dashboard-widgets/${widget.id}`,
        undefined,
        auth,
      );
      expect(get.status).toBe(200);
      expect(get.body).toMatchObject(expected);
      expect(get.body).not.toHaveProperty("projectId");
      await expect(
        DashboardService.saveWidgetDefinition(projectId, {
          widgetId: widget.id,
          expectedRevision: 1,
          definition,
        }),
      ).rejects.toThrow(
        widget.revision < 0 ? "changed or is unavailable" : "cannot be edited",
      );
    }
    const dashboard = await prisma.dashboard.create({
      data: {
        projectId,
        name: "Future widgets",
        description: "",
        definition: {
          widgets: unreadable.map((widget, index) => ({
            type: "widget",
            id: `placement-${index}`,
            widgetId: widget.id,
            x: index * 6,
            y: 0,
            x_size: 6,
            y_size: 4,
          })),
        },
      },
    });
    const path = `/api/public/unstable/dashboards/${dashboard.id}`;
    const read = await makeZodVerifiedAPICall(
      GetUnstableDashboardResponse,
      "GET",
      path,
      undefined,
      auth,
    );
    expect(read.status).toBe(200);
    const placements = read.body.definition.widgets ?? [];
    expect(placements).toHaveLength(unreadable.length);
    const moved = {
      widgets: placements.map((placement) => ({
        ...placement,
        y: 4,
      })),
    };
    const saved = await makeZodVerifiedAPICall(
      PatchUnstableDashboardResponse,
      "PATCH",
      path,
      { definition: moved },
      auth,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.definition.widgets).toEqual(moved.widgets);
    for (const widget of unreadable) {
      await expect(
        prisma.dashboardWidget.findUnique({ where: { id: widget.id } }),
      ).resolves.toMatchObject({
        definition: widget.definition,
        revision: widget.revision,
      });
    }
  });

  it("returns complete reusable widget definitions and rejects lossy classic writes", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const definition = {
      version: 1 as const,
      kind: "markdown" as const,
      config: {
        title: "Saved note",
        content: "**Full content**",
      },
    };
    const { widget } = await DashboardService.saveWidgetDefinition(projectId, {
      definition,
    });
    const route = `/api/public/unstable/dashboard-widgets/${widget.id}`;
    const read = await makeAPICall("GET", route, undefined, auth);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      id: widget.id,
      definition,
      revision: 1,
      metrics: [],
    });
    const list = await makeAPICall(
      "GET",
      "/api/public/unstable/dashboard-widgets",
      undefined,
      auth,
    );
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: widget.id, definition }),
      ]),
    });
    const recreate = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboard-widgets",
      { ...baseWidgetBody, definition },
      auth,
    );
    expectUnstableError(recreate, { status: 400, code: "invalid_body" });
    const redefine = await makeAPICall(
      "PATCH",
      route,
      { definition, name: "Changed" },
      auth,
    );
    expectUnstableError(redefine, { status: 400, code: "invalid_body" });
    const overwrite = await makeAPICall(
      "PATCH",
      route,
      { ...baseWidgetBody, name: "Lossy replacement" },
      auth,
    );
    expect(overwrite.status).toBe(409);
    expect(
      (await DashboardService.getWidget(widget.id, projectId))?.definition,
    ).toEqual(definition);
  });

  it("creates a dashboard widget and writes an API-key audit log", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();

    const response = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      baseWidgetBody,
      auth,
    );

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: "API widget",
      view: "observations",
      chartType: "NUMBER",
      // chartConfig is derived from chartType when omitted
      chartConfig: { type: "NUMBER" },
    });

    await expect(
      prisma.dashboardWidget.findFirst({
        where: { id: response.body.id, projectId },
      }),
    ).resolves.toMatchObject({
      id: response.body.id,
      projectId,
      name: "API widget",
      view: "OBSERVATIONS",
      // The submitted shape is fully expressible in v1.
      minVersion: 1,
    });

    await expect(
      prisma.auditLog.findFirst({
        where: {
          projectId,
          resourceType: "dashboardWidget",
          resourceId: response.body.id,
          action: "create",
        },
      }),
    ).resolves.toMatchObject({
      resourceId: response.body.id,
      type: "API_KEY",
    });
  });

  it("creates and persists a boolean score widget", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();

    const response = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      {
        ...baseWidgetBody,
        name: "Boolean score widget",
        view: "scores-boolean",
        dimensions: [{ field: "booleanValue" }],
        metrics: [{ measure: "value", agg: "avg" }],
        filters: [
          {
            column: "booleanValue",
            type: "boolean",
            operator: "=",
            value: true,
          },
        ],
      },
      auth,
    );

    expect(response.body).toMatchObject({
      view: "scores-boolean",
      dimensions: [{ field: "booleanValue" }],
      metrics: [{ measure: "value", agg: "avg" }],
    });
    await expect(
      prisma.dashboardWidget.findUniqueOrThrow({
        where: { id: response.body.id, projectId },
      }),
    ).resolves.toMatchObject({ view: DashboardWidgetViews.SCORES_BOOLEAN });
  });

  it("rejects traces widgets", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboard-widgets",
      {
        ...baseWidgetBody,
        view: "traces",
      },
      auth,
    );

    expectUnstableError(response, {
      status: 400,
      code: "invalid_body",
    });
  });

  it("lists, updates, and deletes legacy traces widgets", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const legacyWidget = await DashboardService.createWidget(
      projectId,
      legacyTracesWidgetInput,
    );

    const listResponse = await makeZodVerifiedAPICall(
      GetUnstableDashboardWidgetsResponse,
      "GET",
      "/api/public/unstable/dashboard-widgets",
      undefined,
      auth,
    );
    expect(listResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: legacyWidget.id,
          view: "traces",
        }),
      ]),
    );

    const patchResponse = await makeZodVerifiedAPICall(
      PatchUnstableDashboardWidgetResponse,
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${legacyWidget.id}`,
      { name: "Renamed legacy traces widget" },
      auth,
    );
    expect(patchResponse.body).toMatchObject({
      id: legacyWidget.id,
      name: "Renamed legacy traces widget",
      view: "traces",
    });

    await makeZodVerifiedAPICall(
      DeleteUnstableDashboardWidgetResponse,
      "DELETE",
      `/api/public/unstable/dashboard-widgets/${legacyWidget.id}`,
      undefined,
      auth,
    );
  });

  it("preserves minVersion on patches that do not change the view", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const v1Widget = await DashboardService.createWidget(projectId, {
      ...legacyTracesWidgetInput,
      name: "Legacy v1 observations widget",
      view: DashboardWidgetViews.OBSERVATIONS,
    });
    await prisma.dashboardWidget.update({
      where: { id: v1Widget.id },
      // `id` is valid in v1 but uiHidden in v2, making a validation/persistence
      // version mismatch observable on the following name-only PATCH.
      data: { minVersion: 1, dimensions: [{ field: "id" }] },
    });

    await makeZodVerifiedAPICall(
      PatchUnstableDashboardWidgetResponse,
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${v1Widget.id}`,
      { name: "Renamed v1 observations widget" },
      auth,
    );
    const afterRename = await prisma.dashboardWidget.findUniqueOrThrow({
      where: { id: v1Widget.id, projectId },
    });
    expect(afterRename.minVersion).toBe(1);
  });

  it("rejects patching a widget into the legacy traces view", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const createResponse = await makeZodVerifiedAPICall(
      PostUnstableDashboardWidgetResponse,
      "POST",
      "/api/public/unstable/dashboard-widgets",
      baseWidgetBody,
      auth,
    );

    const response = await makeAPICall(
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${createResponse.body.id}`,
      { view: "traces" },
      auth,
    );

    expectUnstableError(response, {
      status: 400,
      code: "invalid_body",
    });
  });

  it("rejects a chartConfig.type that contradicts chartType", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboard-widgets",
      {
        ...baseWidgetBody,
        chartConfig: { type: "LINE_TIME_SERIES" },
      },
      auth,
    );

    expectUnstableError(response, {
      status: 400,
      code: "invalid_request",
    });
  });

  it("returns unstable invalid_request errors for semantically invalid widgets", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboard-widgets",
      {
        ...baseWidgetBody,
        metrics: [{ measure: "uniqueUserIds", agg: "avg" }],
      },
      auth,
    );

    const body = expectUnstableError(response, {
      status: 400,
      code: "invalid_request",
    });
    expect(body.details).toMatchObject({ field: "metrics[0].agg" });
  });

  it("rejects filter columns that widget JSON import would remove", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/dashboard-widgets",
      {
        ...baseWidgetBody,
        filters: [
          {
            type: "string",
            column: "notAWidgetFilterColumn",
            operator: "=",
            value: "value",
          },
        ],
      },
      auth,
    );

    const body = expectUnstableError(response, {
      status: 400,
      code: "invalid_request",
    });
    expect(body.details).toMatchObject({ field: "filters" });
  });
});
