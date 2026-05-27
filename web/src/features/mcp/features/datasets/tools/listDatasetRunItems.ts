import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  generateDatasetRunItemsForPublicApi,
  getDatasetRunItemsCountForPublicApi,
} from "@/src/features/public-api/server/dataset-run-items";
import {
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";

export const [listDatasetRunItemsTool, handleListDatasetRunItems] = defineTool({
  name: "listDatasetRunItems",
  description:
    "List dataset run items, each linking one dataset item to a trace or observation within a dataset run, by dataset ID and run name.",
  baseSchema: GetDatasetRunItemsV1Query,
  inputSchema: GetDatasetRunItemsV1Query,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_run_items.list",
      context,
      attributes: {
        "mcp.dataset_id": input.datasetId,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRun = await prisma.datasetRuns.findUnique({
          where: {
            datasetId_projectId_name: {
              datasetId: input.datasetId,
              name: input.runName,
              projectId: context.projectId,
            },
          },
          select: { id: true, name: true },
        });

        if (!datasetRun) {
          throw new LangfuseNotFoundError(
            "Dataset run not found for the given project and dataset id",
          );
        }

        const [items, count] = await Promise.all([
          generateDatasetRunItemsForPublicApi({
            props: {
              datasetId: input.datasetId,
              runId: datasetRun.id,
              projectId: context.projectId,
              limit: input.limit,
              page: input.page,
            },
          }),
          getDatasetRunItemsCountForPublicApi({
            props: {
              datasetId: input.datasetId,
              runId: datasetRun.id,
              projectId: context.projectId,
              limit: input.limit,
              page: input.page,
            },
          }),
        ]);

        const totalItems = count || 0;
        return GetDatasetRunItemsV1Response.parse({
          data: items,
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
