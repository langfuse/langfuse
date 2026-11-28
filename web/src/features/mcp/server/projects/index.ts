import type { McpFeatureModule } from "../tools";
import { handleListProjects, listProjectsTool } from "./tools/listProjects";

export const projectsFeature = {
  name: "projects",
  description: "List the projects the API key can access",
  tools: [
    {
      definition: listProjectsTool,
      handler: handleListProjects,
    },
  ],
} as const satisfies McpFeatureModule;
