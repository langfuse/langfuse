import {
  isoDateTime,
  InvalidRequestError,
  ObservationLevelDomain,
  ObservationTypeDomain,
  FTS_MATCH_OPERATOR,
} from "@langfuse/shared";
import {
  getObservationsV2FromEventsTableForPublicApi,
  buildObservationUrl,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  EncodedObservationsCursorV2,
  EncodedObservationsCursorV2String,
  encodeCursor,
} from "@/src/features/public-api/types/observations";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { observationRefs } from "@/src/features/audit-logs/server/auditedQuery";
import {
  ExpandMetadataKeysSchema,
  getMetadataExpansionForProjection,
  getProjectionFieldGroups,
  getProjectionFields,
  ObservationFieldsSchema,
  ObservationLimitSchema,
  projectObservation,
} from "../schema";
import {
  buildStartTimeFilters,
  ObservationMcpFilterBaseSchema,
  ObservationMcpFilterSchema,
} from "../filter-schema";

const ObservationCursorSchema =
  EncodedObservationsCursorV2String.optional().describe(
    "Cursor returned by a previous listObservations call",
  );

// Descriptions and errors ask agents for at most 14 days (336 hours), but
// validation accepts up to 15 days (360 hours). Agents often align
// fromStartTime to midnight while toStartTime stays at the current time or the
// end of the day, which overshoots 14 days by up to a day. The extra day absorbs
// that rounding. Advertising 15 days would move the overshoot past 15 instead.
const OBSERVATION_MAX_RANGE_MS = 15 * 24 * 60 * 60 * 1000;
const EXPENSIVE_OBSERVATION_MAX_IO_LIMIT = 50;

const OBSERVATION_FILTER_DESCRIPTION =
  "Advanced filters; type defaults to the first type getObservationFilterSchema lists for the column. Use key for metadata; numeric metadata comparisons need type numberObject.";

const ListObservationsBaseSchema = z.object({
  fields: ObservationFieldsSchema,
  expandMetadataKeys: ExpandMetadataKeysSchema,
  limit: ObservationLimitSchema,
  cursor: ObservationCursorSchema,
  type: ObservationTypeDomain.optional(),
  name: z.string().optional(),
  userId: z.string().optional(),
  level: ObservationLevelDomain.optional(),
  traceId: z.string().optional(),
  version: z.string().optional(),
  parentObservationId: z
    .string()
    .optional()
    .describe("Physical parent observation ID to match exactly."),
  isRootObservation: z
    .boolean()
    .optional()
    .describe(
      "Filter by logical root status. App-root observations can match true while retaining a non-null parentObservationId.",
    ),
  // TODO: Re-enable string[] once the public observations API correctly
  // applies allow-multiple environment filters instead of dropping arrays.
  // see: https://linear.app/langfuse/issue/LFE-9852/bug-observations-api-accepts-multiple-environment-params-but-ignores
  environment: z
    .string()
    .optional()
    .describe("A single environment; multiple are not supported yet."),
  fromStartTime: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone (Z or offset).",
  ),
  toStartTime: isoDateTime({ offset: true }).describe(
    "ISO 8601 with timezone, at most 336 hours after fromStartTime: for 14 full UTC days from 2026-10-01T00:00:00Z use 2026-10-15T00:00:00Z, not 2026-10-15T23:59:59Z.",
  ),
  filter: z
    .array(ObservationMcpFilterBaseSchema)
    .optional()
    .describe(OBSERVATION_FILTER_DESCRIPTION),
});

const ListObservationsInputSchema = ListObservationsBaseSchema.extend({
  filter: z
    .array(ObservationMcpFilterSchema)
    .optional()
    .describe(OBSERVATION_FILTER_DESCRIPTION),
});

type ListObservationsInput = z.infer<typeof ListObservationsInputSchema>;

const assertAllowedObservationRange = (input: ListObservationsInput) => {
  const rangeMs =
    new Date(input.toStartTime).getTime() -
    new Date(input.fromStartTime).getTime();
  if (rangeMs <= 0 || rangeMs > OBSERVATION_MAX_RANGE_MS) {
    throw new InvalidRequestError(
      "listObservations requires fromStartTime before toStartTime with a maximum range of 14 days (336 elapsed hours). For example, 2026-10-01T00:00:00Z to 2026-10-15T00:00:00Z is valid; 2026-10-15T23:59:59Z exceeds the limit. Split longer ranges into adjacent requests of at most 336 hours each.",
    );
  }
};

/**
 * Input/output projections are expensive, so their pages hold at most
 * EXPENSIVE_OBSERVATION_MAX_IO_LIMIT observations. A larger requested limit is
 * lowered rather than rejected; the cursor returns the remaining observations.
 */
const getEffectiveLimit = (
  requestedLimit: number,
  projectionFields: string[],
) => {
  const projectsIo = projectionFields.some(
    (field) => field === "input" || field === "output",
  );
  return projectsIo
    ? Math.min(requestedLimit, EXPENSIVE_OBSERVATION_MAX_IO_LIMIT)
    : requestedLimit;
};

