import { z } from "zod";
import {
  GetDatasetItemsV1Query,
  GetDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { listDatasetItemsForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const ListDatasetItemsBaseSchema = z.object({
  datasetName: z.string().optional(),
  sourceTraceId: z.string().optional(),
  sourceObservationId: z.string().optional(),
  version: z.string().optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const [listDatasetItemsTool, handleListDatasetItems] = defineTool({
  name: "listDatasetItems",
  description:
    "List dataset items, individual examples with input and optional expected output, optionally filtered by dataset name, source trace, source observation, or version.",
  baseSchema: ListDatasetItemsBaseSchema,
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
        const result = await listDatasetItemsForApi({
          ...input,
          projectId: context.projectId,
        });

        return GetDatasetItemsV1Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
