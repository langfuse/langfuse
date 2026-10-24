import {
  isoDateTime,
  InvalidRequestError,
  ObservationLevelDomain,
  ObservationTypeDomain,
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
} from "@/src/features/public-api/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { MCP_CLICKHOUSE_SETTINGS } from "../../../core/clickhouse-settings";
import { clampToDataAccessDays } from "@/src/features/entitlements/server";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
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

const OBSERVATION_MAX_RANGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const EXPENSIVE_OBSERVATION_MAX_IO_LIMIT = 50;

const OBSERVATION_FILTER_DESCRIPTION =
  "Advanced filters. Each item must be an object with column, operator, value, optional type, and optional key. Type is inferred from getObservationFilterSchema columns when omitted. Use key for metadata filters.";

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
    .describe(
      "Environment to filter by. Multiple environments are temporarily unsupported until the public observations API applies allow-multiple environment filters correctly.",
    ),
  fromStartTime: isoDateTime({ offset: true }).describe(
    "Required inclusive lower bound on observation startTime, as an ISO 8601 timestamp with timezone (Z or an explicit offset). Must be before toStartTime; the elapsed duration must not exceed 14 days (336 hours).",
  ),
  toStartTime: isoDateTime({ offset: true }).describe(
    "Required exclusive upper bound on observation startTime, as an ISO 8601 timestamp with timezone. Must be after fromStartTime and at most 336 hours later. For 14 full UTC calendar days starting 2026-10-01T00:00:00Z, use 2026-10-15T00:00:00Z, not 2026-10-15T23:59:59Z. Split longer ranges into adjacent requests of at most 336 hours each.",
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

const assertAllowedObservationAccess = (
  input: ListObservationsInput,
  projectionFields: string[],
) => {
  const rangeMs =
    new Date(input.toStartTime).getTime() -
    new Date(input.fromStartTime).getTime();
  if (rangeMs <= 0 || rangeMs > OBSERVATION_MAX_RANGE_MS) {
    throw new InvalidRequestError(
      "listObservations requires fromStartTime before toStartTime with a maximum range of 14 days (336 elapsed hours). For example, 2026-10-01T00:00:00Z to 2026-10-15T00:00:00Z is valid; 2026-10-15T23:59:59Z exceeds the limit. Split longer ranges into adjacent requests of at most 336 hours each.",
    );
  }

  const projectsIo = projectionFields.some(
    (field) => field === "input" || field === "output",
  );
  if (projectsIo && input.limit > EXPENSIVE_OBSERVATION_MAX_IO_LIMIT) {
    throw new InvalidRequestError(
      `Projecting observation input or output by date supports a maximum limit of ${EXPENSIVE_OBSERVATION_MAX_IO_LIMIT}.`,
    );
  }
};

export const [listObservationsTool, handleListObservations] = defineTool({
  name: "listObservations",
  description: [
    "Find and review observations in the current Langfuse project, such as generations, spans, events, agent steps, and tool calls.",
    "Traces consist of observations. Use this tool when the user asks to inspect traces: pass traceId to page through the observations for a specific trace; those observation records are the trace data returned by the API.",
    "Prefer structured filters such as trace, name, type, level, and environment, combined with narrow time ranges. Use input/output/metadata content search only when matching that content is necessary to answer the user's question. Results are paginated with an opaque cursor.",
    'For metadata filters, first inspect metadata by passing both fromStartTime and toStartTime with a maximum range of 14 days (336 elapsed hours) and fields: ["id", "metadata"]. Then use a discovered key in a stringObject filter.',
    "",
    'Start with the default compact summary fields, then use getObservation to fetch full input/output only for selected observations that need closer inspection. Pass specific field names to limit the response size; fields: ["*"] returns the full observation.',
    'Important: if you request metadata explicitly, for example fields: ["id", "metadata"], metadata values are truncated to 200 UTF-8 characters per key unless you also pass expandMetadataKeys with the keys that may need full values.',
    "All requests must include explicit fromStartTime (inclusive) and toStartTime (exclusive) with 0 < toStartTime - fromStartTime <= 336 hours (14 days), even when scoped by traceId or observation id. This is elapsed time, not a count of calendar dates. For example, 2026-10-01T00:00:00Z to 2026-10-15T00:00:00Z is valid; ending at 2026-10-15T23:59:59Z exceeds the limit. Split longer ranges into adjacent windows, using each window's toStartTime as the next window's fromStartTime. Reuse timestamps from earlier results to narrow the search. Input/output projections support a maximum limit of 50.",
  ].join("\n"),
  action: "traces:read",
  baseSchema: ListObservationsBaseSchema,
  inputSchema: ListObservationsInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.observations.list",
      context,
      attributes: {
        "mcp.pagination_limit": input.limit,
      },
      fn: async (span) => {
        const projectionFields = getProjectionFields(input.fields);
        const fieldGroups = getProjectionFieldGroups(projectionFields);
        assertAllowedObservationAccess(input, projectionFields);
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

        span.setAttributes({
          "mcp.projection_fields": projectionFields.join(","),
          "mcp.field_groups": fieldGroups.join(","),
        });

        const query = () =>
          getObservationsV2FromEventsTableForPublicApi(
            {
              projectId: context.projectId,
              page: 0,
              limit: input.limit,
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

        const hasMore = items.length > input.limit;
        const dataToReturn = hasMore ? items.slice(0, input.limit) : items;

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
          meta:
            hasMore && lastItem
              ? {
                  cursor: encodeCursor({
                    lastStartTimeTo: lastItem.startTime,
                    lastTraceId: lastItem.traceId ?? "",
                    lastId: lastItem.id,
                  }),
                }
              : {},
        };
      },
    });
  },
  readOnlyHint: true,
});
