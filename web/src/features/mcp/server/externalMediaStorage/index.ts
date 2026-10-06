import { type McpFeatureModule } from "@/src/features/mcp/server/registry";

import {
  configureExternalMediaStorageTool,
  deleteExternalMediaStorageTool,
  getExternalMediaStorageTool,
  handleConfigureExternalMediaStorage,
  handleDeleteExternalMediaStorage,
  handleGetExternalMediaStorage,
  handleTestExternalMediaStorage,
  testExternalMediaStorageTool,
} from "./tools";

export const externalMediaStorageFeature = {
  name: "external-media-storage",
  description:
    "Configure S3 external media storage for the current Langfuse project",
  tools: [
    {
      definition: getExternalMediaStorageTool,
      handler: handleGetExternalMediaStorage,
    },
    {
      definition: configureExternalMediaStorageTool,
      handler: handleConfigureExternalMediaStorage,
    },
    {
      definition: deleteExternalMediaStorageTool,
      handler: handleDeleteExternalMediaStorage,
    },
    {
      definition: testExternalMediaStorageTool,
      handler: handleTestExternalMediaStorage,
    },
  ],
} as const satisfies McpFeatureModule;
