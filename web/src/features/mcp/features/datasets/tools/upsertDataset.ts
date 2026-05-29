import { z } from "zod";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { upsertDataset } from "@/src/features/datasets/server/actions/createDataset";
import {
  PostDatasetsV2Body,
  PostDatasetsV2Response,
  transformDbDatasetToAPIDataset,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpsertDatasetBaseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional(),
  inputSchema: z.any().optional(),
  expectedOutputSchema: z.any().optional(),
});

export const [upsertDatasetTool, handleUpsertDataset] = defineTool({
  name: "upsertDataset",
  description:
    "Upsert a dataset, a named collection of input and optional expected-output examples for experiments and evaluations.",
  baseSchema: UpsertDatasetBaseSchema,
  inputSchema: PostDatasetsV2Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.upsert",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const dataset = await upsertDataset({
          input: {
            name: input.name,
            description: input.description ?? undefined,
            metadata: input.metadata ?? undefined,
            inputSchema: input.inputSchema,
            expectedOutputSchema: input.expectedOutputSchema,
          },
          projectId: context.projectId,
        });

        await auditLog({
          action: "create",
          resourceType: "dataset",
          resourceId: dataset.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: dataset,
        });

        return PostDatasetsV2Response.parse(
          transformDbDatasetToAPIDataset(dataset),
        );
      },
    }),
  destructiveHint: true,
});
