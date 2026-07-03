import type { McpFeatureModule } from "../../server/registry";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "./tools/createDashboardWidget";

export const dashboardWidgetsFeature = {
  name: "dashboardWidgets",
  description: "Manage dashboard widgets in the current Langfuse project",
  tools: [
    {
      definition: createDashboardWidgetTool,
      handler: handleCreateDashboardWidget,
    },
  ],
} as const satisfies McpFeatureModule;