export const [listObservationsTool, handleListObservations] = defineTool({
  name: "listObservations",
  description: [
    "Find and review observations (generations, spans, events, agent steps, tool calls). Traces consist of observations: to inspect a trace, pass traceId and page through its observations. For counts, sums, percentiles or time series use queryMetrics.",
    "Prefer structured filters (trace, name, type, level, environment) and narrow time ranges; search input/output/metadata content only when needed. Paginated with an opaque cursor.",
    'For metadata filters, first fetch fields: ["id", "metadata"] to discover keys, then use one in a stringObject filter, or a numberObject filter to compare as a number (e.g. {"type":"numberObject","column":"metadata","key":"retries","operator":">","value":3}).',
    "Start with the compact default fields, then use getObservation for full input/output of selected observations.",
    "Every request needs fromStartTime (inclusive) and toStartTime (exclusive) at most 336 elapsed hours (14 days) apart, even when scoped by traceId or id. Split longer ranges into adjacent windows (each toStartTime is the next fromStartTime); reuse timestamps from earlier results to narrow. Pages that project input or output hold at most 50 observations; a larger limit is lowered and the cursor returns the rest.",
  ].join("\n"),
  action: "traces:read",
  accessAudit: { resourceType: "observation", action: "list" },
  baseSchema: ListObservationsBaseSchema,
  inputSchema: ListObservationsInputSchema,
  handler: async (input, context, audit) => {
    const projectionFields = getProjectionFields(input.fields);
    const limit = getEffectiveLimit(input.limit, projectionFields);
    const filterColumns = new Set(input.filter?.map((filter) => filter.column));

    return await runMcpTool({
      spanName: "mcp.observations.list",
      context,
      attributes: {
        "mcp.requested_limit": input.limit,
        "mcp.applied_limit": limit,
        "mcp.filters_input": filterColumns.has("input"),
        "mcp.filters_output": filterColumns.has("output"),
        "mcp.filters_metadata": filterColumns.has("metadata"),
        "mcp.filters_observation_id": filterColumns.has("id"),
        "mcp.filters_trace_id":
          Boolean(input.traceId) || filterColumns.has("traceId"),
        "mcp.uses_full_text_search":
          input.filter?.some(
            (filter) => filter.operator === FTS_MATCH_OPERATOR,
          ) ?? false,
        "mcp.projects_input": projectionFields.includes("input"),
        "mcp.projects_output": projectionFields.includes("output"),
        "mcp.projects_metadata": projectionFields.includes("metadata"),
        "mcp.time_range_hours":
          (new Date(input.toStartTime).getTime() -
            new Date(input.fromStartTime).getTime()) /
          (60 * 60 * 1000),
      },
      fn: async () => {
        const fieldGroups = getProjectionFieldGroups(projectionFields);
        assertAllowedObservationRange(input);
        const dataAccessWindow = clampToDataAccessDays({
          plan: context.plan,
          fromTimestamp: input.fromStartTime,
        });
        const advancedFilters = dataAccessWindow.accessFloor
          ? [
              ...(input.filter ?? []),
              ...buildStartTimeFilters({
                fromStartTime: dataAccessWindow.effectiveFromTimestamp,
                toStartTime: input.toStartTime,
              }),
            ]
          : input.filter;

        const query = () =>
          getObservationsV2FromEventsTableForPublicApi(
            {
              projectId: context.projectId,
              page: 0,
              limit,
              traceId: input.traceId,
              userId: input.userId,
              level: input.level,
              name: input.name,
              type: input.type,
              environment: input.environment,
              parentObservationId: input.parentObservationId,
              isRootObservation: input.isRootObservation,
              fromStartTime:
                dataAccessWindow.effectiveFromTimestamp?.toISOString(),
              toStartTime: input.toStartTime,
              version: input.version,
              advancedFilters,
              cursor: input.cursor
                ? EncodedObservationsCursorV2.parse(input.cursor)
                : undefined,
              fields: fieldGroups,
              expandMetadataKeys: getMetadataExpansionForProjection(
                projectionFields,
                input.expandMetadataKeys,
              ),
            },
            {
              clickhouseSettings: MCP_CLICKHOUSE_SETTINGS,
            },
          );
        const items = await RateLimitService.getInstance().withMcpQueryCooldown(
          context.projectId,
          query,
        );

        const hasMore = items.length > limit;
        const dataToReturn = hasMore ? items.slice(0, limit) : items;
        audit.refs(observationRefs(dataToReturn));
        audit.count(dataToReturn.length);

        const data = dataToReturn.map((item) => {
          const projectedObservation = projectObservation(
            {
              ...item,
              parentObservationId:
                item.parentObservationId === ""
                  ? null
                  : item.parentObservationId,
            },
            projectionFields,
          );

          return {
            ...projectedObservation,
            ...(item.traceId
              ? {
                  url: buildObservationUrl({
                    projectId: context.projectId,
                    traceId: item.traceId,
                    observationId: item.id,
                  }),
                }
              : {}),
          };
        });

        const lastItem = dataToReturn[dataToReturn.length - 1];

        return {
          data,
          meta: {
            ...(hasMore && lastItem
              ? {
                  cursor: encodeCursor({
                    lastStartTimeTo: lastItem.startTime,
                    lastTraceId: lastItem.traceId ?? "",
                    lastId: lastItem.id,
                  }),
                }
              : {}),
            ...(limit < input.limit
              ? {
                  notice: `limit lowered from ${input.limit} to ${limit}: pages that project input or output hold at most ${EXPENSIVE_OBSERVATION_MAX_IO_LIMIT} observations. Use the cursor for the rest.`,
                }
              : {}),
          },
        };
      },
    });
  },
  readOnlyHint: true,
});
