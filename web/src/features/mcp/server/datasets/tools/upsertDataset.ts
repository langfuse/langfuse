import { z } from "zod";
import { createDatasetForApi } from "@/src/features/datasets/server/publicDatasetService";
import {
  PostDatasetsV2Body,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import {
  DatasetJSONSchema,
  buildDatasetUrl,
} from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const idField = z.string().min(1).optional();

const UpsertDatasetBaseSchema = z.object({
  id: idField.describe(
    "Updates (including renaming) or creates the dataset with this ID.",
  ),
  name: z.string().describe("Unique per project."),
  description: z.string().optional(),
  metadata: z.any().optional(),
  inputSchema: z
    .any()
    .optional()
    .describe(
      "JSON Schema (object or JSON string) every item input must satisfy; null removes it.",
    ),
  expectedOutputSchema: z
    .any()
    .optional()
    .describe("Like inputSchema, for every item expectedOutput."),
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
  id: idField,
});

export const [upsertDatasetTool, handleUpsertDataset] = defineTool({
  name: "upsertDataset",
  description:
    "Create or update a dataset (named collection of input/expected-output examples) and return it with a url. " +
    "Matches by id if given, else by name; provided fields overwrite, omitted fields are kept. " +
    "Setting a schema validates all existing items and fails if any do not conform.",
  action: "datasets:CUD",
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

        const parsed = PostDatasetsV2Response.parse(dataset);

        return {
          ...parsed,
          url: buildDatasetUrl({
            projectId: context.projectId,
            datasetId: parsed.id,
          }),
        };
      },
    }),
  destructiveHint: true,
});
