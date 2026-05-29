import { z } from "zod";
import {
  GetDatasetV2Query,
  GetDatasetV2Response,
} from "@/src/features/public-api/types/datasets";
import { getDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetDatasetMcpInput = GetDatasetV2Query.extend({
  datasetName: z.string(),
});

export const [getDatasetTool, handleGetDataset] = defineTool({
  name: "getDataset",
  description:
    "Get a dataset, a named collection of input and optional expected-output examples for experiments and evaluations, by name.",
  baseSchema: GetDatasetMcpInput,
  inputSchema: GetDatasetMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.get",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        const result = await getDatasetForApi({
          projectId: context.projectId,
          datasetName: input.datasetName,
        });

        return GetDatasetV2Response.parse(result);
      },
    }),
  readOnlyHint: true,
});
