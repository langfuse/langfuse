import type { McpFeatureModule } from "../../server/registry";
import { handleListUsers, listUsersTool } from "./tools/listUsers";

export const usersFeature: McpFeatureModule = {
  name: "users",
  description: "Discover project users",
  tools: [
    {
      definition: listUsersTool,
      handler: handleListUsers,
      allowInAppAgentKey: true,
    },
  ],
};
