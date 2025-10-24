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
 * Aggregation fields for trace-level queries
 * These fields use ClickHouse aggregation functions and require GROUP BY
 */
const EVENTS_AGGREGATION_FIELDS = {
  // Grouping keys (must be in GROUP BY)
  id: "trace_id AS id",
  projectId: "project_id",

  // Aggregated fields
  name: "argMaxIf(name, event_ts, isNull(parent_span_id) OR parent_span_id = '') AS name",
  timestamp: "min(start_time) as timestamp",
  environment:
    "argMaxIf(environment, event_ts, environment <> '') AS environment",
  version: "argMaxIf(version, event_ts, version <> '') AS version",
  session_id: "argMaxIf(session_id, event_ts, session_id <> '') AS session_id",
  user_id: "argMaxIf(user_id, event_ts, user_id <> '') AS user_id",
  input: "argMax(input, event_ts) AS input",
  output: "argMax(output, event_ts) AS output",
  metadata: "argMax(metadata, event_ts) AS metadata",
  created_at: "min(created_at) AS created_at",
  updated_at: "max(updated_at) AS updated_at",
  total_cost: "sum(total_cost) AS total_cost",
  latency_milliseconds:
    "date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) AS latency_milliseconds",
  observation_ids:
    "groupUniqArrayIf(span_id, isNotNull(span_id) AND span_id != '') AS observation_ids",

  // Legacy fields for backward compatibility
  tags: "array() AS tags",
  bookmarked: "false AS bookmarked",
  public: "false AS public",
  release: "'' AS release",
} as const;

/**
 * Field sets for aggregation queries
 */
