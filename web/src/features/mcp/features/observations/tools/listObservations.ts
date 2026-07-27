import {
  InvalidRequestError,
  OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS,
  booleanFilter,
  eventsTableCols,
  filterOperators,
  numberFilter,
  ObservationLevelDomain,
  ObservationTypeDomain,
  singleFilter,
  stringFilter,
  stringObjectFilter,
  stringOptionsFilter,
  timeFilter,
  type ColumnDefinition,
} from "@langfuse/shared";
import { getObservationsV2FromEventsTableForPublicApi } from "@langfuse/shared/src/server";
import { z } from "zod";
import {
  EncodedObservationsCursorV2,
  EncodedObservationsCursorV2String,
  encodeCursor,
} from "@/src/features/public-api/types/observations";
import { defineTool } from "../../../core/define-tool";
import { buildObservationUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";
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

const EXPENSIVE_OBSERVATION_ACCESS_COLUMNS = new Set([
  "input",
  "output",
  "metadata",
]);

const OBSERVATION_MCP_FILTER_COLUMN_TYPES = new Map(
  eventsTableCols
    .filter((column) =>
      OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS.has(column.id),
    )
    .map((column) => [
      column.id === "traceTags" ? "tags" : column.id,
      column.type,
    ]),
);

const OBSERVATION_MCP_FILTER_EXAMPLE = {
  column: "totalCost",
  operator: ">",
  value: 0.0029,
} satisfies Omit<z.infer<typeof numberFilter>, "type">;

const OBSERVATION_MCP_FILTER_EXAMPLE_WITH_TYPE = {
  type: "number",
  ...OBSERVATION_MCP_FILTER_EXAMPLE,
} satisfies z.infer<typeof numberFilter>;

const OBSERVATION_MCP_FILTER_EXAMPLE_JSON = JSON.stringify(
  OBSERVATION_MCP_FILTER_EXAMPLE,
);

const OBSERVATION_MCP_FILTER_EXAMPLE_WITH_TYPE_JSON = JSON.stringify(
  OBSERVATION_MCP_FILTER_EXAMPLE_WITH_TYPE,
);

const OBSERVATION_MCP_FILTER_SCHEMA_BY_TYPE = {
  datetime: (column: string, requireType = false) =>
    timeFilter.omit({ type: true, column: true }).extend({
      type: requireType
        ? z.literal("datetime")
        : z.literal("datetime").optional(),
      column: z.literal(column),
    }),
  string: (column: string, requireType = false) =>
    stringFilter.omit({ type: true, column: true }).extend({
      type: requireType ? z.literal("string") : z.literal("string").optional(),
      column: z.literal(column),
    }),
  stringOptions: (column: string, requireType = false) =>
    stringOptionsFilter.omit({ type: true, column: true }).extend({
      type: requireType
        ? z.literal("stringOptions")
        : z.literal("stringOptions").optional(),
      column: z.literal(column),
    }),
  arrayOptions: (column: string, requireType = false) =>
    z.object({
      operator: z.enum(filterOperators.arrayOptions),
      value: z.array(z.string()),
      type: requireType
        ? z.literal("arrayOptions")
        : z.literal("arrayOptions").optional(),
      column: z.literal(column),
    }),
  number: (column: string, requireType = false) =>
    numberFilter.omit({ type: true, column: true }).extend({
      type: requireType ? z.literal("number") : z.literal("number").optional(),
      column: z.literal(column),
    }),
  stringObject: (column: string, requireType = false) =>
    stringObjectFilter.omit({ type: true, column: true }).extend({
      type: requireType
        ? z.literal("stringObject")
        : z.literal("stringObject").optional(),
      column: z.literal(column),
    }),
  boolean: (column: string, requireType = false) =>
    booleanFilter.omit({ type: true, column: true }).extend({
      type: requireType
        ? z.literal("boolean")
        : z.literal("boolean").optional(),
      column: z.literal(column),
    }),
} satisfies Partial<
  Record<
    ColumnDefinition["type"],
    (column: string, requireType?: boolean) => z.ZodType
  >
>;

type ObservationMcpFilterType =
  keyof typeof OBSERVATION_MCP_FILTER_SCHEMA_BY_TYPE;

const isObservationMcpFilterType = (
  type: string,
): type is ObservationMcpFilterType =>
  type in OBSERVATION_MCP_FILTER_SCHEMA_BY_TYPE;

const ObservationMcpFilterBaseSchema = z
  .object({
    column: z.string(),
    operator: z.string(),
    value: z.any(),
    type: z.string().optional(),
    key: z
      .string()
      .optional()
      .describe(
        "Metadata/object key to filter on. Required when column is metadata.",
      ),
  })
  .describe(
    `Advanced observation filter object. Example: ${OBSERVATION_MCP_FILTER_EXAMPLE_JSON}. The explicit form ${OBSERVATION_MCP_FILTER_EXAMPLE_WITH_TYPE_JSON} is also accepted.`,
  );

const ObservationMcpFilterSchema = z
  .object({ column: z.string() })
  .loose()
  .superRefine((filter, ctx) => {
    if (!OBSERVATION_MCP_FILTER_COLUMN_TYPES.has(filter.column)) {
      ctx.addIssue({
        code: "custom",
        path: ["column"],
        message: `Invalid observation filter column "${filter.column}". Call getObservationFilterSchema for accepted columns.`,
      });
      return;
    }

    const type = OBSERVATION_MCP_FILTER_COLUMN_TYPES.get(filter.column);

    if (!type || !isObservationMcpFilterType(type)) {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: `Invalid observation filter type "${String(type)}" for column "${filter.column}".`,
      });
      return;
    }

    const filterParseResult = OBSERVATION_MCP_FILTER_SCHEMA_BY_TYPE[type](
      filter.column,
      Boolean(filter.type),
    ).safeParse(filter);

    if (!filterParseResult.success) {
      for (const issue of filterParseResult.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  })
  .transform((filter) => {
    const type =
      filter.type ?? OBSERVATION_MCP_FILTER_COLUMN_TYPES.get(filter.column);

    return singleFilter.parse(
      filter.column === "tags"
        ? { ...filter, type, column: "traceTags" }
        : { ...filter, type },
    );
  });

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
  // TODO: Re-enable string[] once the public observations API correctly
  // applies allow-multiple environment filters instead of dropping arrays.
  // see: https://linear.app/langfuse/issue/LFE-9852/bug-observations-api-accepts-multiple-environment-params-but-ignores
  environment: z
    .string()
    .optional()
    .describe(
      "Environment to filter by. Multiple environments are temporarily unsupported until the public observations API applies allow-multiple environment filters correctly.",
    ),
  fromStartTime: z.iso.datetime({ offset: true }).optional(),
  toStartTime: z.iso.datetime({ offset: true }).optional(),
  filter: z
    .array(ObservationMcpFilterBaseSchema)
    .optional()
    .describe(
      "Advanced filters. Each item must be an object with column, operator, value, optional type, and optional key. Type is inferred from getObservationFilterSchema columns when omitted. Use key for metadata filters.",
    ),
});

