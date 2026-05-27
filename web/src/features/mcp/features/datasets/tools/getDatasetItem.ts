import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getDatasetItemById } from "@langfuse/shared/src/server";
import {
  GetDatasetItemV1Query,
  GetDatasetItemV1Response,
  transformDbDatasetItemDomainToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getDatasetItemTool, handleGetDatasetItem] = defineTool({
  name: "getDatasetItem",
  description:
    "Get a dataset item, one example in a dataset with input and optional expected output, by ID.",
  baseSchema: GetDatasetItemV1Query,
  inputSchema: GetDatasetItemV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.get",
      context,
      attributes: { "mcp.dataset_item_id": input.datasetItemId },
      fn: async () => {
        const datasetItem = await getDatasetItemById({
          projectId: context.projectId,
          datasetItemId: input.datasetItemId,
        });

        if (!datasetItem) {
          throw new LangfuseNotFoundError("Dataset item not found");
        }

        const dataset = await prisma.dataset.findUnique({
          where: {
            id_projectId: {
              projectId: context.projectId,
              id: datasetItem.datasetId,
            },
          },
          select: { name: true },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        return GetDatasetItemV1Response.parse(
          transformDbDatasetItemDomainToAPIDatasetItem({
            id: datasetItem.id,
            validFrom: datasetItem.validFrom,
            projectId: datasetItem.projectId,
            datasetId: datasetItem.datasetId,
            status: datasetItem.status ?? "ACTIVE",
            input: datasetItem.input,
            expectedOutput: datasetItem.expectedOutput,
            metadata: datasetItem.metadata,
            sourceTraceId: datasetItem.sourceTraceId,
            sourceObservationId: datasetItem.sourceObservationId,
            createdAt: datasetItem.createdAt,
            updatedAt: datasetItem.updatedAt,
            datasetName: dataset.name,
          }),
        );
      },
    }),
  readOnlyHint: true,
});
