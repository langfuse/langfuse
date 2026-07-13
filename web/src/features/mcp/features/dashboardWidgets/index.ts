import type { McpFeatureModule } from "../../server/registry";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "./tools/createDashboardWidget";
import {
  createDashboardTool,
  handleCreateDashboard,
} from "./tools/createDashboard";
import {
  addWidgetToDashboardTool,
  handleAddWidgetToDashboard,
} from "./tools/addWidgetToDashboard";

export const dashboardWidgetsFeature = {
  name: "dashboardWidgets",
  description:
    "Manage dashboards and dashboard widgets in the current Langfuse project",
  tools: [
    {
      definition: createDashboardTool,
      handler: handleCreateDashboard,
    },
    {
      definition: createDashboardWidgetTool,
      handler: handleCreateDashboardWidget,
    },
    {
      definition: addWidgetToDashboardTool,
      handler: handleAddWidgetToDashboard,
    },
  ],
} as const satisfies McpFeatureModule;