const AGGREGATION_FIELD_SETS = {
  all: Object.keys(EVENTS_AGGREGATION_FIELDS) as Array<
    keyof typeof EVENTS_AGGREGATION_FIELDS
  >,
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
 * Most abstract base class - contains common query building logic
 * that applies to all query types (WHERE, ORDER BY, LIMIT, params management).
 */
abstract class AbstractQueryBuilder {
  protected whereClauses: string[] = [];
  protected orderByClause: string = "";
  protected limitClause: string = "";
  protected params: Record<string, any> = {};

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
    if (params) {
      this.params = { ...this.params, ...params };
    }
    return this;
  }

  /**
   * Add WHERE conditions from FilterList
   * Strips leading AND/OR and wraps in parentheses
   */
  where(condition: { query: string; params?: Record<string, any> }): this {
    if (condition.query.trim()) {
      const trimmedQuery = condition.query.trim().replace(/^(AND|OR)\s+/i, "");
      this.whereRaw(`(${trimmedQuery})`, condition.params);
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
   */
  limit(limit?: number, offset?: number): this {
    if (limit !== undefined && offset !== undefined) {
      this.limitClause = "LIMIT {limit: Int32} OFFSET {offset: Int32}";
      this.params.limit = limit;
      this.params.offset = offset;
    } else {
      this.limitClause = "";
    }
    return this;
  }

  /**
   * Conditionally apply builder operations
   */
  when<T extends AbstractQueryBuilder>(
    this: T,
    condition: boolean,
    // eslint-disable-next-line no-unused-vars
    fn: (builder: T) => T,
  ): T {
    return condition ? fn(this) : this;
  }

  /**
   * Build the final query string along with accumulated parameters
   */
  buildWithParams(): { query: string; params: Record<string, any> } {
    return {
      query: this.buildQuery(),
      params: this.params,
    };
  }

  /**
   * Helper to build LIMIT section
   */
  protected buildLimitSection(): string {
    return this.limitClause;
  }

  /**
   * Build the final query string - implemented by subclasses
   */
  protected abstract buildQuery(): string;
}

/**
 * Adds CTE and JOIN support to the abstract query builder
 */
abstract class AbstractCTEQueryBuilder extends AbstractQueryBuilder {
  protected ctes: string[] = [];
  protected joins: string[] = [];

  /**
   * Add a CTE (Common Table Expression) to the query
   */
  withCTE(
    name: string,
    queryWithParams: { query: string; params: Record<string, any> },
  ): this {
    this.ctes.push(`${name} AS (${queryWithParams.query})`);
    this.params = { ...this.params, ...queryWithParams.params };
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
   * Helper to build WITH clause section
   */
  protected buildCTESection(): string {
    return this.ctes.length > 0 ? `WITH ${this.ctes.join(",\n")}` : "";
  }

  /**
   * Helper to build JOIN section
   */
  protected buildJoinSection(): string {
    return this.joins.length > 0 ? this.joins.join("\n") : "";
  }

  /**
   * Helper to build WHERE section
   */
  protected buildWhereSection(): string {
    if (this.whereClauses.length === 0) return "";
    return `WHERE ${this.whereClauses.join("\n  AND ")}`;
  }
}

/**
 * Base class for events table query builders.
 * Contains shared logic for building SQL queries against the events table.
 */
abstract class BaseEventsQueryBuilder<
  TFields extends Record<string, string>,
> extends AbstractCTEQueryBuilder {
  protected selectFields: Set<string> = new Set();
  protected projectId: string | NoProjectIdType;

  constructor(
    protected fields: TFields, // eslint-disable-line no-unused-vars
    options: { projectId: string | NoProjectIdType },
  ) {
    super();
    this.projectId = options.projectId;
  }

  /**
   * Build the SELECT clause - implemented by subclasses
   */
  protected abstract buildSelectClause(): string;

  /**
   * Build the GROUP BY clause - implemented by subclasses
   * Returns empty string for non-aggregation queries
   */
  protected abstract buildGroupByClause(): string;

  /**
   * Build the final query string
   */
  protected buildQuery(): string {
    const parts: string[] = [];

    // CTEs (WITH clause)
    const cteSection = this.buildCTESection();
    if (cteSection) {
      parts.push(cteSection);
    }

    // SELECT
    parts.push(this.buildSelectClause());

    // FROM
    parts.push("FROM events e");

    // JOINs
    const joinSection = this.buildJoinSection();
    if (joinSection) {
      parts.push(joinSection);
    }

    // WHERE - add project_id filter automatically
    const allWhereClauses = [...this.whereClauses];
    if (this.projectId !== NoProjectId) {
      allWhereClauses.unshift("e.project_id = {projectId: String}");
      this.params.projectId = this.projectId;
    }

    if (allWhereClauses.length > 0) {
      parts.push(`WHERE ${allWhereClauses.join("\n  AND ")}`);
    }

    // GROUP BY (only for aggregation queries)
    const groupBy = this.buildGroupByClause();
    if (groupBy) {
      parts.push(groupBy);
    }

    // ORDER BY
    if (this.orderByClause) {
      parts.push(this.orderByClause);
    }

    // LIMIT
    const limitSection = this.buildLimitSection();
    if (limitSection) {
      parts.push(limitSection);
    }

    return parts.join("\n");
  }
}

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
export class EventsQueryBuilder extends BaseEventsQueryBuilder<
  typeof EVENTS_FIELDS
> {
  private ioFields: { truncated: boolean; charLimit?: number } | null = null;

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
    super(EVENTS_FIELDS, options);
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
   * Build the SELECT clause for row-level queries
   */
  protected buildSelectClause(): string {
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

    return `SELECT\n  ${fieldExpressions.join(",\n  ")}`;
  }

  /**
   * No GROUP BY for row-level queries
   */
  protected buildGroupByClause(): string {
    return "";
  }
}

/**
 * Schema describing what columns a CTE exposes
 */
export type CTESchema = string[];

/**
 * A CTE with its query, params, and exposed column names
 */
export interface CTEWithSchema {
  query: string;
  params: Record<string, any>;
  schema: CTESchema;
}

/**
 * Utility type to generate all valid column references from alias mappings.
 * For each alias, generates all possible column references like "alias.columnName".
 *
 * @example
 * type CTEs = { traces: ['id', 'name'], scores: ['trace_id', 'score'] }
 * type Aliases = { t: 'traces', s: 'scores' }
 * type Cols = AliasedColumns<CTEs, Aliases>
 * // Result: "t.id" | "t.name" | "s.trace_id" | "s.score"
 */
type AliasedColumns<
  RegisteredCTEs extends Record<string, string[]>,
  Aliases extends Record<string, keyof RegisteredCTEs>,
> = {
  [Alias in keyof Aliases]: `${Alias & string}.${RegisteredCTEs[Aliases[Alias]][number]}`;
}[keyof Aliases];

/**
 * EventsAggregationQueryBuilder - A fluent query builder for aggregated events table queries
 *
 * This builder is specifically for aggregation queries (e.g., building traces from events).
 * It automatically includes GROUP BY trace_id, project_id and uses aggregation functions.
 *
 * @example
 * const builder = new EventsAggregationQueryBuilder({ projectId: "my-project-id" })
 *   .selectFieldSet("all")
 *   .withStartTimeFrom(startTimeFrom)
 *   .orderBy("ORDER BY timestamp DESC");
 *
 * const { query, params } = builder.buildWithParams();
 */
export class EventsAggregationQueryBuilder extends BaseEventsQueryBuilder<
  typeof EVENTS_AGGREGATION_FIELDS
> {
  constructor(options: { projectId: string }) {
    super(EVENTS_AGGREGATION_FIELDS, options);
  }

  /**
   * Add SELECT fields from predefined aggregation field sets
   */
  selectFieldSet(
    ...setNames: Array<keyof typeof AGGREGATION_FIELD_SETS>
  ): this {
    setNames
      .flatMap((s) => AGGREGATION_FIELD_SETS[s])
      .forEach((field) => this.selectFields.add(field));
    return this;
  }

  /**
   * Add trace ID filter
   */
  withTraceIds(traceIds?: string[]): this {
    return this.when(Boolean(traceIds && traceIds.length > 0), (b) =>
      b.whereRaw("trace_id IN ({traceIds: Array(String)})", { traceIds }),
    );
  }

  /**
   * Add start time filter with OBSERVATIONS_TO_TRACE_INTERVAL
   */
  withStartTimeFrom(startTimeFrom?: string | null): this {
    return this.when(Boolean(startTimeFrom), (b) =>
      b.whereRaw(
        "start_time >= {startTimeFrom: DateTime64(3)} - INTERVAL 2 DAY",
        { startTimeFrom },
      ),
    );
  }

  /**
   * Build the SELECT clause for aggregation queries
   */
  protected buildSelectClause(): string {
    const fieldExpressions = [...this.selectFields]
      .map((key) => {
        return this.fields[key as keyof typeof EVENTS_AGGREGATION_FIELDS];
      })
      .filter(Boolean);
    return `SELECT\n  ${fieldExpressions.join(",\n  ")}`;
  }

  /**
   * Build the GROUP BY clause for trace aggregations
   */
  protected buildGroupByClause(): string {
    return "GROUP BY trace_id, project_id";
  }

  /**
   * Build with schema for use in CTEQueryBuilder.
   * Returns query, params, and list of column names this CTE exposes.
   */
  buildWithSchema(): CTEWithSchema {
    // Extract column names from selected fields
    const schema = [...this.selectFields].map((fieldKey) => {
      return fieldKey;
    });

    return {
      ...this.buildWithParams(),
      schema,
    };
  }
}

/**
 * Query builder that composes CTEs with type-safe CTE name tracking.
 *
 * Generic type parameters:
 * - RegisteredCTEs: Maps CTE names to their column name arrays
 * - Aliases: Maps table aliases to CTE names
 *
 * @example
 * const builder = new CTEQueryBuilder()
 *   .withCTE('traces', { query: '...', params: {}, schema: ['id', 'name'] })
 *   .withCTE('scores', { query: '...', params: {}, schema: ['trace_id', 'score'] })
 *   .from('traces', 't')                              // Type-safe, adds 't' -> 'traces' mapping
 *   .leftJoin('scores', 's', 'ON s.trace_id = t.id')  // Type-safe, adds 's' -> 'scores' mapping
 *   .selectColumns('t.id', 't.name', 's.score')       // Type-safe column references
 *   .select('COUNT(*) as total')                      // Raw SQL expression
 *   .from('nonexistent', 'x');                        // Compile error - CTE not registered
 */
export class CTEQueryBuilder<
  RegisteredCTEs extends Record<string, CTESchema> = {},
  Aliases extends Record<string, keyof RegisteredCTEs> = {},
> extends AbstractQueryBuilder {
  private ctes: string[] = [];
  private cteSchemas: Map<string, CTESchema> = new Map();
  private joins: string[] = [];
  private selectExpressions: string[] = [];
  private fromClause: string = "";
  private fromAlias: string = "";

  /**
   * Register a CTE with its schema
   * Returns a new builder type with the CTE name added to RegisteredCTEs.
   */
  withCTE<Name extends string, Schema extends CTESchema>(
    name: Name,
    cteWithSchema: CTEWithSchema & { schema: Schema },
  ): CTEQueryBuilder<RegisteredCTEs & Record<Name, Schema>, Aliases> {
    this.ctes.push(`${name} AS (${cteWithSchema.query})`);
    this.params = { ...this.params, ...cteWithSchema.params };
    this.cteSchemas.set(name, cteWithSchema.schema);
    // Type assertion needed because we're changing the type parameter
    return this as any;
  }

  /**
   * Convenience method to add a CTE from a builder with buildWithSchema()
   */
  withCTEFromBuilder<Name extends string>(
    name: Name,
    builder: { buildWithSchema(): CTEWithSchema },
  ): CTEQueryBuilder<
    RegisteredCTEs &
      Record<Name, ReturnType<typeof builder.buildWithSchema>["schema"]>,
    Aliases
  > {
    return this.withCTE(name, builder.buildWithSchema());
  }

  /**
   * Set the main FROM clause.
   * Only accepts CTE names that have been registered via withCTE().
   * Type-checked at compile time!
   */
  from<Name extends keyof RegisteredCTEs & string, Alias extends string>(
    cteName: Name,
    alias: Alias,
  ): CTEQueryBuilder<RegisteredCTEs, Aliases & Record<Alias, Name>> {
    if (!this.cteSchemas.has(cteName)) {
      throw new Error(
        `CTE '${cteName}' not registered. Call withCTE('${cteName}', ...) first.`,
      );
    }
    this.fromClause = cteName;
    this.fromAlias = alias;
    // Type assertion needed because we're changing the type parameter
    return this as any;
  }

  /**
   * Join another CTE.
   * Only accepts CTE names that have been registered via withCTE().
   * Type-checked at compile time!
   */
  leftJoin<Name extends keyof RegisteredCTEs & string, Alias extends string>(
    cteName: Name,
    alias: Alias,
    onClause: string,
  ): CTEQueryBuilder<RegisteredCTEs, Aliases & Record<Alias, Name>> {
    if (!this.cteSchemas.has(cteName)) {
      throw new Error(
        `CTE '${cteName}' not registered. Call withCTE('${cteName}', ...) first.`,
      );
    }
    this.joins.push(`LEFT JOIN ${cteName} ${alias} ${onClause}`);
    // Type assertion needed because we're changing the type parameter
    return this as any;
  }

  /**
   * Add type-safe column references from registered CTEs.
   * Only accepts column references in the format "alias.columnName" where:
   * - alias is a registered table alias (from from() or leftJoin())
   * - columnName exists in that CTE's schema
   *
   * @example
   * builder
   *   .from('traces', 't')
   *   .leftJoin('scores', 's', 'ON s.trace_id = t.id')
   *   .selectColumns('t.id', 't.name', 's.score') // Type-safe
   *   .selectColumns('t.nonexistent')             // Compile error
   *   .selectColumns('x.id')                      // Compile error - 'x' not registered
   */
  selectColumns(
    ...columns: Array<AliasedColumns<RegisteredCTEs, Aliases>>
  ): this {
    this.selectExpressions.push(...columns);
    return this;
  }

  /**
   * Add raw SELECT expressions (for complex SQL, aggregations, aliases, etc.)
   * Not type-checked - use for expressions like "COUNT(*) as total" or "t.id || '-' || s.score as combined"
   * For type-safe column selection, use selectColumns() instead.
   *
   * @example
   * builder.select("COUNT(*) as total", "t.id || '-' || s.score as combined")
   */
  select(...expressions: string[]): this {
    this.selectExpressions.push(...expressions);
    return this;
  }

  /**
   * Build the query
   */
  protected buildQuery(): string {
    if (!this.fromClause) {
      throw new Error(
        "No FROM clause set. Call from() to specify the main CTE.",
      );
    }
    if (this.selectExpressions.length === 0) {
      throw new Error("No SELECT expressions. Call select() to add columns.");
    }

    const parts: string[] = [];

    // CTEs
    if (this.ctes.length > 0) {
      parts.push(`WITH ${this.ctes.join(",\n")}`);
    }

    // SELECT
    parts.push(`SELECT\n  ${this.selectExpressions.join(",\n  ")}`);

    // FROM
    parts.push(`FROM ${this.fromClause} ${this.fromAlias}`);

    // JOINs
    if (this.joins.length > 0) {
      parts.push(this.joins.join("\n"));
    }

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join("\n  AND ")}`);
    }

    // ORDER BY
    if (this.orderByClause) {
      parts.push(this.orderByClause);
    }

    // LIMIT
    const limitSection = this.buildLimitSection();
    if (limitSection) {
      parts.push(limitSection);
    }

    return parts.join("\n");
  }
}
