import {
  isoDateTime,
  OBSERVATION_MCP_ALLOWED_EVENTS_TABLE_FILTER_COLUMNS,
  booleanFilter,
  coerceLegacyEmptyMetadataFilters,
  eventsTableCols,
  eventsTableSingleFilter,
  eventsTableStringFilter,
  eventsTableStringObjectFilter,
  filterOperators,
  FTS_MATCH_OPERATOR,
  numberFilter,
  singleFilter,
  stringFilter,
  stringObjectFilter,
  stringOptionsFilter,
  timeFilter,
  type ColumnDefinition,
} from "@langfuse/shared";
import { z } from "zod";
import {
  OBSERVATION_MCP_FTS_COLUMNS,
  OBSERVATION_MCP_INDEXED_IO_COLUMNS,
} from "./tools/getObservationFilterSchema";

const addIssues = (ctx: z.RefinementCtx, issues: z.core.$ZodIssue[]) => {
  for (const issue of issues) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
};

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
  string: (column: string, requireType = false) => {
    const filterSchema = OBSERVATION_MCP_INDEXED_IO_COLUMNS.has(column)
      ? eventsTableStringFilter.extend({
          operator: z.enum(["=", FTS_MATCH_OPERATOR]),
        })
      : stringFilter;

    return filterSchema.omit({ type: true, column: true }).extend({
      type: requireType ? z.literal("string") : z.literal("string").optional(),
      column: z.literal(column),
    });
  },
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
  stringObject: (column: string, requireType = false) => {
    const filterSchemaBase = OBSERVATION_MCP_FTS_COLUMNS.has(column)
      ? eventsTableStringObjectFilter
      : stringObjectFilter;

    return filterSchemaBase.omit({ type: true, column: true }).extend({
      type: requireType
        ? z.literal("stringObject")
        : z.literal("stringObject").optional(),
      column: z.literal(column),
    });
  },
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

export const ObservationMcpFilterBaseSchema = z
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

const normalizeExactObservationIdFilter = (filter: unknown) => {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    return filter;
  }

  const candidate = filter as Record<string, unknown>;
  if (
    candidate.column !== "id" ||
    candidate.operator !== "=" ||
    typeof candidate.value !== "string" ||
    (candidate.type !== undefined && candidate.type !== "string")
  ) {
    return filter;
  }

  return {
    ...candidate,
    type: "stringOptions",
    operator: "any of",
    value: [candidate.value],
  };
};

export const ObservationMcpFilterSchema = z.preprocess(
  normalizeExactObservationIdFilter,
  z
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
        addIssues(ctx, filterParseResult.error.issues);
      }
    })
    .transform((filter) => {
      const type =
        filter.type ?? OBSERVATION_MCP_FILTER_COLUMN_TYPES.get(filter.column);

      const reshaped =
        filter.column === "tags"
          ? { ...filter, type, column: "traceTags" }
          : { ...filter, type };
      // Legacy `contains ""` presence spelling → `is set` before validation.
      const [coerced] = coerceLegacyEmptyMetadataFilters([
        reshaped,
      ]) as unknown[];

      return eventsTableSingleFilter.parse(coerced);
    }),
);

/**
 * Observation filter restricted to the generic filter contract that batch
 * action queries carry, which excludes the events-only full-text operator.
 */
export const ObservationMcpBatchQueryFilterSchema =
  ObservationMcpFilterSchema.transform((filter, ctx) => {
    const parsed = singleFilter.safeParse(filter);
    if (parsed.success) return parsed.data;
    addIssues(ctx, parsed.error.issues);
    return z.NEVER;
  });

export const OptionalStartTimeRangeShape = {
  fromStartTime: isoDateTime({ offset: true })
    .optional()
    .describe(
      "Optional inclusive lower bound on observation startTime, as an ISO 8601 timestamp with timezone (Z or an explicit offset). Use the same time window as the observations you intend to search.",
    ),
  toStartTime: isoDateTime({ offset: true })
    .optional()
    .describe(
      "Optional exclusive upper bound on observation startTime, as an ISO 8601 timestamp with timezone. For a full calendar day, use midnight at the start of the next day, not 23:59:59.",
    ),
};

export const buildStartTimeFilters = (params: {
  fromStartTime?: string | Date;
  toStartTime?: string | Date;
}): z.infer<typeof timeFilter>[] => [
  ...(params.fromStartTime
    ? [
        {
          column: "startTime",
          operator: ">=" as const,
          value: new Date(params.fromStartTime),
          type: "datetime" as const,
        },
      ]
    : []),
  ...(params.toStartTime
    ? [
        {
          column: "startTime",
          operator: "<" as const,
          value: new Date(params.toStartTime),
          type: "datetime" as const,
        },
      ]
    : []),
];
