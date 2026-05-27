import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createDatasetItemFilterState,
  getDatasetItems,
  getDatasetItemsCount,
} from "@langfuse/shared/src/server";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
  transformDbDatasetItemDomainToAPIDatasetItem,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";

export const [listDatasetItemsTool, handleListDatasetItems] = defineTool({
  name: "listDatasetItems",
  description:
    "List dataset items, individual examples with input and optional expected output, optionally filtered by dataset name, source trace, source observation, or version.",
  baseSchema: GetDatasetItemsV1Query,
  inputSchema: GetDatasetItemsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.list",
      context,
      attributes: {
        "mcp.dataset_name": input.datasetName ?? undefined,
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async () => {
        let datasetId: string | undefined;
        if (input.datasetName) {
          const dataset = await prisma.dataset.findFirst({
            where: {
              name: input.datasetName,
              projectId: context.projectId,
            },
          });
          if (!dataset) {
            throw new LangfuseNotFoundError("Dataset not found");
          }
          datasetId = dataset.id;
        }

        const filterState = createDatasetItemFilterState({
          ...(datasetId && { datasetIds: [datasetId] }),
          sourceTraceId: input.sourceTraceId ?? undefined,
          sourceObservationId: input.sourceObservationId ?? undefined,
          status: "ACTIVE",
        });

        const [items, totalItems] = await Promise.all([
          getDatasetItems({
            projectId: context.projectId,
            filterState,
            version: input.version ?? undefined,
            includeDatasetName: true,
            limit: input.limit,
            page: input.page - 1,
          }),
          getDatasetItemsCount({
            projectId: context.projectId,
            filterState,
            version: input.version ?? undefined,
          }),
        ]);

        return GetDatasetItemsV1Response.parse({
          data: items.map(transformDbDatasetItemDomainToAPIDatasetItem),
          meta: paginationMeta({
            page: input.page,
            limit: input.limit,
            totalItems,
          }),
        });
      },
    }),
  readOnlyHint: true,
});
