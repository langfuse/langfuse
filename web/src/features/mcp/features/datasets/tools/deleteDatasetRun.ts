import { ApiError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addToDeleteDatasetQueue } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DeleteDatasetRunV1Response } from "@/src/features/public-api/types/datasets";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { DeleteDatasetRunMcpInput } from "../schema";

export const [deleteDatasetRunTool, handleDeleteDatasetRun] = defineTool({
  name: "deleteDatasetRun",
  description:
    "Delete a dataset run, one experiment or evaluation execution over a dataset, and enqueue deletion of its run items.",
  baseSchema: DeleteDatasetRunMcpInput,
  inputSchema: DeleteDatasetRunMcpInput,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.dataset_runs.delete",
      context,
      attributes: {
        "mcp.dataset_name": input.name,
        "mcp.dataset_run_name": input.runName,
      },
      fn: async () => {
        const datasetRuns = await prisma.datasetRuns.findMany({
          where: {
            projectId: context.projectId,
            name: input.runName,
            dataset: {
              name: input.name,
              projectId: context.projectId,
            },
          },
        });

        if (datasetRuns.length === 0) {
          throw new LangfuseNotFoundError("Dataset run not found");
        }
        if (datasetRuns.length > 1) {
          throw new ApiError(
            "Found more than one dataset run with this name and dataset",
          );
        }

        const datasetRun = datasetRuns[0];
        await prisma.datasetRuns.delete({
          where: {
            id_projectId: {
              projectId: context.projectId,
              id: datasetRun.id,
            },
          },
        });

        await auditLog({
          action: "delete",
          resourceType: "datasetRun",
          resourceId: datasetRun.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: datasetRun,
        });

        await addToDeleteDatasetQueue({
          deletionType: "dataset-runs",
          projectId: context.projectId,
          datasetRunIds: [datasetRun.id],
          datasetId: datasetRun.datasetId,
        });

        return DeleteDatasetRunV1Response.parse({
          message: "Dataset run successfully deleted",
        });
      },
    }),
  destructiveHint: true,
});
