import { prisma } from "../../db";
import { Observation, ObservationType } from "../../domain";
import { env } from "../../env";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import {
  convertDateToClickhouseDateTime,
  PreferredClickhouseService,
} from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { recordDistribution } from "../instrumentation";
import { logger } from "../logger";
import {
  DateTimeFilter,
  FilterList,
  FullObservations,
  orderByToClickhouseSql,
  createPublicApiObservationsColumnMapping,
  deriveFilters,
  type ApiColumnMapping,
  ObservationPriceFields,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import type { FilterState } from "../../types";
import {
  eventsScoresAggregation,
  eventsTracesAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import {
  eventsTableLegacyTraceUiColumnDefinitions,
  eventsTableUiColumnDefinitions,
} from "../tableMappings/mapEventsTable";
import { DEFAULT_RENDERING_PROPS, RenderingProps } from "../utils/rendering";
import { queryClickhouse } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import {
  ObservationsTableQueryResult,
  ObservationTableQuery,
} from "./observations";
import { convertObservation } from "./observations_converters";

type ObservationsTableQueryResultWitouhtTraceFields = Omit<
  ObservationsTableQueryResult,
  "trace_tags" | "trace_name" | "trace_user_id"
>;

/**
 * Field mapping: each field defined once with its full SELECT expression
 * All queries use `FROM events e` with alias, so all fields use `e.` prefix
 */
const EVENTS_FIELDS = {
  // Aggregates
  count: "count(*) as count",

  // Identity & basic fields
  id: "e.span_id as id",
  traceId: 'e.trace_id as "trace_id"',
  projectId: 'e.project_id as "project_id"',
  environment: 'e.environment as "environment"',
  type: "e.type as type",
  parentObservationId: 'e.parent_span_id as "parent_observation_id"',
  name: "e.name as name",
  level: "e.level as level",
  statusMessage: 'e.status_message as "status_message"',
  version: "e.version as version",

  // Time fields
  startTime: 'e.start_time as "start_time"',
  endTime: 'e.end_time as "end_time"',
  completionStartTime: 'e.completion_start_time as "completion_start_time"',
  createdAt: 'e.created_at as "created_at"',
  updatedAt: 'e.updated_at as "updated_at"',
  eventTs: "e.event_ts",

  // Model fields
  providedModelName: 'e.provided_model_name as "provided_model_name"',
  internalModelId: 'e.model_id as "internal_model_id"',
  modelParameters: 'e."model_parameters" as model_parameters',

  // Usage & cost fields
  providedUsageDetails: 'e.provided_usage_details as "provided_usage_details"',
  usageDetails: 'e.usage_details as "usage_details"',
  providedCostDetails: 'e.provided_cost_details as "provided_cost_details"',
  costDetails: 'e.cost_details as "cost_details"',
  totalCost: 'e.total_cost as "total_cost"',

  // Prompt fields
  promptId: 'e.prompt_id as "prompt_id"',
  promptName: 'e.prompt_name as "prompt_name"',
  promptVersion: 'e.prompt_version as "prompt_version"',

  // I/O & metadata fields
  input: "e.input",
  output: "e.output",
  metadata: "e.metadata",

  // Calculated fields
  latency:
    "if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency",
  timeToFirstToken:
    "if(isNull(completion_start_time), NULL, date_diff('millisecond', start_time, completion_start_time)) as \"time_to_first_token\"",
} as const;

/**
 * Predefined field sets for common query patterns
 * Maps set names to arrays of field keys from EVENTS_FIELDS
 */
const FIELD_SETS = {
  // Aggregates
  count: ["count"],

  // List query field sets (for getObservationsWithModelDataFromEventsTable)
  base: [
    "id",
    "type",
    "projectId",
    "name",
    "modelParameters",
    "startTime",
    "endTime",
    "traceId",
    "completionStartTime",
    "providedUsageDetails",
    "usageDetails",
    "providedCostDetails",
    "costDetails",
    "level",
    "environment",
    "statusMessage",
    "version",
    "parentObservationId",
    "createdAt",
    "updatedAt",
    "providedModelName",
    "totalCost",
    "promptId",
    "promptName",
    "promptVersion",
    "internalModelId",
  ],
  calculated: ["latency", "timeToFirstToken"],
  io: ["input", "output"],
  metadata: ["metadata"],
  eventTs: ["eventTs"],

  // getById field sets (reuse the same fields - all queries use `FROM events e`)
  byIdBase: [
    "id",
    "traceId",
    "projectId",
    "environment",
    "type",
    "parentObservationId",
    "startTime",
    "endTime",
    "name",
    "metadata",
    "level",
    "statusMessage",
    "version",
  ],
  byIdModel: [
    "providedModelName",
    "internalModelId",
    "modelParameters",
    "providedUsageDetails",
    "usageDetails",
    "providedCostDetails",
    "costDetails",
    "totalCost",
    "completionStartTime",
  ],
  byIdPrompt: ["promptId", "promptName", "promptVersion"],
  byIdTimestamps: ["createdAt", "updatedAt", "eventTs"],
} as const;

/**
 * Special symbol to explicitly opt-out of automatic project_id filtering
 *
 * @example
 * // Use when you need to query across all projects (use with caution!)
 * const builder = new EventsQueryBuilder({ projectId: NoProjectId });
 */
export const NoProjectId = Symbol("NoProjectId");
export type NoProjectIdType = typeof NoProjectId;

/**
 * EventsQueryBuilder - A fluent query builder for events table queries
 *
 * When project_id is provided in the constructor it is automatically
 * added to the WHERE clause during build().
 *
 * @example
 * // Standard usage with automatic project_id filtering
 * const builder = new EventsQueryBuilder({ projectId: "my-project-id" })
 *   .selectFieldSet("base", "calculated")
 *   .selectIO(true, 1000)
 *   .whereRaw("span_id = {id: String}", { id: "abc123" })
 *   .orderBy("ORDER BY start_time DESC")
 *   .limit(100, 0);
 *
 * const { query, params } = builder.buildWithParams();
 */
class EventsQueryBuilder {
  private selectFields: Set<string> = new Set();
  private ioFields: { truncated: boolean; charLimit?: number } | null = null;
  private ctes: string[] = [];
  private joins: string[] = [];
  private whereClauses: string[] = [];
  private orderByClause: string = "";
  private limitClause: string = "";
  private params: Record<string, any> = {};
  private projectId: string | NoProjectIdType;

  /**
   * Constructor
   * @param options.projectId - Project ID to automatically filter by, or NoProjectId to opt-out
   *
   * @example
   * // Explicit opt-out (use sparingly!)
   * const builder = new EventsQueryBuilder({ projectId: NoProjectId })
   *   .selectFieldSet("base")
   *   .whereRaw("span_id = {id: String}", { id: "abc123" });
   * // No project_id filter will be added
   */
  constructor(options: { projectId: string | NoProjectIdType }) {
    this.projectId = options.projectId;
  }

  /**
   * Add SELECT fields from predefined field sets
   */
  selectFieldSet(...setNames: Array<keyof typeof FIELD_SETS>): this {
    setNames
      .flatMap((s) => {
        return FIELD_SETS[s];
      })
      .forEach((s) => {
        this.selectFields.add(s);
      });
    return this;
  }

  /**
   * Add IO fields with optional truncation
   */
  selectIO(truncated: boolean = false, charLimit?: number): this {
    this.ioFields = { truncated, charLimit };
    return this;
  }

  /**
   * Conditionally apply builder operations
   */
  when<T extends EventsQueryBuilder>(
    this: T,
    condition: boolean,
    // eslint-disable-next-line no-unused-vars
    fn: (builder: T) => T,
  ): T {
    return condition ? fn(this) : this;
  }

  /**
   * Add a CTE (WITH clause) and track its parameters
   */
  withCTE(
    name: string,
    // eslint-disable-next-line no-unused-vars
    generator: (params: {
      projectId: string;
      startTimeFrom: string | null;
    }) => string,
    options?: {
      projectId?: string;
      startTimeFrom?: string | null;
    },
  ): this {
    const params = {
      projectId: options?.projectId ?? "",
      startTimeFrom: options?.startTimeFrom ?? null,
    };

    if (generator && Boolean(options)) {
      this.ctes.push(`${name} AS (${generator(params)})`);

      // Track CTE parameters
      if (params.projectId) {
        this.params.projectId = params.projectId;
      }
      if (params.startTimeFrom) {
        this.params.startTimeFrom = params.startTimeFrom;
      }
    }

    return this;
  }

  /**
   * Add a LEFT JOIN
   */
  leftJoin(table: string, onClause: string): this {
    this.joins.push(`LEFT JOIN ${table} ${onClause}`);
    return this;
  }

  /**
   * Add WHERE conditions from FilterList
   * Accepts the output from FilterList.apply() or clickhouseSearchCondition()
   */
  where(condition: { query: string; params?: Record<string, any> }): this {
    if (condition.query.trim()) {
      // Strip leading AND/OR if present (e.g., from clickhouseSearchCondition)
      const trimmedQuery = condition.query.trim().replace(/^(AND|OR)\s+/i, "");
      this.whereClauses.push(`(${trimmedQuery})`);
    }
    // Merge parameters from FilterCondition
    if (condition.params) {
      this.params = { ...this.params, ...condition.params };
    }
    return this;
  }

  /**
   * Add raw WHERE condition with optional parameters
   * Use ClickHouse parameter syntax: {paramName: Type}
   *
   * Example:
   *   .whereRaw("span_id = {id: String}", { id: "abc123" })
   */
  whereRaw(condition: string, params?: Record<string, any>): this {
    if (condition.trim()) {
      this.whereClauses.push(condition);
    }
    // Merge provided parameters
    if (params) {
      this.params = { ...this.params, ...params };
    }
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(clause: string): this {
    if (clause.trim()) {
      this.orderByClause = clause;
    }
    return this;
  }

  /**
   * Add LIMIT and OFFSET
   *
   * @param limit - Maximum number of rows to return
   * @param offset - Number of rows to skip
   *
   * Examples:
   *   .limit(100, 0) - Parameterized: "LIMIT {limit: Int32} OFFSET {offset: Int32}"
   */
  limit(limit?: number, offset?: number): this {
    if (limit !== undefined && offset !== undefined) {
      this.limitClause = "LIMIT {limit: Int32} OFFSET {offset: Int32}";
      if (limit !== undefined) this.params.limit = limit;
      if (offset !== undefined) this.params.offset = offset;
    } else {
      this.limitClause = "LIMIT 1000";
    }
    return this;
  }

  /**
   * Build the final query string
   */
  private build(): string {
    const parts: string[] = [];

    // CTEs (WITH clause)
    if (this.ctes.length > 0) {
      parts.push(`WITH ${this.ctes.join(",\n")}`);
    }

    // Build field expressions from field keys
    // If ioFields are configured, exclude regular input/output from selectFields
    const fieldsToProcess = this.ioFields
      ? [...this.selectFields].filter((f) => f !== "input" && f !== "output")
      : [...this.selectFields];

    const fieldExpressions: string[] = fieldsToProcess.flatMap((fieldKey) => {
      const fieldExpr = EVENTS_FIELDS[fieldKey as keyof typeof EVENTS_FIELDS];
      return fieldExpr ? [fieldExpr] : [];
    });

    // Add I/O fields if configured
    if (this.ioFields) {
      if (this.ioFields.truncated && this.ioFields.charLimit !== undefined) {
        fieldExpressions.push(
          `leftUTF8(input, ${this.ioFields.charLimit}) as input, leftUTF8(output, ${this.ioFields.charLimit}) as output`,
        );
      } else {
        fieldExpressions.push("input, output");
      }
    }

    // SELECT
    parts.push(`SELECT\n  ${fieldExpressions.join(",\n  ")}`);

    // FROM
    parts.push("FROM events e");

    // JOINs
    if (this.joins.length > 0) {
      parts.push(this.joins.join("\n"));
    }

    // WHERE
    const allWhereClauses = [...this.whereClauses];

    // Automatically add project_id filter if projectId is provided
    if (this.projectId !== NoProjectId) {
      allWhereClauses.unshift("e.project_id = {projectId: String}");
      this.params.projectId = this.projectId;
    }

    if (allWhereClauses.length > 0) {
      const whereExpression = allWhereClauses.join("\n        AND ");
      parts.push(`WHERE ${whereExpression}`);
    }

    // ORDER BY
    if (this.orderByClause) {
      parts.push(this.orderByClause);
    }

    // LIMIT/OFFSET
    if (this.limitClause) {
      parts.push(this.limitClause);
    }

    return parts.join("\n");
  }

  /**
   * Build the final query string along with accumulated parameters
   *
   * Returns both the query and all parameters that have been accumulated
   * from FilterConditions, raw conditions, CTEs, and limit/offset.
   *
   * Example:
   *   const { query, params } = queryBuilder.buildWithParams();
   *   await queryClickhouse({ query, params });
   */
  buildWithParams(): { query: string; params: Record<string, any> } {
    return {
      query: this.build(),
      params: this.params,
    };
  }
}

/**
 * Internal helper: enrich observations with model pricing data
 */
const enrichObservationsWithModelData = async (
  observationRecords: Array<ObservationsTableQueryResultWitouhtTraceFields>,
  projectId: string,
): Promise<Array<Observation & ObservationPriceFields>> => {
  const uniqueModels: string[] = Array.from(
    new Set(
      observationRecords
        .map((r) => r.internal_model_id)
        .filter((r): r is string => Boolean(r)),
    ),
  );

  const models =
    uniqueModels.length > 0
      ? await prisma.model.findMany({
          where: {
            id: {
              in: uniqueModels,
            },
            OR: [{ projectId: projectId }, { projectId: null }],
          },
          include: {
            Price: true,
          },
        })
      : [];

  return observationRecords.map((o) => {
    const model = models.find((m) => m.id === o.internal_model_id);
    return {
      ...convertObservation(o),
      latency: o.latency ? Number(o.latency) / 1000 : null,
      timeToFirstToken: o.time_to_first_token
        ? Number(o.time_to_first_token) / 1000
        : null,
      modelId: model?.id ?? null,
      inputPrice:
        model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
      outputPrice:
        model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
      totalPrice:
        model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    };
  });
};

const enrichObservationsWithTraceFields = async (
  observationRecords: Array<Observation & ObservationPriceFields>,
): Promise<FullObservations> => {
  return observationRecords.map((o) => {
    return {
      ...o,
      traceName: o.name ?? null,
      traceTags: [], // TODO pull from PG
      traceTimestamp: null,
    };
  });
};

/**
 * Internal helper: extract and convert time filter from FilterList
 * Common pattern: find time filter and convert to ClickHouse DateTime format
 */
const extractTimeFilter = (filter: FilterList): string | null => {
  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "events" &&
      f.field === "start_time" &&
      (f.operator === ">=" || f.operator === ">"),
  );

  return timeFilter
    ? convertDateToClickhouseDateTime((timeFilter as DateTimeFilter).value)
    : null;
};

/**
 * Column mapping for public API filters on events table
 */
const PUBLIC_API_EVENTS_COLUMN_MAPPING: ApiColumnMapping[] =
  createPublicApiObservationsColumnMapping("events", "e", "parent_span_id");

export const getObservationsCountFromEventsTable = async (
  opts: ObservationTableQuery,
) => {
  const count = await getObservationsFromEventsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getObservationsWithModelDataFromEventsTable = async (
  opts: ObservationTableQuery,
): Promise<FullObservations> => {
  const observationRecords =
    await getObservationsFromEventsTableInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        ...opts,
        select: "rows",
        tags: { kind: "list" },
      },
    );

  return enrichObservationsWithTraceFields(
    await enrichObservationsWithModelData(observationRecords, opts.projectId),
  );
};

const getObservationsFromEventsTableInternal = async <T>(
  opts: ObservationTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const {
    projectId,
    filter,
    selectIOAndMetadata,
    limit,
    offset,
    orderBy,
    clickhouseConfigs,
  } = opts;

  // Build filter list
  const observationsFilter = new FilterList(
    createFilterFromFilterState(filter, eventsTableUiColumnDefinitions),
  );

  const startTimeFrom = extractTimeFilter(observationsFilter);
  const hasScoresFilter = filter.some((f) =>
    f.column.toLowerCase().includes("scores"),
  );
  const appliedObservationsFilter = observationsFilter.apply();
  const search = clickhouseSearchCondition(
    opts.searchQuery,
    opts.searchType,
    "e",
  );

  // Query optimization: joining traces onto observations is expensive.
  // Hence, only join if the UI table contains filters on traces.
  const traceTableFilter = filter.filter((f) =>
    eventsTableLegacyTraceUiColumnDefinitions.some(
      (c) => c.uiTableId === f.column || c.uiTableName === f.column,
    ),
  );
  const orderByTraces = orderBy
    ? eventsTableLegacyTraceUiColumnDefinitions.some(
        (c) =>
          c.uiTableId === orderBy.column || c.uiTableName === orderBy.column,
      )
    : undefined;
  const needsTraceJoin =
    traceTableFilter.length > 0 || orderByTraces || search.query;

  // When we have default ordering by time, we order by toUnixTimestamp(e.start_time)
  // This way, clickhouse is able to read more efficiently directly from disk without ordering
  const newDefaultOrder =
    orderBy?.column === "startTime"
      ? [{ column: "order_by_unix", order: orderBy.order }]
      : [orderBy ?? null];

  const chOrderBy = orderByToClickhouseSql(newDefaultOrder, [
    ...eventsTableUiColumnDefinitions,
    {
      uiTableName: "order_by_unix",
      uiTableId: "order_by_unix",
      clickhouseTableName: "events",
      clickhouseSelect: "toUnixTimestamp(e.start_time)",
    },
  ]);

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (opts.select === "count") {
    queryBuilder.selectFieldSet("count");
  } else {
    queryBuilder.selectFieldSet("base", "calculated");
    if (selectIOAndMetadata) {
      queryBuilder.selectFieldSet("io", "metadata");
    }
  }

  queryBuilder
    .when(hasScoresFilter, (b) =>
      b.withCTE("scores_agg", eventsScoresAggregation, {
        projectId,
        startTimeFrom,
      }),
    )
    .when(Boolean(needsTraceJoin), (b) =>
      b.withCTE("traces", eventsTracesAggregation, {
        projectId,
        startTimeFrom,
      }),
    )
    .when(Boolean(needsTraceJoin), (b) =>
      b.leftJoin(
        "traces t",
        "ON t.id = e.trace_id AND t.project_id = e.project_id",
      ),
    )
    .when(hasScoresFilter, (b) =>
      b.leftJoin("scores_agg AS s", "ON s.observation_id = e.span_id"),
    )
    .where(appliedObservationsFilter)
    .where(search)
    .orderBy(chOrderBy)
    .limit(limit, offset);

  const { query, params } = queryBuilder.buildWithParams();

  return measureAndReturn({
    operationName: "getObservationsFromEventsTableInternal",
    projectId,
    input: {
      params,
      tags: {
        ...(opts.tags ?? {}),
        feature: "tracing",
        type: "events",
        projectId,
        kind: opts.select,
        operation_name: "getObservationsTableInternal",
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};

export const getObservationByIdFromEventsTable = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
  preferredClickhouseService,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
  preferredClickhouseService?: PreferredClickhouseService;
}) => {
  const records = await getObservationByIdFromEventsTableInternal({
    id,
    projectId,
    fetchWithInputOutput,
    startTime,
    type,
    traceId,
    renderingProps,
    preferredClickhouseService,
  });
  const mapped = records.map((record) =>
    convertObservation(record, renderingProps),
  );

  mapped.forEach((observation) => {
    recordDistribution(
      "langfuse.query_by_id_age",
      new Date().getTime() - observation.startTime.getTime(),
      {
        table: "events",
      },
    );
  });
  if (mapped.length === 0) {
    throw new LangfuseNotFoundError(`Observation with id ${id} not found`);
  }

  if (mapped.length > 1) {
    logger.error(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
    throw new InternalServerError(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
  }
  return mapped.shift();
};

const getObservationByIdFromEventsTableInternal = async ({
  id,
  projectId,
  fetchWithInputOutput = false,
  startTime,
  type,
  traceId,
  renderingProps = DEFAULT_RENDERING_PROPS,
  preferredClickhouseService,
}: {
  id: string;
  projectId: string;
  fetchWithInputOutput?: boolean;
  startTime?: Date;
  type?: ObservationType;
  traceId?: string;
  renderingProps?: RenderingProps;
  preferredClickhouseService?: PreferredClickhouseService;
}) => {
  // Build query using EventsQueryBuilder with automatic param tracking
  const queryBuilder = new EventsQueryBuilder({ projectId })
    .selectFieldSet("byIdBase", "byIdModel", "byIdPrompt", "byIdTimestamps")
    .when(fetchWithInputOutput, (b) =>
      b.selectIO(
        renderingProps.truncated,
        env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT,
      ),
    )
    .whereRaw("span_id = {id: String}", { id })
    .when(Boolean(startTime), (b) =>
      b.whereRaw("toDate(start_time) = toDate({startTime: DateTime64(3)})", {
        startTime: convertDateToClickhouseDateTime(startTime!),
      }),
    )
    .when(Boolean(type), (b) => b.whereRaw("type = {type: String}", { type }))
    .when(Boolean(traceId), (b) =>
      b.whereRaw("trace_id = {traceId: String}", { traceId }),
    )
    .orderBy("ORDER BY toUnixTimestamp(start_time) DESC, event_ts DESC")
    .limit(1, 0);

  const { query, params } = queryBuilder.buildWithParams();

  return await queryClickhouse<ObservationRecordReadType>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "byId",
      projectId,
    },
    preferredClickhouseService,
  });
};

type PublicApiObservationsQuery = {
  projectId: string;
  page: number;
  limit: number;
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  level?: string;
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  environment?: string | string[];
  advancedFilters?: FilterState;
};

/**
 * Internal implementation for public API observations queries.
 * Consolidates count and list queries into a single implementation.
 */
const getObservationsFromEventsTableForPublicApiInternal = async <T>(
  opts: PublicApiObservationsQuery & { select: "rows" | "count" },
): Promise<Array<T>> => {
  const { projectId, page, limit, advancedFilters, ...filterParams } = opts;

  // Convert and merge simple and advanced filters
  const observationsFilter = deriveFilters(
    { ...filterParams, projectId, page, limit },
    PUBLIC_API_EVENTS_COLUMN_MAPPING,
    advancedFilters,
    eventsTableUiColumnDefinitions,
  );

  // Determine if we need to join traces (for userId filter)
  const hasTraceFilter = Boolean(filterParams.userId);

  // Extract time filter using helper
  const startTimeFrom = extractTimeFilter(observationsFilter);
  const appliedFilter = observationsFilter.apply();

  // Build query using EventsQueryBuilder
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (opts.select === "count") {
    queryBuilder.selectFieldSet("count");
  } else {
    queryBuilder.selectFieldSet("base", "calculated", "io", "metadata");
  }

  queryBuilder
    .when(hasTraceFilter, (b) =>
      b.withCTE("traces", eventsTracesAggregation, {
        projectId,
        startTimeFrom,
      }),
    )
    .when(hasTraceFilter, (b) =>
      b.leftJoin(
        "traces t",
        "ON t.id = e.trace_id AND t.project_id = e.project_id",
      ),
    )
    .where(appliedFilter);

  if (opts.select === "rows") {
    queryBuilder
      .orderBy("ORDER BY toUnixTimestamp(e.start_time) DESC")
      .limit(limit, (page - 1) * limit);
  }

  const { query, params } = queryBuilder.buildWithParams();

  const result = await measureAndReturn({
    operationName: `getObservationsFromEventsTableForPublicApi_${opts.select}`,
    projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "events",
        kind: opts.select === "count" ? "publicApiCount" : "publicApiRows",
        projectId,
      },
    },
    fn: async (input) => {
      return await queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
    },
  });

  return result;
};

/**
 * Get observations list from events table for public API.
 * Includes model enrichment and supports public API filter format.
 */
export const getObservationsFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<Array<Observation & ObservationPriceFields>> => {
  const observationRecords =
    await getObservationsFromEventsTableForPublicApiInternal<ObservationsTableQueryResultWitouhtTraceFields>(
      {
        ...opts,
        select: "rows",
      },
    );
  return enrichObservationsWithModelData(observationRecords, opts.projectId);
};

/**
 * Get count of observations from events table for public API.
 */
export const getObservationsCountFromEventsTableForPublicApi = async (
  opts: PublicApiObservationsQuery,
): Promise<number> => {
  const countResult = await getObservationsFromEventsTableForPublicApiInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
  });
  return Number(countResult[0].count);
};
