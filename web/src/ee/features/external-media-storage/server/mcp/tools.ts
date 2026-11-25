import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

import { createExternalMediaStorageService } from "@/src/ee/features/external-media-storage/server/service";
import { externalMediaStorageFormSchema } from "@/src/ee/features/external-media-storage/types";
import { defineTool } from "@/src/features/mcp/core/define-tool";
import { runMcpTool } from "@/src/features/mcp/core/run-mcp-tool";

const EmptyInputSchema = z.object({});
const ExternalMediaStorageBaseSchema = z.object({
  type: z
    .enum(["S3", "S3_COMPATIBLE"])
    .describe("S3_COMPATIBLE for MinIO, R2 and similar."),
  authType: z
    .enum(["ACCESS_KEYS", "ROLE_ARN"])
    .optional()
    .describe(
      "Default ACCESS_KEYS. ROLE_ARN (Amazon S3 only, Enterprise plan) assumes roleArn; its trust policy needs the external ID from the project settings in the Langfuse UI.",
    ),
  bucketName: z.string(),
  endpoint: z
    .string()
    .optional()
    .describe(
      "e.g. https://minio.example.com. Required for S3_COMPATIBLE, ignored for S3.",
    ),
  region: z
    .string()
    .describe("e.g. us-east-1. ROLE_ARN needs a real AWS region, not 'auto'."),
  accessKeyId: z.string().optional().describe("Required for ACCESS_KEYS."),
  secretAccessKey: z
    .string()
    .optional()
    .describe(
      "ACCESS_KEYS only. Empty keeps the saved secret; required again when type, endpoint, bucketName or accessKeyId changes.",
    ),
  roleArn: z.string().optional().describe("Required for ROLE_ARN."),
  prefix: z
    .string()
    .optional()
    .describe(
      "Key prefix limiting which objects resolve, e.g. 'media/'; must end with '/'.",
    ),
  forcePathStyle: z
    .boolean()
    .describe(
      "Path-style URLs (endpoint/bucket/key); usually true for MinIO, false for Amazon S3.",
    ),
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
    annotations: { readOnlyHint: true },
  });

export const [
  configureExternalMediaStorageTool,
  handleConfigureExternalMediaStorage,
] = defineTool({
  name: "configureExternalMediaStorage",
  description:
    "Create or replace the project's external media storage, the S3 bucket traces reference as s3://bucket/key media. Overwrites any existing configuration (see it with getExternalMediaStorage); verify afterwards with testExternalMediaStorage.",
  action: "integrations:CRUD",
  baseSchema: ExternalMediaStorageBaseSchema,
  inputSchema: externalMediaStorageFormSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.external_media_storage.configure",
      context,
      attributes: {
        "mcp.storage_type": input.type,
      },
      fn: async () => {
        const { actor, service } = getService(context);
        await service.saveConfiguration({
          actor,
          projectId: context.projectId,
          values: input,
          plan: context.plan,
        });
        return { success: true };
      },
    }),
  annotations: { destructiveHint: true },
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
  annotations: { destructiveHint: true },
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
    annotations: { readOnlyHint: true },
  });
