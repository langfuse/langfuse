import type { McpFeatureModule } from "../../server/registry";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "./tools/createDashboardWidget";
import * as dashboardCrud from "./tools/dashboardCrud";

export const dashboardWidgetsFeature = {
  name: "dashboardWidgets",
  description: "Manage dashboard widgets in the current Langfuse project",
  tools: [
    {
      definition: dashboardCrud.listDashboardWidgetsTool,
      handler: dashboardCrud.handleListDashboardWidgets,
    },
    {
      definition: createDashboardWidgetTool,
      handler: handleCreateDashboardWidget,
    },
    {
      definition: dashboardCrud.getDashboardWidgetTool,
      handler: dashboardCrud.handleGetDashboardWidget,
    },
    {
      definition: dashboardCrud.updateDashboardWidgetTool,
      handler: dashboardCrud.handleUpdateDashboardWidget,
    },
    {
      definition: dashboardCrud.deleteDashboardWidgetTool,
      handler: dashboardCrud.handleDeleteDashboardWidget,
    },
    {
      definition: dashboardCrud.listDashboardsTool,
      handler: dashboardCrud.handleListDashboards,
    },
    {
      definition: dashboardCrud.getDashboardTool,
      handler: dashboardCrud.handleGetDashboard,
    },
    {
      definition: dashboardCrud.createDashboardTool,
      handler: dashboardCrud.handleCreateDashboard,
    },
    {
      definition: dashboardCrud.updateDashboardTool,
      handler: dashboardCrud.handleUpdateDashboard,
    },
    {
      definition: dashboardCrud.deleteDashboardTool,
      handler: dashboardCrud.handleDeleteDashboard,
    },
    {
      definition: dashboardCrud.addDashboardPlacementTool,
      handler: dashboardCrud.handleAddDashboardPlacement,
    },
    {
      definition: dashboardCrud.updateDashboardPlacementTool,
      handler: dashboardCrud.handleUpdateDashboardPlacement,
    },
    {
      definition: dashboardCrud.deleteDashboardPlacementTool,
      handler: dashboardCrud.handleDeleteDashboardPlacement,
    },
  ],
} as const satisfies McpFeatureModule;
