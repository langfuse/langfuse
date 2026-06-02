import { z } from "zod";
import { PostDatasetRunItemsV1Body } from "@/src/features/public-api/types/datasets";
import { createDatasetRunItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";

const CreateDatasetRunItemBaseSchema = z.object({
  runName: z.string(),
  runDescription: z.string().optional(),
  metadata: z.any().optional(),
  datasetItemId: z.string(),
  observationId: z
    .string()
    .optional()
    .describe(
      "Observation ID linked to this run item. Provide this or traceId.",
    ),
  traceId: z
    .string()
    .optional()
    .describe(
      "Trace ID linked to this run item. Provide this or observationId.",
    ),
  datasetVersion: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

export const [createDatasetRunItemTool, handleCreateDatasetRunItem] =
  defineTool({
    name: "createDatasetRunItem",
    description:
      "Create a dataset run item, a result that links one dataset item to a trace or observation in a dataset run.",
    baseSchema: CreateDatasetRunItemBaseSchema,
    inputSchema: PostDatasetRunItemsV1Body,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.dataset_run_items.create",
        context,
        attributes: {
          "mcp.dataset_item_id": input.datasetItemId,
          "mcp.dataset_run_name": input.runName,
        },
        fn: async () => {
          const auth = await getMcpPublicApiAuth(context);
          return await createDatasetRunItemForApi({
            body: input,
            auth,
            auditScope: context,
          });
        },
      }),
  });
