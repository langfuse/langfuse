/** @jest-environment node */

import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { DashboardService } from "@langfuse/shared/src/server";
import { DashboardWidgetViews } from "@langfuse/shared/src/db";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";

describe("dashboard widget version", () => {
  let projectId: string;
  let orgId: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;
  });

  function makeCaller() {
    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
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

  // ── Service layer tests ─────────────────────────────────────────────

  describe("DashboardService", () => {
    it("should default version to 1 when not provided", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        baseWidgetInput,
        "user-1",
      );

      expect(widget.version).toBe(1);
    });

    it("should persist version=2 when explicitly provided", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, version: 2 },
        "user-1",
      );

      expect(widget.version).toBe(2);

      // Verify via getWidget
      const fetched = await DashboardService.getWidget(widget.id, projectId);
      expect(fetched).not.toBeNull();
      expect(fetched!.version).toBe(2);
    });

    it("should preserve version when updating without specifying it", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, version: 2 },
        "user-1",
      );

      // Update without version
      const updated = await DashboardService.updateWidget(
        projectId,
        widget.id,
        { ...baseWidgetInput, name: "Updated Widget" },
        "user-1",
      );

      expect(updated.version).toBe(2);
      expect(updated.name).toBe("Updated Widget");
    });

    it("should allow changing version on update", async () => {
      const widget = await DashboardService.createWidget(
        projectId,
        { ...baseWidgetInput, version: 1 },
        "user-1",
      );

      const updated = await DashboardService.updateWidget(
        projectId,
        widget.id,
        { ...baseWidgetInput, version: 2 },
        "user-1",
      );

      expect(updated.version).toBe(2);
    });

    it("should preserve version when copying widget to project", async () => {
      // Create a Langfuse-managed widget (projectId=null) directly in DB
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
          version: 2,
          projectId: null,
        },
      });

      // Create a dashboard to copy into
      const dashboard = await DashboardService.createDashboard(
        projectId,
        "Test Dashboard",
        "A test dashboard",
        "user-1",
      );

      // Add a placement pointing to the source widget
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
        "user-1",
      );

      // Copy widget to project
      const newWidgetId = await DashboardService.copyWidgetToProject({
        sourceWidgetId: sourceWidget.id,
        projectId,
        dashboardId: dashboard.id,
        placementId,
        userId: "user-1",
      });

      const copiedWidget = await DashboardService.getWidget(
        newWidgetId,
        projectId,
      );

      expect(copiedWidget).not.toBeNull();
      expect(copiedWidget!.version).toBe(2);
      expect(copiedWidget!.owner).toBe("PROJECT");
    });
  });

  // ── tRPC router tests ──────────────────────────────────────────────

  describe("tRPC dashboardWidgets router", () => {
    it("should create widget with default version=1", async () => {
      const caller = makeCaller();
      const result = await caller.dashboardWidgets.create({
        projectId,
        name: "tRPC Widget v1",
        description: "Widget without explicit version",
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "LINE_TIME_SERIES",
        chartConfig: { type: "LINE_TIME_SERIES" },
      });

      expect(result.widget.version).toBe(1);
    });

    it("should create widget with version=2", async () => {
      const caller = makeCaller();
      const result = await caller.dashboardWidgets.create({
        projectId,
        name: "tRPC Widget v2",
        description: "Widget with v2",
        view: "observations",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "LINE_TIME_SERIES",
        chartConfig: { type: "LINE_TIME_SERIES" },
        version: 2,
      });

      expect(result.widget.version).toBe(2);
    });

    it("should return version when getting widget", async () => {
      const caller = makeCaller();
      const created = await caller.dashboardWidgets.create({
        projectId,
        name: "tRPC Get Widget",
        description: "Widget for get test",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        version: 2,
      });

      const fetched = await caller.dashboardWidgets.get({
        projectId,
        widgetId: created.widget.id,
      });

      expect(fetched.version).toBe(2);
    });

    it("should update widget version", async () => {
      const caller = makeCaller();
      const created = await caller.dashboardWidgets.create({
        projectId,
        name: "tRPC Update Widget",
        description: "Widget for update test",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        version: 1,
      });

      await caller.dashboardWidgets.update({
        projectId,
        widgetId: created.widget.id,
        name: "tRPC Update Widget",
        description: "Widget for update test",
        view: "observations",
        dimensions: [],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "NUMBER",
        chartConfig: { type: "NUMBER" },
        version: 2,
      });

      const fetched = await caller.dashboardWidgets.get({
        projectId,
        widgetId: created.widget.id,
      });

      expect(fetched.version).toBe(2);
    });

    it("should allow creating widget with traces view (v1)", async () => {
      const caller = makeCaller();
      const result = await caller.dashboardWidgets.create({
        projectId,
        name: "Traces Widget",
        description: "Widget using traces view",
        view: "traces",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "LINE_TIME_SERIES",
        chartConfig: { type: "LINE_TIME_SERIES" },
        version: 1,
      });

      expect(result.widget.version).toBe(1);
    });
  });
});
