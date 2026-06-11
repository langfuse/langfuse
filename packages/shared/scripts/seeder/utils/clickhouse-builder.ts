import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  DatasetRunItemRecordInsertType,
  createDatasetRunItemsCh,
} from "../../../src/server";
import { SEED_TEXT_PROMPTS } from "./postgres-seed-constants";
import {
  createTracesCh,
  createObservationsCh,
  createScoresCh,
} from "../../../src/server";
import { InsertResult } from "@clickhouse/client";

/**
 * Builds or executes ClickHouse SQL INSERT queries for seeding test data.
 *
 * Use executeXxxInsert() for custom curated data with detailed control.
 * Use buildBulkXxxInsert() for large datasets (>1000 items) for random distribution of data.
 */
export class ClickHouseQueryBuilder {
  private escapeString(str: string): string {
    // Backslashes first: ClickHouse treats them as escape sequences inside
    // single-quoted literals, so unescaped ones corrupt the stored value or
    // break the statement (e.g. a JSON fixture's \" or an --id-prefix 'a\').
    return str.replace(/\\/g, "\\\\").replace(/'/g, "''");
  }

  private buildNestedMetadataMapSql(
    baseEntries: string[],
    rowExpression: string = "number",
  ): string {
    return `map(
          ${baseEntries.join(",\n          ")},
          'customer.id', concat('customer_', toString(${rowExpression} % 100)),
          'customer.plan', arrayElement(['free', 'pro', 'enterprise'], 1 + (${rowExpression} % 3)),
          'customer.region.code', arrayElement(['eu-central-1', 'us-east-1', 'ap-south-1'], 1 + (${rowExpression} % 3)),
          'routing.queue', arrayElement(['support-chat', 'sales-chat', 'ops-chat'], 1 + (${rowExpression} % 3)),
          'routing.priority', arrayElement(['low', 'normal', 'high'], 1 + (${rowExpression} % 3)),
          'flags.beta', if(${rowExpression} % 2 = 0, 'true', 'false')
        )`;
  }

  /**
   * Creates INSERT query for trace data using VALUES syntax.
   * Use for: Small datasets, detailed trace objects with all fields populated.
   */
  async executeTracesInsert(
    traces: TraceRecordInsertType[],
  ): Promise<InsertResult> {
    return await createTracesCh(traces);
  }

  /**
   * Creates INSERT query for observation data using VALUES syntax.
   * Use for: Small datasets, observations that link to postgres data (e.g. dataset runs)
   */
  async executeObservationsInsert(
    observations: ObservationRecordInsertType[],
  ): Promise<InsertResult> {
    return await createObservationsCh(observations);
  }

  /**
   * Creates INSERT query for dataset run items data using VALUES syntax.
   * Use for: Small datasets, dataset run items that link to postgres data (e.g. dataset runs)
   */
  async executeDatasetRunItemsInsert(
    datasetRunItems: DatasetRunItemRecordInsertType[],
  ): Promise<InsertResult> {
    return await createDatasetRunItemsCh(datasetRunItems);
  }

  /**
   * Creates INSERT query for score data using VALUES syntax.
   * Use for: Small datasets, scores with custom values and metadata.
   */
  async executeScoresInsert(
    scores: ScoreRecordInsertType[],
  ): Promise<InsertResult> {
    return await createScoresCh(scores);
  }

  /**
   * Creates INSERT using ClickHouse numbers() function.
   * Use for: Large datasets (>1000 traces), realistic timestamps, bulk generation.
   */
  buildBulkTracesInsert(
    projectId: string,
    count: number,
    environment: string = "default",
    fileContent?: { heavyMarkdown: string; nestedJson: any; chatMlJson: any },
    opts: {
      numberOfDays: number;
      idPrefix?: string;
      anchorSeconds?: number;
      seed?: number;
    } = { numberOfDays: 1 },
  ): string {
    // Escape file content if provided
    const escapedHeavyMarkdown = fileContent
      ? this.escapeString(fileContent.heavyMarkdown)
      : "Sample heavy markdown content";
    const escapedNestedJson = fileContent
      ? this.escapeString(JSON.stringify(fileContent.nestedJson))
      : '{"sample": "nested json"}';
    const escapedChatMl = fileContent
      ? this.escapeString(JSON.stringify(fileContent.chatMlJson))
      : '{"messages": []}';
    const idPrefix = opts.idPrefix
      ? `${this.escapeString(opts.idPrefix)}-`
      : "";
    const escapedProjectId = this.escapeString(projectId);
    const escapedEnvironment = this.escapeString(environment);
    const idSuffix = this.escapeString(projectId.slice(-8));
    const spreadSeconds = opts.numberOfDays * 86400;
    const anchorSeconds =
      opts.anchorSeconds ?? Math.floor(Date.now() / 86_400_000) * 86_400;
    const seedSalt = (opts.seed ?? 0) >>> 0;

    // Timestamps derive from `number` and anchor to midnight UTC (computed
    // in TS, independent of the ClickHouse server timezone) so same-day
    // re-runs produce identical ORDER BY tuples (toDate(timestamp) is a
    // sorting key) and ReplacingMergeTree dedups instead of duplicating.
    // NOTE: the INSERT relies on positional column order — keep the SELECT
    // list in sync with the table schema when migrations add columns.
    return `
      INSERT INTO traces
      SELECT
        concat('${idPrefix}trace-bulk-', toString(number), '-${idSuffix}') AS id,
        toDateTime(${anchorSeconds} - intDiv(number * ${spreadSeconds}, ${Math.max(count, 1)})) AS timestamp,
        concat('trace-', toString(number % 10)) AS name,
        if(h1 % 10 < 3, concat('${idPrefix}user_', toString(h1 % 1000)), NULL) AS user_id,
        ${this.buildNestedMetadataMapSql(["'generated'", "'bulk'"])} AS metadata,
        NULL AS release,
        NULL AS version,
        '${escapedProjectId}' AS project_id,
        '${escapedEnvironment}' AS environment,
        if(h2 % 10 = 0, true, false) AS public,
        if(h2 % 20 = 1, true, false) AS bookmarked,
        array() AS tags,
        if(h3 % 10 < 3, '${escapedHeavyMarkdown}',
          '${escapedChatMl}'
        ) AS input,
        if(h3 % 10 >= 8, '${escapedNestedJson}',
          '${escapedChatMl}'
        ) AS output,
        if(h1 % 100 < 30, concat('${idPrefix}session_', toString(h2 % 100)), NULL) AS session_id,
        now() AS created_at,
        now() AS updated_at,
        now() AS event_ts,
        0 AS is_deleted
      FROM
      (
        SELECT
          number,
          xxHash32(toUInt64(number * 4 + ${seedSalt})) AS h1,
          xxHash32(toUInt64(number * 4 + 1 + ${seedSalt})) AS h2,
          xxHash32(toUInt64(number * 4 + 2 + ${seedSalt})) AS h3
        FROM numbers(${count})
      );
    `;
  }

  /**
   * Creates observations with automatic prompt linking (10% rate).
   * Use for: Large datasets, hierarchical observations, cost/latency variation.
   */
  buildBulkObservationsInsert(
    projectId: string,
    tracesCount: number,
    observationsPerTrace: number = 5,
    environment: string = "default",
    fileContent?: { heavyMarkdown: string; nestedJson: any; chatMlJson: any },
    opts: {
      numberOfDays: number;
      idPrefix?: string;
      anchorSeconds?: number;
      seed?: number;
    } = { numberOfDays: 1 },
  ): string {
    const totalObservations = tracesCount * observationsPerTrace;
    const idPrefix = opts.idPrefix
      ? `${this.escapeString(opts.idPrefix)}-`
      : "";
    const escapedProjectId = this.escapeString(projectId);
    const escapedEnvironment = this.escapeString(environment);
    const idSuffix = this.escapeString(projectId.slice(-8));
    const spreadSeconds = opts.numberOfDays * 86400;
    const anchorSeconds =
      opts.anchorSeconds ?? Math.floor(Date.now() / 86_400_000) * 86_400;
    const seedSalt = (opts.seed ?? 0) >>> 0;

    // Escape file content if provided
    const escapedHeavyMarkdown = fileContent
      ? this.escapeString(fileContent.heavyMarkdown)
      : "Sample heavy markdown content";
    const escapedNestedJson = fileContent
      ? this.escapeString(JSON.stringify(fileContent.nestedJson))
      : '{"sample": "nested json"}';
    const escapedChatMl = fileContent
      ? this.escapeString(JSON.stringify(fileContent.chatMlJson))
      : '{"messages": []}';

    // start_time anchors to the OWN TRACE's timestamp formula (same divisor
    // as buildBulkTracesInsert) plus a forward per-depth offset, so parents
    // precede children and observations cluster at their trace's date.
    return `
      INSERT INTO observations
      SELECT
        concat('${idPrefix}obs-bulk-', toString(number), '-${idSuffix}') AS id,
        concat('${idPrefix}trace-bulk-', toString(number % ${tracesCount}), '-${idSuffix}') AS trace_id,
        '${escapedProjectId}' AS project_id,
        '${escapedEnvironment}' AS environment,
        multiIf(h1 % 100 < 47, 'GENERATION', h1 % 100 < 94, 'SPAN', 'EVENT') AS type,
        if(number < ${tracesCount}, NULL, concat('${idPrefix}obs-bulk-', toString(number - ${tracesCount}), '-${idSuffix}')) AS parent_observation_id,
        toDateTime(${anchorSeconds} - intDiv((number % ${Math.max(tracesCount, 1)}) * ${spreadSeconds}, ${Math.max(tracesCount, 1)}) + intDiv(number, ${Math.max(tracesCount, 1)}) * 60) AS start_time,
        addMilliseconds(
          toDateTime(${anchorSeconds} - intDiv((number % ${Math.max(tracesCount, 1)}) * ${spreadSeconds}, ${Math.max(tracesCount, 1)}) + ${Math.max(observationsPerTrace - 1, 0)} * 60),
          (${Math.max(observationsPerTrace - 1, 0)} - intDiv(number, ${Math.max(tracesCount, 1)})) * 4000 +
          case
            when type = 'GENERATION' then 600 + h2 % 3400
            when type = 'SPAN' then 1 + h2 % 50
            else 1 + h2 % 10
          end) AS end_time,
        case
          when type = 'GENERATION' then concat('generation-', toString(number % 10))
          when type = 'SPAN' then concat('span-', toString(number % 10))
          else concat('event-', toString(number % 10))
        end AS name,
        ${this.buildNestedMetadataMapSql(["'key'", "'value'"])} AS metadata,
        multiIf(h3 % 1000 < 850, 'DEFAULT', h3 % 1000 < 955, 'DEBUG', h3 % 1000 < 969, 'ERROR', 'WARNING') AS level,
        NULL AS status_message,
        NULL AS version,
        if(type = 'GENERATION',
          if(h2 % 10 < 4, '${escapedHeavyMarkdown}', '${escapedChatMl}'),
          NULL) AS input,
        if(type = 'GENERATION',
          if(h2 % 10 >= 7, '${escapedNestedJson}', '${escapedChatMl}'),
          NULL) AS output,
        if(type = 'GENERATION', 'gpt-4', NULL) AS provided_model_name,
        if(type = 'GENERATION', concat('model_', toString(h2 % 1000)), NULL) AS internal_model_id,
        if(type = 'GENERATION', '{"temperature": 0.7}', '{}') AS model_parameters,
        if(type = 'GENERATION', map('input', toUInt64(20 + h1 % 181), 'output', toUInt64(10 + h2 % 91), 'total', toUInt64(30 + h1 % 181 + h2 % 91)), map()) AS provided_usage_details,
        if(type = 'GENERATION', map('input', toUInt64(20 + h1 % 181), 'output', toUInt64(10 + h2 % 91), 'total', toUInt64(30 + h1 % 181 + h2 % 91)), map()) AS usage_details,
        if(type = 'GENERATION', map('input', toDecimal64((10 + h1 % 990) / 1000000, 8), 'output', toDecimal64((10 + h2 % 1990) / 1000000, 8), 'total', toDecimal64((20 + h1 % 990 + h2 % 1990) / 1000000, 8)), map()) AS provided_cost_details,
        if(type = 'GENERATION', map('input', toDecimal64((10 + h1 % 990) / 1000000, 8), 'output', toDecimal64((10 + h2 % 1990) / 1000000, 8), 'total', toDecimal64((20 + h1 % 990 + h2 % 1990) / 1000000, 8)), map()) AS cost_details,
        if(type = 'GENERATION', toDecimal64((20 + h1 % 990 + h2 % 1990) / 1000000, 8), NULL) AS total_cost,
        if(type = 'GENERATION', addMilliseconds(start_time, toUInt32(100 + h3 % 400)), NULL) AS completion_start_time,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => this.escapeString(p.id)).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_id,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => this.escapeString(p.name)).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_name,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => this.escapeString(String(p.version))).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_version,
        start_time AS created_at,
        start_time AS updated_at,
        now() AS event_ts,
        0 AS is_deleted,
        '' AS usage_pricing_tier_id,
        '' AS usage_pricing_tier_name,
        map() AS tool_definitions,
        [] AS tool_calls,
        [] AS tool_call_names

      FROM
      (
        SELECT
          number,
          xxHash32(toUInt64(number * 4 + ${seedSalt})) AS h1,
          xxHash32(toUInt64(number * 4 + 1 + ${seedSalt})) AS h2,
          xxHash32(toUInt64(number * 4 + 2 + ${seedSalt})) AS h3
        FROM numbers(${totalObservations})
      );
    `;
  }

  /**
   * Creates scores with mixed data types (NUMERIC/BOOLEAN/CATEGORICAL).
   * Use for: Large datasets, varied score distributions, synthetic metrics.
   */
  buildBulkScoresInsert(
    projectId: string,
    tracesCount: number,
    scoresPerTrace: number = 2,
    environment: string = "default",
    opts: {
      numberOfDays: number;
      idPrefix?: string;
      observationsPerTrace?: number;
      anchorSeconds?: number;
      seed?: number;
    } = { numberOfDays: 1 },
  ): string {
    const totalScores = tracesCount * scoresPerTrace;
    const observationsPerTrace = opts.observationsPerTrace ?? 5;
    const idPrefix = opts.idPrefix
      ? `${this.escapeString(opts.idPrefix)}-`
      : "";
    const escapedProjectId = this.escapeString(projectId);
    const escapedEnvironment = this.escapeString(environment);
    const idSuffix = this.escapeString(projectId.slice(-8));
    const spreadSeconds = opts.numberOfDays * 86400;
    const anchorSeconds =
      opts.anchorSeconds ?? Math.floor(Date.now() / 86_400_000) * 86_400;
    const seedSalt = (opts.seed ?? 0) >>> 0;

    return `
      INSERT INTO scores
      SELECT
        concat('${idPrefix}score-bulk-', toString(number), '-${idSuffix}') AS id,
        toDateTime(${anchorSeconds} - intDiv((number % ${Math.max(tracesCount, 1)}) * ${spreadSeconds}, ${Math.max(tracesCount, 1)}) + intDiv(number, ${Math.max(tracesCount, 1)}) * 90) AS timestamp,
        '${escapedProjectId}' AS project_id,
        '${escapedEnvironment}' AS environment,
        concat('${idPrefix}trace-bulk-', toString(number % ${tracesCount}), '-${idSuffix}') AS trace_id,
        if(traceH1 % 100 < 30, concat('${idPrefix}session_', toString(traceH2 % 100)), NULL) AS session_id,
        NULL AS dataset_run_id,
        ${
          observationsPerTrace > 0
            ? `if(h1 % 10 = 0, concat('${idPrefix}obs-bulk-', toString((number % ${tracesCount}) + ${tracesCount} * (h2 % ${observationsPerTrace})), '-${idSuffix}'), NULL)`
            : "NULL"
        } AS observation_id,
        concat('metric_', toString(nameKey + 1)) AS name,
        case 
          when (nameKey % 3) = 0 then toDecimal64((h3 % 10000) / 100, 8)
          when (nameKey % 3) = 1 then if(h3 % 2 = 0, 1, 0)
          else NULL
        end AS value,
        'API' AS source,
        'Generated synthetic score' AS comment,
        map() AS metadata,
        NULL AS author_user_id,
        NULL AS config_id,
        case 
          when (nameKey % 3) = 0 then 'NUMERIC'
          when (nameKey % 3) = 1 then 'BOOLEAN'
          else 'CATEGORICAL'
        end AS data_type,
        case 
          when (nameKey % 3) = 1 then if(value = 1, 'True', 'False')
          when (nameKey % 3) = 2 then concat('category_', toString((h1 % 5) + 1))
          else NULL
        end AS string_value,
        NULL AS queue_id,
        timestamp AS created_at,
        timestamp AS updated_at,
        now() AS event_ts,
        0 AS is_deleted,
        NULL AS execution_trace_id,
        '' AS long_string_value
      FROM
      (
        SELECT
          number,
          xxHash32(toUInt64(number * 4 + ${seedSalt})) AS h1,
          xxHash32(toUInt64(number * 4 + 1 + ${seedSalt})) AS h2,
          xxHash32(toUInt64(number * 4 + 2 + ${seedSalt})) AS h3,
          xxHash32(toUInt64((number % ${Math.max(tracesCount, 1)})) * 4 + ${seedSalt}) AS traceH1,
          xxHash32(toUInt64((number % ${Math.max(tracesCount, 1)})) * 4 + 1 + ${seedSalt}) AS traceH2,
          (number % ${scoresPerTrace * 5}) + intDiv(number, ${Math.max(tracesCount, 1)}) * ${scoresPerTrace * 5} AS nameKey
        FROM numbers(${totalScores})
      );
    `;
  }
}
