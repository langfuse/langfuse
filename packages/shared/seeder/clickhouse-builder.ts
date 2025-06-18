import { SEED_TEXT_PROMPTS } from "./postgres-seed-constants";
import { TraceData, ObservationData, ScoreData } from "./types";

export class ClickHouseQueryBuilder {
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "string") {
      return `'${this.escapeString(value)}'`;
    }
    if (typeof value === "object") {
      return `'${this.escapeString(JSON.stringify(value))}'`;
    }
    return String(value);
  }

  private formatArray(arr: string[]): string {
    if (!arr || arr.length === 0) return "array()";
    return `array(${arr.map((item) => `'${this.escapeString(item)}'`).join(", ")})`;
  }

  private formatMap(obj: Record<string, any>): string {
    if (!obj || Object.keys(obj).length === 0) return "map()";
    const entries = Object.entries(obj).map(
      ([key, value]) =>
        `'${this.escapeString(key)}', ${this.formatValue(value)}`,
    );
    return `map(${entries.join(", ")})`;
  }

  buildTracesInsert(
    projectId: string,
    traces: TraceData[],
    batchSize: number = 1000,
  ): string {
    const chunks = this.chunkArray(traces, batchSize);

    return chunks
      .map((chunk) => {
        const values = chunk
          .map(
            (trace) => `(
        '${trace.id}',
        toDateTime('${new Date().toISOString().slice(0, 19).replace("T", " ")}'),
        ${this.formatValue(trace.name)},
        ${this.formatValue(trace.userId)},
        ${this.formatMap(trace.metadata || {})},
        ${this.formatValue(trace.release)},
        ${this.formatValue(trace.version)},
        '${projectId}',
        '${trace.environment}',
        ${trace.public ?? false},
        ${trace.bookmarked ?? false},
        ${this.formatArray(trace.tags || [])},
        ${this.formatValue(trace.input)},
        ${this.formatValue(trace.output)},
        ${this.formatValue(trace.sessionId)},
        now(),
        now(),
        now(),
        0
      )`,
          )
          .join(",\n      ");

        return `
        INSERT INTO traces (
          id, timestamp, name, user_id, metadata, release, version,
          project_id, environment, public, bookmarked, tags,
          input, output, session_id, created_at, updated_at, event_ts, is_deleted
        ) VALUES ${values};
      `;
      })
      .join("\n");
  }

  buildObservationsInsert(
    projectId: string,
    observations: ObservationData[],
    batchSize: number = 1000,
  ): string {
    const chunks = this.chunkArray(observations, batchSize);

    return chunks
      .map((chunk) => {
        const values = chunk
          .map(
            (obs) => `(
        '${obs.id}',
        '${obs.traceId}',
        '${projectId}',
        '${obs.environment}',
        '${obs.type}',
        ${this.formatValue(obs.parentObservationId)},
        toDateTime('${new Date().toISOString().slice(0, 19).replace("T", " ")}'),
        addMilliseconds(toDateTime('${new Date().toISOString().slice(0, 19).replace("T", " ")}'), ${100 + Math.floor(Math.random() * 900)}),
        ${this.formatValue(obs.name)},
        ${this.formatMap({})},
        '${obs.level || "DEFAULT"}',
        NULL,
        NULL,
        ${this.formatValue(obs.input)},
        ${this.formatValue(obs.output)},
        ${this.formatValue(obs.model)},
        NULL,
        ${this.formatValue(JSON.stringify(obs.modelParameters || {}))},
        ${this.formatMap(obs.usageDetails || {})},
        ${this.formatMap(obs.usageDetails || {})},
        ${this.formatMap(obs.costDetails || {})},
        ${this.formatMap(obs.costDetails || {})},
        ${obs.costDetails?.total || "NULL"},
        NULL,
        NULL,
        NULL,
        NULL,
        now(),
        now(),
        now(),
        0
      )`,
          )
          .join(",\n      ");

        return `
        INSERT INTO observations (
          id, trace_id, project_id, environment, type, parent_observation_id,
          start_time, end_time, name, metadata, level, status_message, version,
          input, output, provided_model_name, internal_model_id, model_parameters,
          provided_usage_details, usage_details, provided_cost_details, cost_details,
          total_cost, completion_start_time, prompt_id, prompt_name, prompt_version,
          created_at, updated_at, event_ts, is_deleted
        ) VALUES ${values};
      `;
      })
      .join("\n");
  }

  buildScoresInsert(
    projectId: string,
    scores: ScoreData[],
    batchSize: number = 1000,
  ): string {
    const chunks = this.chunkArray(scores, batchSize);

    return chunks
      .map((chunk) => {
        const values = chunk
          .map(
            (score) => `(
        '${score.id}',
        toDateTime('${new Date().toISOString().slice(0, 19).replace("T", " ")}'),
        '${projectId}',
        '${score.environment}',
        ${this.formatValue(score.traceId)},
        ${this.formatValue(score.sessionId)},
        NULL,
        ${this.formatValue(score.observationId)},
        ${this.formatValue(score.name)},
        ${score.value !== undefined ? score.value : "NULL"},
        '${score.source}',
        ${this.formatValue(score.comment)},
        ${this.formatMap({})},
        NULL,
        NULL,
        '${score.dataType}',
        ${this.formatValue(score.stringValue)},
        NULL,
        now(),
        now(),
        now(),
        0
      )`,
          )
          .join(",\n      ");

        return `
        INSERT INTO scores (
          id, timestamp, project_id, environment, trace_id, session_id,
          dataset_run_id, observation_id, name, value, source, comment,
          metadata, author_user_id, config_id, data_type, string_value,
          queue_id, created_at, updated_at, event_ts, is_deleted
        ) VALUES ${values};
      `;
      })
      .join("\n");
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // For large datasets, use the numbers() function approach for better performance
  buildBulkTracesInsert(
    projectId: string,
    count: number,
    environment: string = "default",
    fileContent?: { heavyMarkdown: string; nestedJson: any; chatMlJson: any },
    opts: { numberOfDays: number } = { numberOfDays: 1 },
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

    return `
      INSERT INTO traces
      SELECT 
        concat('trace-bulk-', toString(number), '-${projectId.slice(-8)}') AS id,
        toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
        concat('trace-', toString(number % 10)) AS name,
        if(randUniform(0, 1) < 0.3, concat('user_', toString(rand() % 1000)), NULL) AS user_id,
        map('generated', 'bulk') AS metadata,
        NULL AS release,
        NULL AS version,
        '${projectId}' AS project_id,
        '${environment}' AS environment,
        if(rand() < 0.8, true, false) AS public,
        if(rand() < 0.1, true, false) AS bookmarked,
        array() AS tags,
        if(randUniform(0, 1) < 0.3, '${escapedHeavyMarkdown}',
          '${escapedChatMl}'
        ) AS input,
        if(randUniform(0, 1) < 0.2, '${escapedNestedJson}',
          '${escapedChatMl}'
        ) AS output,
        if(randUniform(0, 1) < 0.3, concat('session_', toString(rand() % 100)), NULL) AS session_id,
        now() AS created_at,
        now() AS updated_at,
        now() AS event_ts,
        0 AS is_deleted
      FROM numbers(${count});
    `;
  }

  buildBulkObservationsInsert(
    projectId: string,
    tracesCount: number,
    observationsPerTrace: number = 5,
    environment: string = "default",
    fileContent?: { heavyMarkdown: string; nestedJson: any; chatMlJson: any },
    opts: { numberOfDays: number } = { numberOfDays: 1 },
  ): string {
    const totalObservations = tracesCount * observationsPerTrace;

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

    return `
      INSERT INTO observations
      SELECT 
        concat('obs-bulk-', toString(number), '-${projectId.slice(-8)}') AS id,
        concat('trace-bulk-', toString(number % ${tracesCount}), '-${projectId.slice(-8)}') AS trace_id,
        '${projectId}' AS project_id,
        '${environment}' AS environment,
        if(randUniform(0, 1) < 0.47, 'GENERATION', if(randUniform(0, 1) < 0.94, 'SPAN', 'EVENT')) AS type,
        if(number % 6 = 0, NULL, toString(number - 1)) AS parent_observation_id,
        toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS start_time,
        addMilliseconds(start_time, 
          case 
            when type = 'GENERATION' then floor(randUniform(5, 30))
            when type = 'SPAN' then floor(randUniform(1, 50))
            else floor(randUniform(1, 10))
          end) AS end_time,
        case
          when type = 'GENERATION' then concat('generation-', toString(number % 10))
          when type = 'SPAN' then concat('span-', toString(number % 10))
          else concat('event-', toString(number % 10))
        end AS name,
        map('key', 'value') AS metadata,
        if(randUniform(0, 1) < 0.85, 'DEFAULT', if(randUniform(0, 1) < 0.7, 'DEBUG', if(randUniform(0, 1) < 0.3, 'ERROR', 'WARNING'))) AS level,
        NULL AS status_message,
        NULL AS version,
        if(type = 'GENERATION', 
          if(randUniform(0, 1) < 0.4, '${escapedHeavyMarkdown}', '${escapedChatMl}'),
          NULL) AS input,
        if(type = 'GENERATION', 
          if(randUniform(0, 1) < 0.3, '${escapedNestedJson}', '${escapedChatMl}'),
          NULL) AS output,
        if(type = 'GENERATION', 'gpt-4', NULL) AS provided_model_name,
        if(type = 'GENERATION', concat('model_', toString(rand() % 1000)), NULL) AS internal_model_id,
        if(type = 'GENERATION', '{"temperature": 0.7}', '{}') AS model_parameters,
        if(type = 'GENERATION', map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))), map()) AS provided_usage_details,
        if(type = 'GENERATION', map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))), map()) AS usage_details,
        if(type = 'GENERATION', map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)), map()) AS provided_cost_details,
        if(type = 'GENERATION', map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)), map()) AS cost_details,
        if(type = 'GENERATION', toDecimal64(randUniform(0.00002, 0.003), 8), NULL) AS total_cost,
        if(type = 'GENERATION', addMilliseconds(start_time, floor(randUniform(100, 500))), NULL) AS completion_start_time,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => p.id).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_id,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => p.name).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_name,
        if("type" = 'GENERATION' AND number % 10 = 0,
        arrayElement(['${SEED_TEXT_PROMPTS.map((p) => p.version).join("','")}'], 1 + (number % ${SEED_TEXT_PROMPTS.length})),
        NULL) AS prompt_version,
        start_time AS created_at,
        start_time AS updated_at,
        start_time AS event_ts,
        0 AS is_deleted
      FROM numbers(${totalObservations});
    `;
  }

  buildBulkScoresInsert(
    projectId: string,
    tracesCount: number,
    scoresPerTrace: number = 2,
    environment: string = "default",
    opts: { numberOfDays: number } = { numberOfDays: 1 },
  ): string {
    const totalScores = tracesCount * scoresPerTrace;

    return `
      INSERT INTO scores
      SELECT 
        concat('score-bulk-', toString(number), '-${projectId.slice(-8)}') AS id,
        toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
        '${projectId}' AS project_id,
        '${environment}' AS environment,
        concat('trace-bulk-', toString(number % ${tracesCount}), '-${projectId.slice(-8)}') AS trace_id,
        if(randUniform(0, 1) < 0.3, concat('session_', toString(rand() % 100)), NULL) AS session_id,
        NULL AS dataset_run_id,
        if(randUniform(0, 1) < 0.1, concat('obs-bulk-', toString(rand() % (${tracesCount} * 5)), '-${projectId.slice(-8)}'), NULL) AS observation_id,
        concat('metric_', toString((number % ${scoresPerTrace}) + 1)) AS name,
        case 
          when (number % 3) = 0 then toDecimal64(randUniform(0, 100), 8)
          when (number % 3) = 1 then if(randUniform(0, 1) < 0.5, 1, 0)
          else NULL
        end AS value,
        'API' AS source,
        'Generated synthetic score' AS comment,
        map() AS metadata,
        NULL AS author_user_id,
        NULL AS config_id,
        case 
          when (number % 3) = 0 then 'NUMERIC'
          when (number % 3) = 1 then 'BOOLEAN'
          else 'CATEGORICAL'
        end AS data_type,
        case 
          when (number % 3) = 1 then if(value = 1, 'true', 'false')
          when (number % 3) = 2 then concat('category_', toString((rand() % 5) + 1))
          else NULL
        end AS string_value,
        NULL AS queue_id,
        timestamp AS created_at,
        timestamp AS updated_at,
        timestamp AS event_ts,
        0 AS is_deleted
      FROM numbers(${totalScores});
    `;
  }
}
