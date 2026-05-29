import { z } from "zod";
import { createDatasetItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import {
  PostDatasetItemsV1Body,
  PostDatasetItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpsertDatasetItemBaseSchema = z.object({
  datasetName: z.string(),
  input: z.any().optional(),
  expectedOutput: z.any().optional(),
  metadata: z.any().optional(),
  id: z.string().optional(),
  sourceTraceId: z.string().optional(),
  sourceObservationId: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export const [upsertDatasetItemTool, handleUpsertDatasetItem] = defineTool({
  name: "upsertDatasetItem",
  description:
    "Upsert a dataset item, one example in a dataset with input and optional expected output.",
  baseSchema: UpsertDatasetItemBaseSchema,
  inputSchema: PostDatasetItemsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_items.upsert",
      context,
      attributes: { "mcp.dataset_name": input.datasetName },
      fn: async () => {
        const result = await createDatasetItemForApi({
          input,
          auditScope: context,
        });

        return PostDatasetItemsV1Response.parse(result);
      },
    }),
  destructiveHint: true,
});
