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
export class EventsQueryBuilder {
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