const ListObservationsInputSchema = ListObservationsBaseSchema.extend({
  filter: z
    .array(ObservationMcpFilterSchema)
    .optional()
    .describe(
      "Advanced filters. Each item must be an object with column, operator, value, optional type, and optional key. Type is inferred from getObservationFilterSchema columns when omitted. Use key for metadata filters.",
    ),
});

type ListObservationsInput = z.infer<typeof ListObservationsInputSchema>;

const hasObservationIdFilter = (filters: ListObservationsInput["filter"]) =>
  filters?.some(
    (filter) =>
      filter.column === "id" &&
      filter.type === "stringOptions" &&
      filter.operator === "any of" &&
      filter.value.length > 0,
  ) ?? false;

const hasValidStartTimeBound = (input: ListObservationsInput) => {
  if (!input.fromStartTime || !input.toStartTime) return false;
  return (
    new Date(input.fromStartTime).getTime() <
    new Date(input.toStartTime).getTime()
  );
};

// Initially, we return io/metadata in full only if some limits are set
const assertAllowedExpensiveObservationAccess = (
  input: ListObservationsInput,
  projectionFields: string[],
) => {
  const expensiveColumns = new Set<string>();

  for (const field of projectionFields) {
    if (EXPENSIVE_OBSERVATION_ACCESS_COLUMNS.has(field)) {
      expensiveColumns.add(field);
    }
  }

  for (const filter of input.filter ?? []) {
    if (EXPENSIVE_OBSERVATION_ACCESS_COLUMNS.has(filter.column)) {
      expensiveColumns.add(filter.column);
    }
  }

  if (expensiveColumns.size === 0) return;

  const hasSelectiveScope =
    Boolean(input.traceId) ||
    hasObservationIdFilter(input.filter) ||
    hasValidStartTimeBound(input);

  if (hasSelectiveScope) return;

  throw new InvalidRequestError(
    `Accessing observation ${Array.from(expensiveColumns)
      .sort()
      .join(
        ", ",
      )} requires traceId, an id filter, or both fromStartTime and toStartTime.`,
  );
};

export const [listObservationsTool, handleListObservations] = defineTool({
  name: "listObservations",
  description: [
    "Find and review observations in the current Langfuse project, such as generations, spans, events, agent steps, and tool calls.",
    "Traces consist of observations. Use this tool when the user asks to inspect traces: pass traceId to page through the observations for a specific trace; those observation records are the trace data returned by the API.",
    "Use filters to narrow results by trace, name, type, level, environment, time range, or advanced filter conditions. Results are paginated with an opaque cursor.",
    "For metadata filters, first call getObservationFilterMetadataKeys with observationIds, traceId, or a bounded time range, then set the relevant key field in the filter.",
    "",
    'By default this returns compact summary fields. Use fields: ["*"] for the full observation, or pass specific field names to limit the response size.',
    'Important: if you request metadata explicitly, for example fields: ["id", "metadata"], metadata values are truncated to 200 UTF-8 characters per key unless you also pass expandMetadataKeys with the keys that may need full values.',
    "Requests that project or filter input, output, or metadata must include traceId, an id filter, or both fromStartTime and toStartTime.",
  ].join("\n"),
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
        assertAllowedExpensiveObservationAccess(input, projectionFields);

        span.setAttributes({
          "mcp.projection_fields": projectionFields.join(","),
          "mcp.field_groups": fieldGroups.join(","),
        });

        const items = await getObservationsV2FromEventsTableForPublicApi(
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
            fromStartTime: input.fromStartTime,
            toStartTime: input.toStartTime,
            version: input.version,
            advancedFilters: input.filter,
            cursor: input.cursor
              ? EncodedObservationsCursorV2.parse(input.cursor)
              : undefined,
            fields: fieldGroups,
            expandMetadataKeys: getMetadataExpansionForProjection(
              projectionFields,
              input.expandMetadataKeys,
            ),
          },
          // MCP keeps the legacy observation filter contract. Its separate
          // selective-scope guard above limits expensive input/output filters.
          { allowUnindexedIoFilters: true },
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
