import { v4 as uuidv4 } from "uuid";
import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError, LangfuseConflictError } from "@langfuse/shared";
import { DashboardWidgetViews, prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";
import type { TRPCError } from "@trpc/server";

const widgetInput = {
  name: "delete-me",
  description: "",
  view: DashboardWidgetViews.TRACES,
  dimensions: [{ field: "name" }],
  metrics: [{ measure: "count", agg: "count" as const }],
  filters: [],
  chartType: "LINE_TIME_SERIES" as const,
  chartConfig: { type: "LINE_TIME_SERIES" as const },
};

async function createOwnerCaller() {
  const { project, org } = await createOrgProjectAndApiKey();
  const session: Session = {
    expires: "1",
    user: {
      id: `widget-delete-user-${uuidv4()}`,
      canCreateOrganizations: true,
      name: "Test User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        searchBar: false,
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    projectId: project.id,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}

describe("DashboardService.deleteDashboard", () => {
  it("deletes an existing dashboard and throws LangfuseNotFoundError on repeat delete", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "delete-me",
      "",
    );

    await DashboardService.deleteDashboard(dashboard.id, projectId);

    await expect(
      DashboardService.deleteDashboard(dashboard.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError for an unknown dashboard id", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await expect(
      DashboardService.deleteDashboard(uuidv4(), projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError when the dashboard belongs to another project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
    const dashboard = await DashboardService.createDashboard(
      otherProjectId,
      "other-project",
      "",
    );

    await expect(
      DashboardService.deleteDashboard(dashboard.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });
});

describe("DashboardService.deleteWidget", () => {
  it("deletes an existing widget and throws LangfuseNotFoundError on repeat delete", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const widget = await DashboardService.createWidget(projectId, widgetInput);

    await DashboardService.deleteWidget(widget.id, projectId);

    await expect(
      DashboardService.deleteWidget(widget.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError for an unknown widget id", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    await expect(
      DashboardService.deleteWidget(uuidv4(), projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseNotFoundError when the widget belongs to another project", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { projectId: otherProjectId } = await createOrgProjectAndApiKey();
    const widget = await DashboardService.createWidget(
      otherProjectId,
      widgetInput,
    );

    await expect(
      DashboardService.deleteWidget(widget.id, projectId),
    ).rejects.toThrow(LangfuseNotFoundError);
  });

  it("throws LangfuseConflictError when the widget is still on a dashboard", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const widget = await DashboardService.createWidget(projectId, widgetInput);
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "uses-widget",
      "",
    );
    await DashboardService.updateDashboardDefinition(dashboard.id, projectId, {
      widgets: [
        {
          type: "widget",
          id: uuidv4(),
          widgetId: widget.id,
          x: 0,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
      ],
    });

    await expect(
      DashboardService.deleteWidget(widget.id, projectId),
    ).rejects.toThrow(LangfuseConflictError);
  });
});

describe("dashboardWidgets.delete", () => {
  it("returns NOT_FOUND instead of INTERNAL_SERVER_ERROR for a missing widget", async () => {
    const { projectId, caller } = await createOwnerCaller();

    await expect(
      caller.dashboardWidgets.delete({
        projectId,
        widgetId: uuidv4(),
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<TRPCError>);
  });

  it("returns CONFLICT when the widget is still on a dashboard", async () => {
    const { projectId, caller } = await createOwnerCaller();
    const widget = await DashboardService.createWidget(projectId, widgetInput);
    const dashboard = await DashboardService.createDashboard(
      projectId,
      "uses-widget",
      "",
    );
    await DashboardService.updateDashboardDefinition(dashboard.id, projectId, {
      widgets: [
        {
          type: "widget",
          id: uuidv4(),
          widgetId: widget.id,
          x: 0,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
      ],
    });

    await expect(
      caller.dashboardWidgets.delete({
        projectId,
        widgetId: widget.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    } satisfies Partial<TRPCError>);
  });
});
