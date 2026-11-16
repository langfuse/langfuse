import { listExperimentsForPublicApi } from "@/src/features/experiments/server/public/service";
import { GetExperimentsV1Response } from "@/src/features/public-api/types/experiments";
import { buildExperimentUrl } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  ListExperimentsBaseSchema,
  ListExperimentsInputSchema,
} from "../schema";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { scoreV3Refs } from "@/src/features/audit-logs/server/auditedQuery";

export const [listExperimentsTool, handleListExperiments] = defineTool({
  name: "listExperiments",
  description: [
    "List experiments in the current Langfuse project with cursor-based pagination.",
    "Use this to find experiment IDs, inspect experiment summaries, and optionally include metadata or experiment-level scores.",
    "Results are sorted newest first by the latest event for each experiment, not by the returned experiment startTime.",
    "fromStartTime is required. Time filters and cursor bounds are applied before experiments are grouped, so a time range can return partial experiment aggregates.",
  ].join("\n"),
  action: "experiments:read",
  accessAudit: { resourceType: "experiment", action: "list" },
  baseSchema: ListExperimentsBaseSchema,
  inputSchema: ListExperimentsInputSchema,
  handler: async (input, context, audit) =>
    runMcpTool({
      spanName: "mcp.experiments.list",
      context,
      attributes: {
        "mcp.pagination_limit": input.limit,
        "mcp.experiment_fields": input.fields.join(","),
      },
      fn: async (span) => {
        const dataAccessWindow = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: input.fromStartTime,
        });
        const result = await listExperimentsForPublicApi({
          projectId: context.projectId,
          query: {
            ...input,
            fromStartTime:
              dataAccessWindow.effectiveFromTimestamp?.toISOString() ??
              input.fromStartTime,
          },
        });
        const parsed = GetExperimentsV1Response.parse(result);

        span.setAttribute("mcp.result_count", parsed.data.length);
        audit.refs(
          scoreV3Refs(
            parsed.data.flatMap((experiment) => experiment.scores ?? []),
          ),
        );
        audit.count(parsed.data.length);

        return {
          ...parsed,
          data: parsed.data.map((experiment) => ({
            ...experiment,
            url: buildExperimentUrl({
              projectId: context.projectId,
              experimentId: experiment.id,
            }),
          })),
        };
      },
    }),
  readOnlyHint: true,
});
