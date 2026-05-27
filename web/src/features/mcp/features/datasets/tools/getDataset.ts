import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetDatasetV2Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { GetDatasetMcpInput } from "../schema";

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
        const dataset = await prisma.dataset.findFirst({
          where: {
            name: input.datasetName,
            projectId: context.projectId,
          },
        });

        if (!dataset) {
          throw new LangfuseNotFoundError("Dataset not found");
        }

        return GetDatasetV2Response.parse(
          transformDbDatasetToAPIDataset(dataset),
        );
      },
    }),
  readOnlyHint: true,
});
