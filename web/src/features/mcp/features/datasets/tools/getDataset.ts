import { GetDatasetV2Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { buildDatasetUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getDatasetByIdForApi } from "@/src/features/datasets/server/publicDatasetService";
import { GetDatasetMcpInput } from "../schema";

export const [getDatasetTool, handleGetDataset] = defineTool({
  name: "getDataset",
  description:
    "Get a dataset, a named collection of input and optional expected-output examples for experiments and evaluations, by ID.",
  baseSchema: GetDatasetMcpInput,
  inputSchema: GetDatasetMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.get",
      context,
      attributes: { "mcp.dataset_id": input.datasetId },
      fn: async () => {
        const result = await getDatasetByIdForApi({
          projectId: context.projectId,
          datasetId: input.datasetId,
        });

        const dataset = GetDatasetV2Response.parse(result);

        return {
          ...dataset,
          url: buildDatasetUrl({
            projectId: context.projectId,
            datasetId: dataset.id,
          }),
        };
      },
    }),
  readOnlyHint: true,
});
