import { SpanKind } from "@opentelemetry/api";
import {
  OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS,
  ObservationLevelDomain,
  ObservationTypeDomain,
  singleFilter,
} from "@langfuse/shared";
import {
  getObservationsV2FromEventsTableForPublicApi,
  instrumentAsync,
} from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  EncodedObservationsCursorV2,
  EncodedObservationsCursorV2String,
  encodeCursor,
} from "@/src/features/public-api/types/observations";
import { defineTool } from "../../../core/define-tool";
import {
  ExpandMetadataKeysSchema,
  getMetadataExpansionForProjection,
  getProjectionFieldGroups,
  getProjectionFields,
  ObservationFieldsSchema,
  ObservationLimitSchema,
  projectObservation,
} from "../schema";

const ObservationCursorSchema =
  EncodedObservationsCursorV2String.optional().describe(
    "Cursor returned by a previous listObservations call",
  );

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
  parentObservationId: z.string().optional(),
  environment: z.union([z.array(z.string()), z.string()]).optional(),
  fromStartTime: z.iso.datetime({ offset: true }).optional(),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  filter: z
    .array(singleFilter)
    .optional()
    .superRefine((filters, ctx) => {
      if (!filters) return;

      filters.forEach((filter, index) => {
        if (filter.column === "tags") return;
        if (filter.column !== "traceTags") {
          for (const allowedColumn of OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS) {
            if (allowedColumn === filter.column) return;
          }
        }

        ctx.addIssue({
          code: "custom",
          path: [index, "column"],
          message: `Invalid observation filter column "${filter.column}". Call getObservationFilterSchema for accepted columns.`,
        });
      });
    }),
});

export const [listObservationsTool, handleListObservations] = defineTool({
  name: "listObservations",
  description: [
    "Find and review observations in the current Langfuse project, such as generations, spans, events, agent steps, and tool calls.",
    "Use filters to narrow results by trace, name, type, level, environment, time range, or advanced filter conditions. Results are paginated with an opaque cursor.",
    "",
    'By default this returns compact summary fields. Use fields: ["*"] for the full observation, or pass specific field names to limit the response size.',
  ].join("\n"),
  baseSchema: ListObservationsBaseSchema,
  inputSchema: ListObservationsBaseSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.observations.list", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const projectionFields = getProjectionFields(input.fields);
        const fieldGroups = getProjectionFieldGroups(projectionFields);

        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.pagination_limit": input.limit,
          "mcp.projection_fields": projectionFields.join(","),
          "mcp.field_groups": fieldGroups.join(","),
        });

        const advancedFilters = input.filter?.map((filter) =>
          filter.column === "tags"
            ? { ...filter, column: "traceTags" }
            : filter,
        );

        const items = await getObservationsV2FromEventsTableForPublicApi({
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
          fromStartTime: input.fromStartTime,
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
        });

        const hasMore = items.length > input.limit;
        const dataToReturn = hasMore ? items.slice(0, input.limit) : items;

        const data = dataToReturn.map((item) =>
          projectObservation(
            {
              ...item,
              parentObservationId:
                item.parentObservationId === ""
                  ? null
                  : item.parentObservationId,
            },
            projectionFields,
          ),
        );

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
    );
  },
  readOnlyHint: true,
});
