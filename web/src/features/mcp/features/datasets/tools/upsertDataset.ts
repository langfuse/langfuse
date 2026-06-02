import { z } from "zod";
import { createDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";
import {
  PostDatasetsV2Body,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { DatasetJSONSchema } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const UpsertDatasetBaseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional(),
  inputSchema: z.any().optional(),
  expectedOutputSchema: z.any().optional(),
});

const StringifiedDatasetJSONSchema = z
  .string()
  .transform((schema, ctx) => {
    try {
      return JSON.parse(schema) as unknown;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Must be a valid JSON string containing a JSON Schema",
      });
      return z.NEVER;
    }
  })
  .pipe(DatasetJSONSchema);

const DatasetJSONSchemaInput = z
  .union([DatasetJSONSchema, StringifiedDatasetJSONSchema])
  .nullish();

const UpsertDatasetInputSchema = PostDatasetsV2Body.extend({
  inputSchema: DatasetJSONSchemaInput,
  expectedOutputSchema: DatasetJSONSchemaInput,
});

export const [upsertDatasetTool, handleUpsertDataset] = defineTool({
  name: "upsertDataset",
  description:
    "Upsert a dataset, a named collection of input and optional expected-output examples for experiments and evaluations.",
  baseSchema: UpsertDatasetBaseSchema,
  inputSchema: UpsertDatasetInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.datasets.upsert",
      context,
      attributes: { "mcp.dataset_name": input.name },
      fn: async () => {
        const dataset = await createDatasetForApi({
          input,
          projectId: context.projectId,
          auditScope: context,
        });

        return PostDatasetsV2Response.parse(dataset);
      },
    }),
  destructiveHint: true,
});
