/** @jest-environment node */

import { v4 as uuidv4 } from "uuid";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { DashboardService } from "@langfuse/shared/src/server";
import { DashboardWidgetViews } from "@langfuse/shared/src/db";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";
import { requiresV2 } from "@/src/features/query/dataModel";

describe("dashboard widget minVersion", () => {
  let projectId: string;
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;

    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `test-dashboard-widget-${uuidv4().substring(0, 8)}@test.com`,
        name: "Test User",
      },
    });
    userId = user.id;

    await prisma.organizationMembership.create({
      data: {
        orgId,
        userId: user.id,
        role: "OWNER",
      },
    });
  });

  function makeCaller() {
    const session: Session = {
      expires: "1",
      user: {
        id: userId,
        canCreateOrganizations: true,
        name: "Test User",
        organizations: [
          {
            id: orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
                hasTraces: true,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
          v4BetaToggleVisible: false,
          observationEvals: false,
        },
        admin: true,
      },
      environment: {} as any,
    };
    const ctx = createInnerTRPCContext({ session, headers: {} });
    return appRouter.createCaller({ ...ctx, prisma });
  }

  const baseWidgetInput = {
    name: "Test Widget",
    description: "A test widget",
    view: DashboardWidgetViews.OBSERVATIONS,
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", agg: "count" }],
    filters: [],
    chartType: "LINE_TIME_SERIES" as const,
    chartConfig: { type: "LINE_TIME_SERIES" as const },
  };

  // ── requiresV2 helper tests ─────────────────────────────────────────

  describe("requiresV2", () => {
    it.each([
      // v2-only dimensions
      ["observations", [{ field: "costType" }], [], true],
      ["observations", [{ field: "usageType" }], [], true],
      // v2-only measures
      ["observations", [], [{ measure: "costByType" }], true],
      ["observations", [], [{ measure: "usageByType" }], true],
      ["observations", [], [{ measure: "traceId" }], true],
      // v1-compatible fields
      ["observations", [{ field: "name" }], [{ measure: "count" }], false],
      // views where v1 and v2 share all fields
      ["traces", [{ field: "name" }], [{ measure: "count" }], false],
      ["scores-numeric", [{ field: "name" }], [{ measure: "count" }], false],
      // unknown view
      ["nonexistent", [{ field: "name" }], [{ measure: "count" }], false],
    ])(
      "requiresV2(%s, dims=%j, measures=%j) → %s",
      (view, dimensions, measures, expected) => {
        expect(requiresV2({ view, dimensions, measures })).toBe(expected);
      },
    );
  });

  // ── Service layer tests ─────────────────────────────────────────────

  describe("DashboardService", () => {
    it("should default minVersion to 1 when not provided", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        baseWidgetInput,
        userId,
      );

      expect(widget.minVersion).toBe(1);
    });

    it("should persist minVersion=2 when explicitly provided", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, minVersion: 2 },
        userId,
      );

      expect(widget.minVersion).toBe(2);

      const fetched = await DashboardService.getWidget(widget.id, projectId);
      expect(fetched).not.toBeNull();
      expect(fetched!.minVersion).toBe(2);
    });

    it("should preserve minVersion when updating without specifying it", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, minVersion: 2 },
        userId,
      );

      const updated = await DashboardService.updateWidget(
        projectId,
        widget.id,
        { ...baseWidgetInput, name: "Updated Widget" },
        userId,
      );

      expect(updated.minVersion).toBe(2);
      expect(updated.name).toBe("Updated Widget");
    });

    it("should allow changing minVersion on update", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, minVersion: 1 },
        userId,
      );

      const updated = await DashboardService.updateWidget(
        projectId,
        widget.id,
        { ...baseWidgetInput, minVersion: 2 },
        userId,
      );

      expect(updated.minVersion).toBe(2);
    });

    it("should preserve minVersion when copying widget to project", async () => {
      const sourceWidget = await prisma.dashboardWidget.create({
        data: {
          name: "Langfuse Widget",
          description: "A Langfuse-managed widget",
          view: DashboardWidgetViews.OBSERVATIONS,
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", agg: "count" }],
          filters: [],
          chartType: "LINE_TIME_SERIES",
          chartConfig: { type: "LINE_TIME_SERIES" },
          minVersion: 2,
          projectId: null,
        },
      });

      const dashboard = await DashboardService.createDashboard(
        projectId,
        "Test Dashboard",
        "A test dashboard",
        userId,
      );

      const placementId = "placement-1";
      await DashboardService.updateDashboardDefinition(
        dashboard.id,
        projectId,
        {
          widgets: [
            {
              type: "widget" as const,
              id: placementId,
              widgetId: sourceWidget.id,
              x: 0,
              y: 0,
              x_size: 6,
              y_size: 4,
            },
          ],
        },
        userId,
      );

      const newWidgetId = await DashboardService.copyWidgetToProject({
        sourceWidgetId: sourceWidget.id,
        projectId,
        dashboardId: dashboard.id,
        placementId,
        userId: userId,
      });

      const copiedWidget = await DashboardService.getWidget(
        newWidgetId,
        projectId,
      );

      expect(copiedWidget).not.toBeNull();
      expect(copiedWidget!.minVersion).toBe(2);
      expect(copiedWidget!.owner).toBe("PROJECT");
    });
  });

  // ── tRPC measure-aggregation validation ──────────────────────────────
  // Note: basic CRUD and minVersion round-trips are covered by the
  // DashboardService tests above. These tests exercise the
  // validateMetricAggregations guard that lives in the tRPC router.

  describe("tRPC measure-aggregation validation", () => {
    it("should reject invalid aggregation on a string measure", async () => {
      const caller = makeCaller();
      await expect(
        caller.dashboardWidgets.create({
          projectId,
          name: "Invalid Widget",
          description: "histogram on traceId",
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "traceId", agg: "histogram" }],
          filters: [],
          chartType: "HISTOGRAM",
          chartConfig: { type: "HISTOGRAM", bins: 10 },
          minVersion: 2,
        }),
      ).rejects.toThrow(/not valid for measure/);
    });

    it("should allow creating a widget with uniq on a string measure", async () => {
      const caller = makeCaller();
      const result = await caller.dashboardWidgets.create({
        projectId,
        name: "Valid traceId Widget",
        description: "uniq on traceId",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "traceId", agg: "uniq" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        minVersion: 2,
      });

      expect(result.success).toBe(true);
    });

    it("should reject updating a valid widget to an invalid aggregation", async () => {
      const caller = makeCaller();
      const created = await caller.dashboardWidgets.create({
        projectId,
        name: "Widget to update",
        description: "will try invalid update",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "traceId", agg: "uniq" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        minVersion: 2,
      });

      await expect(
        caller.dashboardWidgets.update({
          projectId,
          widgetId: created.widget.id,
          name: "Widget to update",
          description: "invalid aggregation",
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "traceId", agg: "sum" }],
          filters: [],
          chartType: "NUMBER",
          chartConfig: { type: "NUMBER" },
          minVersion: 2,
        }),
      ).rejects.toThrow(/not valid for measure/);
    });

    it("should allow numeric measures with any aggregation", async () => {
      const caller = makeCaller();
      const result = await caller.dashboardWidgets.create({
        projectId,
        name: "Numeric Widget",
        description: "histogram on latency",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "latency", agg: "histogram" }],
        filters: [],
        chartType: "HISTOGRAM",
        chartConfig: { type: "HISTOGRAM", bins: 10 },
      });

      expect(result.success).toBe(true);
    });
  });
});
