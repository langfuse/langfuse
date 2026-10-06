import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

import { createExternalMediaStorageService } from "@/src/features/external-media-storage/server/service";
import { externalMediaStorageFormSchema } from "@/src/features/external-media-storage/types";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const EmptyInputSchema = z.object({});
const ExternalMediaStorageBaseSchema = z.object({
  type: z.enum(["S3", "S3_COMPATIBLE"]),
  bucketName: z.string(),
  endpoint: z.string().optional(),
  region: z.string(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  prefix: z.string().optional(),
  enabled: z.boolean(),
  forcePathStyle: z.boolean(),
});
const TestObjectInputSchema = z.object({
  uri: z.string().describe("S3 URI in the form s3://bucket/path/to/object"),
});

function getService(context: {
  apiKeyId: string;
  orgId: string;
  projectId: string;
}) {
  return {
    actor: {
      apiKeyId: context.apiKeyId,
      orgId: context.orgId,
    },
    service: createExternalMediaStorageService(prisma),
  };
}

export const [getExternalMediaStorageTool, handleGetExternalMediaStorage] =
  defineTool({
    name: "getExternalMediaStorage",
    description:
      "Get the external media storage configuration for the current project. Secret credentials are never returned.",
    action: "integrations:CRUD",
    baseSchema: EmptyInputSchema,
    inputSchema: EmptyInputSchema,
    handler: async (_input, context) =>
      runMcpTool({
        spanName: "mcp.external_media_storage.get",
        context,
        fn: async () =>
          getService(context).service.getConfiguration(context.projectId),
      }),
    readOnlyHint: true,
  });

export const [
  configureExternalMediaStorageTool,
  handleConfigureExternalMediaStorage,
] = defineTool({
  name: "configureExternalMediaStorage",
  description:
    "Create or update the S3 external media storage configuration for the current project. Leave secretAccessKey empty to retain the saved secret.",
  action: "integrations:CRUD",
  baseSchema: ExternalMediaStorageBaseSchema,
  inputSchema: externalMediaStorageFormSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.external_media_storage.configure",
      context,
      attributes: {
        "mcp.storage_type": input.type,
        "mcp.storage_enabled": input.enabled,
      },
      fn: async () => {
        const { actor, service } = getService(context);
        await service.saveConfiguration({
          actor,
          projectId: context.projectId,
          values: input,
        });
        return { success: true };
      },
    }),
});

export const [
  deleteExternalMediaStorageTool,
  handleDeleteExternalMediaStorage,
] = defineTool({
  name: "deleteExternalMediaStorage",
  description:
    "Delete the external media storage configuration for the current project.",
  action: "integrations:CRUD",
  baseSchema: EmptyInputSchema,
  inputSchema: EmptyInputSchema,
  handler: async (_input, context) =>
    runMcpTool({
      spanName: "mcp.external_media_storage.delete",
      context,
      fn: async () => {
        const { actor, service } = getService(context);
        await service.deleteConfiguration({
          actor,
          projectId: context.projectId,
        });
        return { success: true };
      },
    }),
  destructiveHint: true,
});

export const [testExternalMediaStorageTool, handleTestExternalMediaStorage] =
  defineTool({
    name: "testExternalMediaStorage",
    description:
      "Generate a short-lived signed URL for an existing S3 object using the current project's external media storage configuration.",
    action: "integrations:CRUD",
    baseSchema: TestObjectInputSchema,
    inputSchema: TestObjectInputSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.external_media_storage.test",
        context,
        fn: async () =>
          getService(context).service.testObject({
            projectId: context.projectId,
            uri: input.uri,
          }),
      }),
    readOnlyHint: true,
  });
