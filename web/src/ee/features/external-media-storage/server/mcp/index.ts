import { prisma } from "@langfuse/shared/src/db";

import { createExternalMediaStorageService } from "@/src/ee/features/external-media-storage/server/service";
import type { McpFeatureModule } from "@/src/features/mcp/server/tools";

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
  description: "Configure S3 external media storage for a Langfuse project",
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
  // An organization key's connection has no project, so availability follows its organization.
  isEnabled: (connection) =>
    connection.auth.principal.kind === "apiKey" &&
    createExternalMediaStorageService(prisma).isOrganizationFeatureEnabled(
      connection.auth.principal.boundResource.orgId,
    ),
} as const satisfies McpFeatureModule;
