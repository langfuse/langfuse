import { LangfuseConflictError, LangfuseNotFoundError } from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { logger, upsertDatasetItem } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
  transformDbDatasetItemDomainToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [createDatasetItemTool, handleCreateDatasetItem] = defineTool({
  name: "createDatasetItem",
  description:
    "Create or upsert a dataset item, one example in a dataset with input and optional expected output.",
  baseSchema: PostDatasetItemsV1Body,
  inputSchema: PostDatasetItemsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.create",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        try {
          const datasetItem = await upsertDatasetItem({
            projectId: context.projectId,
            datasetName: input.datasetName,
            datasetItemId: input.id ?? undefined,
            input: input.input ?? undefined,
            expectedOutput: input.expectedOutput ?? undefined,
            metadata: input.metadata ?? undefined,
            sourceTraceId: input.sourceTraceId ?? undefined,
            sourceObservationId: input.sourceObservationId ?? undefined,
            status: input.status ?? undefined,
            normalizeOpts: { sanitizeControlChars: true },
            validateOpts: { normalizeUndefinedToNull: input.id ? false : true },
          });

          await auditLog({
            action: "create",
            resourceType: "datasetItem",
            resourceId: datasetItem.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: datasetItem,
          });

          return PostDatasetItemsV1Response.parse(
            transformDbDatasetItemDomainToAPIDatasetItem({
              ...datasetItem,
              datasetName: input.datasetName,
              status: datasetItem.status ?? "ACTIVE",
            }),
          );
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === "P2025") {
              logger.warn(
                `Failed to upsert dataset item. Dataset item ${input.id} already exists for a different dataset than ${input.datasetName}`,
              );
              throw new LangfuseNotFoundError(
                `The dataset item with id ${input.id} already exists in a dataset other than ${input.datasetName}`,
              );
            }
            if (error.code === "P2002") {
              logger.warn(
                `Failed to upsert dataset item due to version conflict. Dataset item ${input.id} was modified concurrently.`,
              );
              throw new LangfuseConflictError(
                `Dataset item ${input.id ?? "new"} was modified concurrently. Please retry the request.`,
              );
            }
          }
          throw error;
        }
      },
    }),
  destructiveHint: true,
});
