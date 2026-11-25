import { isoDateTime } from "@langfuse/shared";
import { z } from "zod";
import { PostDatasetRunItemsV1Body } from "@/src/features/public-api/types/datasets";
import { createDatasetRunItemForApi } from "@/src/features/datasets/server/publicDatasetService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";
import { rejectLegacyDatasetRunTools } from "../legacy-run-tools-guard";

const CreateDatasetRunItemBaseSchema = z.object({
  runName: z.string(),
  runDescription: z
    .string()
    .optional()
    .describe("Applied only when the run is created."),
  metadata: z
    .any()
    .optional()
    .describe("Run metadata; applied only when the run is created."),
  datasetItemId: z.string().describe("From listDatasetItems."),
  observationId: z.string().optional().describe("Provide this or traceId."),
  traceId: z.string().optional().describe("Provide this or observationId."),
  datasetVersion: z.string().optional(),
  createdAt: isoDateTime({ offset: true }).optional(),
});

export const [createDatasetRunItemTool, handleCreateDatasetRunItem] =
  defineTool({
    name: "createDatasetRunItem",
    description:
      "Create a dataset run item linking one dataset item to a trace or observation in a dataset run, and return it. " +
      "The run named runName is created on the item's dataset if missing, else reused unchanged." +
      " Fails with not-found on v4 events-only deployments; read results with listExperimentItems there.",
    action: "datasets:CUD",
    annotations: { destructiveHint: false },
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
          rejectLegacyDatasetRunTools(context.projectId);
          const auth = await getMcpPublicApiAuth(context);
          return await createDatasetRunItemForApi({
            body: input,
            auth,
            auditScope: context,
          });
        },
      }),
  });
