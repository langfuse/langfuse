import { listExperimentItemsForPublicApi } from "@/src/features/experiments/server/public/service";
import { GetExperimentItemsV1Response } from "@/src/features/public-api/types/experiments";
import { buildObservationUrl } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  ListExperimentItemsBaseSchema,
  ListExperimentItemsInputSchema,
} from "../schema";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  observationRefs,
  scoreV3Refs,
} from "@/src/features/audit-logs/server/auditedQuery";

export const [listExperimentItemsTool, handleListExperimentItems] = defineTool({
  name: "listExperimentItems",
  description: [
    "List experiment items in the current Langfuse project with cursor-based pagination.",
    "Use this to inspect experiment item inputs, outputs, expected outputs, metadata, and optionally item or trace scores.",
    "Results are sorted newest first by experiment item startTime.",
    "fromStartTime is required. Request io and metadata fields only when needed because they can be large.",
  ].join("\n"),
  action: "experiments:read",
  accessAudit: { resourceType: "experiment", action: "list" },
  baseSchema: ListExperimentItemsBaseSchema,
  inputSchema: ListExperimentItemsInputSchema,
  handler: async (input, context, audit) =>
    runMcpTool({
      spanName: "mcp.experiment_items.list",
      context,
      attributes: {
        "mcp.pagination_limit": input.limit,
        "mcp.experiment_item_fields": input.fields.join(","),
      },
      fn: async (span) => {
        const dataAccessWindow = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: input.fromStartTime,
        });
        const result = await listExperimentItemsForPublicApi({
          projectId: context.projectId,
          query: {
            ...input,
            fromStartTime:
              dataAccessWindow.effectiveFromTimestamp?.toISOString() ??
              input.fromStartTime,
          },
        });
        const parsed = GetExperimentItemsV1Response.parse(result);

        span.setAttribute("mcp.result_count", parsed.data.length);
        audit.refs(observationRefs(parsed.data));
        audit.refs(
          scoreV3Refs(parsed.data.flatMap((item) => item.scores ?? [])),
        );
        audit.count(parsed.data.length);

        return {
          ...parsed,
          data: parsed.data.map((item) => ({
            ...item,
            url: buildObservationUrl({
              projectId: context.projectId,
              traceId: item.traceId,
              observationId: item.id,
            }),
          })),
        };
      },
    }),
  readOnlyHint: true,
});
