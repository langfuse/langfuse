import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableDashboardWidgetResponse,
  GetUnstableDashboardWidgetsResponse,
  PatchUnstableDashboardWidgetResponse,
  PostUnstableDashboardWidgetResponse,
} from "@/src/features/public-api/types/unstable-dashboard-widgets";
import { UnstablePublicApiErrorResponse } from "@/src/features/public-api/types/unstable-public-evals-contract";
import { DashboardWidgetViews } from "@langfuse/shared/src/db";
import { prisma } from "@langfuse/shared/src/db";
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
  minVersion: 1,
};

const expectUnstableError = (
  response: Awaited<ReturnType<typeof makeAPICall>>,
  params: {
    status: number;
    code: z.infer<typeof UnstablePublicApiErrorResponse>["code"];
  },
) => {
  expect(response.status).toBe(params.status);
  const body = UnstablePublicApiErrorResponse.parse(response.body);
  expect(body.code).toBe(params.code);
  return body;
};

describe("/api/public/unstable/dashboard-widgets API", () => {
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
      // widgets created via the public API are always v2 internally
      minVersion: 2,
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

    const patchViewResponse = await makeZodVerifiedAPICall(
      PatchUnstableDashboardWidgetResponse,
      "PATCH",
      `/api/public/unstable/dashboard-widgets/${v1Widget.id}`,
      { view: "scores-numeric" },
      auth,
    );
    expect(patchViewResponse.body.view).toBe("scores-numeric");
    const afterViewChange = await prisma.dashboardWidget.findUniqueOrThrow({
      where: { id: v1Widget.id, projectId },
    });
    expect(afterViewChange.minVersion).toBe(2);
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
