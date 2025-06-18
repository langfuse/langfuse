import {
  SEED_TEXT_PROMPTS,
  SEED_DATASETS,
} from "../seeder/postgres-seed-constants";
import {
  REALISTIC_TRACE_NAMES,
  REALISTIC_SPAN_NAMES,
  REALISTIC_GENERATION_NAMES,
  REALISTIC_MODELS,
} from "../seeder/clickhouse-seed-constants";
import { prisma } from "../src/db";
import { clickhouseClient, logger } from "../src/server";
import path from "path";
import { readFileSync } from "fs";
import { v4 } from "uuid";
import { generateDatasetRunTraceId } from "../seeder/seed-helpers";

function randn_bm(min: number, max: number, skew: number) {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0)
    num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
  else {
    num = Math.pow(num, skew); // Skew
    num *= max - min; // Stretch to fill range
    num += min; // offset to min
  }
  return num;
}

export const createEvaluationData = async (projectIds: string[]) => {
  logger.info(`Creating evaluation data for ${projectIds.length} projects.`);

  for (const projectId of projectIds) {
    logger.info(`Processing project ${projectId}`);

    // Generate a fixed timestamp for this trace
    const traceTimestamp = new Date(
      Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000),
    );
    const observationStartTime = new Date(
      traceTimestamp.getTime() + Math.floor(Math.random() * (500 - 10) + 10),
    );

    // Format timestamps for ClickHouse (YYYY-MM-DD HH:mm:ss)
    const formatTimestamp = (date: Date) => {
      return date.toISOString().split(".")[0].replace("T", " ");
    };

    const nestedJsonPath = path.join(
      __dirname,
      "../clickhouse/nested_json.json",
    );
    const heavyMarkdownPath = path.join(
      __dirname,
      "../clickhouse/markdown.txt",
    );
    const chatMlJsonPath = path.join(
      __dirname,
      "../clickhouse/chat_ml_json.json",
    );

    const nestedJsonContent = JSON.parse(readFileSync(nestedJsonPath, "utf-8"));
    const heavyMarkdownContent = readFileSync(heavyMarkdownPath, "utf-8");
    const chatMlJsonContent = JSON.parse(readFileSync(chatMlJsonPath, "utf-8"));

    const truncatedNestedJson = {
      ...nestedJsonContent,
      products: nestedJsonContent.products?.slice(0, 3) || [],
    };

    const truncatedChatMlJson = {
      ...chatMlJsonContent,
      messages: chatMlJsonContent.messages?.slice(0, 4) || [],
    };

    const escapedHeavyMarkdownContent = heavyMarkdownContent.replace(
      /'/g,
      "''",
    );
    const escapedTruncatedNestedJson = JSON.stringify(
      truncatedNestedJson,
    ).replace(/'/g, "''");
    const escapedTruncatedChatMlJson = JSON.stringify(
      truncatedChatMlJson,
    ).replace(/'/g, "''");

    const evalObservationsPerProject = 1000;
    const evalTracesPerProject = Math.floor(evalObservationsPerProject / 10); // One trace should have 10 observations
    const evalScoresPerProject = 1000;

    const evalTracesQuery = `
    INSERT INTO traces
    SELECT concat('trace-eval-', toString(number), '-${projectId.slice(-8)}') AS id,
      toDateTime('${formatTimestamp(traceTimestamp)}') AS timestamp,
      arrayElement(['${REALISTIC_TRACE_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_TRACE_NAMES.length})) AS name,
      if(randUniform(0, 1) < 0.3, concat('user_', toString(rand() % 1000)), NULL) AS user_id,
      map('key', 'value') AS metadata,
      if(randUniform(0, 1) < 0.4, concat('v', toString(randUniform(1, 5)), '.', toString(randUniform(0, 10))), NULL) AS release,
      if(randUniform(0, 1) < 0.4, concat('v', toString(randUniform(1, 3)), '.', toString(randUniform(0, 20))), NULL) AS version,
      '${projectId}' AS project_id,
      'langfuse-evaluation' AS environment,
      if(rand() < 0.8, true, false) as public,
      if(rand() < 0.1, true, false) as bookmarked,
      if(rand() < 0.3, array('production', 'ai-agent'), array()) as tags,
      if(randUniform(0, 1) < 0.3, '${escapedHeavyMarkdownContent}',
        '${escapedTruncatedChatMlJson}'
      ) AS input,
      if(randUniform(0, 1) < 0.2, '${escapedTruncatedNestedJson}',
        '${escapedTruncatedChatMlJson}'
      ) AS output,
      NULL AS session_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM numbers(${evalTracesPerProject});
  `;

    const evalObservationsQuery = `
    INSERT INTO observations
    SELECT concat('observation-eval-', toString(number), '-${projectId.slice(-8)}') AS id,
      concat('trace-eval-', toString(number % ${evalTracesPerProject}), '-${projectId.slice(-8)}') AS trace_id,
      '${projectId}' AS project_id,
      'langfuse-evaluation' AS environment,
      if(randUniform(0, 1) < 0.47, 'GENERATION', if(randUniform(0, 1) < 0.94, 'SPAN', 'EVENT')) AS type,
      if(number % 6 = 0, NULL, toString(number - 1)) AS parent_observation_id,
      toDateTime('${formatTimestamp(observationStartTime)}') AS start_time,
      addMilliseconds(start_time,
        case
          when "type" = 'GENERATION' then floor(randUniform(5, 30))
          when "type" = 'SPAN' then floor(randUniform(1, 50))
          else floor(randUniform(1, 10))
        end) AS end_time,
      case
        when "type" = 'GENERATION' then arrayElement(['${REALISTIC_GENERATION_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_GENERATION_NAMES.length}))
        when "type" = 'SPAN' then arrayElement(['${REALISTIC_SPAN_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_SPAN_NAMES.length}))
        else concat('event_', toString(number % 10))
      end AS name,
      map('key', 'value') AS metadata,
      if(randUniform(0, 1) < 0.85, 'DEFAULT', if(randUniform(0, 1) < 0.7, 'DEBUG', if(randUniform(0, 1) < 0.3, 'ERROR', 'WARNING'))) AS level,
      NULL AS status_message,
      NULL AS version,
      if(randUniform(0, 1) < 0.4, '${escapedHeavyMarkdownContent}',
        '${escapedTruncatedChatMlJson}'
      ) AS input,
      if(randUniform(0, 1) < 0.3, '${escapedTruncatedNestedJson}',
        '${escapedTruncatedChatMlJson}'
      ) AS output,
      if("type" = 'GENERATION',
        arrayElement(['${REALISTIC_MODELS.map((model) => model.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_MODELS.length})),
        NULL) as provided_model_name,
      if("type" = 'GENERATION',
        concat('model_', toString(rand() % 1000)),
        NULL) as internal_model_id,
      if("type" = 'GENERATION',
        '{"temperature": 0.7}',
        '{}') AS model_parameters,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))),
        map()) AS provided_usage_details,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))),
        map()) AS usage_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)),
        map()) AS provided_cost_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)),
        map()) AS cost_details,
      if("type" = 'GENERATION',
        toDecimal64(randUniform(0.00002, 0.003), 8),
        NULL) AS total_cost,
      if("type" = 'GENERATION',
        addMilliseconds(start_time, floor(randUniform(100, 500))),
        NULL) AS completion_start_time,
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
    FROM numbers(${evalObservationsPerProject});
  `;

    const evalScoresQuery = `
    INSERT INTO scores
    SELECT concat('score-eval-', toString(number), '-${projectId.slice(-8)}') AS id,
      toDateTime('${formatTimestamp(observationStartTime)}') AS timestamp,
      '${projectId}' AS project_id,
      'langfuse-evaluation' AS environment,
      concat('trace-eval-', toString(floor(randUniform(0, ${evalTracesPerProject}))), '-${projectId.slice(-8)}') AS trace_id,
      NULL AS session_id,
      NULL AS dataset_run_id,
      NULL AS observation_id,
      concat('name_', toString(rand() % 10)) AS name,
      case
        when score_type = 1 then NULL
        when score_type = 2 then if(number % 2 = 0, 1, 0)
        else randUniform(0, 100)
      end as value,
      'API' as source,
      'comment' as comment,
      map('prototype', 'test') AS metadata,
      toString(rand() % 100) as author_user_id,
      toString(rand() % 100) as config_id,
      case
        when score_type = 0 then 'NUMERIC'
        when score_type = 1 then 'CATEGORICAL'
        else 'BOOLEAN'
      end as data_type,
      case
        when score_type = 0 then NULL
        when score_type = 1 then concat('category_', toString(number % 5))
        else if(number % 2 = 0, 'true', 'false')
      end as string_value,
      NULL as queue_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM (
      SELECT number,
        number % 3 as score_type
      FROM numbers(${evalScoresPerProject})
    );
  `;

    const queries = [evalTracesQuery, evalObservationsQuery, evalScoresQuery];

    for (const query of queries) {
      logger.info(`Executing query: ${query}`);
      await clickhouseClient().command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });
    }
  }
};

// Function to create dataset-based traces with experiment data
export const createDatasetExperimentData = async (
  projectIds: string[],
  opts: {
    numberOfDays: number;
    numberOfRuns: number;
  },
) => {
  logger.info(
    `Creating dataset experiment data for ${projectIds.length} projects.`,
  );

  for (const projectId of projectIds) {
    logger.info(`Processing project ${projectId}`);

    // Create datasets and dataset runs first
    for (let runNumber = 0; runNumber < opts.numberOfRuns; runNumber++) {
      logger.info(
        `Processing run ${runNumber + 1}/${opts.numberOfRuns} for project ${projectId}`,
      );

      for (const seedDataset of SEED_DATASETS) {
        // Now create traces, observations, and dataset run items
        seedDataset.items.forEach(async (datasetItem, i) => {
          // Create input and output based on dataset type
          let traceInput: string;
          let traceOutput: string;

          if (seedDataset.name === "demo-countries-dataset") {
            const countryData = datasetItem as {
              input: { country: string };
              output: string;
            };
            traceInput = `What is the capital of ${countryData.input.country}?`;
            traceOutput = `The capital of ${countryData.input.country} is ${countryData.output}.`;
          } else if (
            seedDataset.name === "demo-english-transcription-dataset"
          ) {
            const ipaData = datasetItem as {
              input: { word: string };
              output: string;
            };
            traceInput = `What is the IPA transcription of the word "${ipaData.input.word}"?`;
            traceOutput = `The IPA transcription of "${ipaData.input.word}" is ${ipaData.output}.`;
          } else {
            // Fallback for other datasets
            traceInput = JSON.stringify(datasetItem.input);
            traceOutput = JSON.stringify(datasetItem.output);
          }

          // Escape quotes for SQL
          const escapedInput = traceInput.replace(/'/g, "''");
          const escapedOutput = traceOutput.replace(/'/g, "''");

          // Create unique trace ID
          const traceId = generateDatasetRunTraceId(
            seedDataset.name,
            i,
            projectId,
            runNumber,
          );

          // Generate a fixed timestamp for this trace
          const traceTimestamp = new Date(
            Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000),
          );
          const observationStartTime = new Date(
            traceTimestamp.getTime() +
              Math.floor(Math.random() * (500 - 10) + 10),
          );

          // Format timestamps for ClickHouse (YYYY-MM-DD HH:mm:ss)
          const formatTimestamp = (date: Date) => {
            return date.toISOString().split(".")[0].replace("T", " ");
          };

          // Insert trace into ClickHouse
          const traceQuery = `
          INSERT INTO traces
          SELECT concat(toString(number), '-${traceId}') AS id,
            toDateTime('${formatTimestamp(traceTimestamp)}') AS timestamp,
            'dataset-run-item-${v4()}' AS name,
            NULL AS user_id,
            map('experimentType', 'langfuse-prompt-experiments') AS metadata,
            NULL AS release,
            NULL AS version,
            '${projectId}' AS project_id,
            'langfuse-prompt-experiments' AS environment,
            false as public,
            false as bookmarked,
            array() as tags,
            '${escapedInput}' AS input,
            '${escapedOutput}' AS output,
            NULL AS session_id,
            timestamp AS created_at,
            timestamp AS updated_at,
            timestamp AS event_ts,
            0 AS is_deleted
           FROM numbers(1);
        `;

          await clickhouseClient().command({
            query: traceQuery,
            clickhouse_settings: {
              wait_end_of_query: 1,
            },
          });

          // Create unique observation ID
          const observationId = `observation-dataset-${seedDataset.name}-${i}-${projectId.slice(-8)}`;

          const observationQuery = `
          INSERT INTO observations
          SELECT concat(toString(number), '-${observationId}') AS id,
            concat(toString(number), '-${traceId}') AS trace_id,
            '${projectId}' AS project_id,
            'langfuse-prompt-experiments' AS environment,
            'GENERATION' AS type,
            NULL AS parent_observation_id,
            toDateTime('${formatTimestamp(observationStartTime)}') AS start_time,
            addMilliseconds(start_time,
              case
                when "type" = 'GENERATION' then floor(randUniform(5, 30))
                when "type" = 'SPAN' then floor(randUniform(1, 50))
                else floor(randUniform(1, 10))
              end) AS end_time,
            'dataset-generation-${i}' AS name,
            map('experimentType', 'langfuse-prompt-experiments') AS metadata,
            'DEFAULT' AS level,
            NULL AS status_message,
            NULL AS version,
            '${escapedInput}' AS input,
            '${escapedOutput}' AS output,
            'gpt-3.5-turbo' as provided_model_name,
            'model_123' as internal_model_id,
            '{"temperature": 0.7}' AS model_parameters,
            map('input', toUInt64(50), 'output', toUInt64(20), 'total', toUInt64(70)) AS provided_usage_details,
            map('input', toUInt64(50), 'output', toUInt64(20), 'total', toUInt64(70)) AS usage_details,
            map('input', toDecimal64(0.0001, 8), 'output', toDecimal64(0.0002, 8), 'total', toDecimal64(0.0003, 8)) AS provided_cost_details,
            map('input', toDecimal64(0.0001, 8), 'output', toDecimal64(0.0002, 8), 'total', toDecimal64(0.0003, 8)) AS cost_details,
            toDecimal64(0.0003, 8) AS total_cost,
            if("type" = 'GENERATION',
            addMilliseconds(start_time, floor(randUniform(100, 500))),
            NULL) AS completion_start_time,
            NULL AS prompt_id,
            NULL AS prompt_name,
            NULL AS prompt_version,
            start_time AS created_at,
            start_time AS updated_at,
            start_time AS event_ts,
            0 AS is_deleted
          FROM numbers(1);
        `;

          await clickhouseClient().command({
            query: observationQuery,
            clickhouse_settings: {
              wait_end_of_query: 1,
            },
          });
        });
      }
    }
  }
};

export const prepareClickhouse = async (
  projectIds: string[],
  opts: {
    numberOfDays: number;
    totalObservations: number;
    numberOfRuns: number;
  },
) => {
  logger.info(
    `Preparing Clickhouse for ${projectIds.length} projects and ${opts.numberOfDays} days.`,
  );

  await createDatasetExperimentData(projectIds, opts);
  await createEvaluationData(projectIds);

  const projectData = projectIds.map((projectId) => {
    const observationsPerProject = Math.ceil(
      randn_bm(0, opts.totalObservations, 2),
    ); // Skew the number of observations

    const tracesPerProject = Math.floor(observationsPerProject / 25); // On average, one trace should have 25 observations
    const scoresPerProject = tracesPerProject * 10; // On average, one trace should have 10 scores
    return {
      projectId,
      observationsPerProject,
      tracesPerProject,
      scoresPerProject,
    };
  });

  for (const data of projectData) {
    const {
      projectId,
      tracesPerProject,
      observationsPerProject,
      scoresPerProject,
    } = data;
    logger.info(
      `Preparing Clickhouse for ${projectId}: Traces: ${tracesPerProject}, Scores: ${scoresPerProject}, Observations: ${observationsPerProject}`,
    );

    // Read content from files
    const nestedJsonPath = path.join(
      __dirname,
      "../clickhouse/nested_json.json",
    );
    const heavyMarkdownPath = path.join(
      __dirname,
      "../clickhouse/markdown.txt",
    );
    const chatMlJsonPath = path.join(
      __dirname,
      "../clickhouse/chat_ml_json.json",
    );

    const nestedJsonContent = JSON.parse(readFileSync(nestedJsonPath, "utf-8"));
    const heavyMarkdownContent = readFileSync(heavyMarkdownPath, "utf-8");
    const chatMlJsonContent = JSON.parse(readFileSync(chatMlJsonPath, "utf-8"));

    const truncatedNestedJson = {
      ...nestedJsonContent,
      products: nestedJsonContent.products?.slice(0, 3) || [],
    };

    const truncatedChatMlJson = {
      ...chatMlJsonContent,
      messages: chatMlJsonContent.messages?.slice(0, 4) || [],
    };

    const escapedHeavyMarkdownContent = heavyMarkdownContent.replace(
      /'/g,
      "''",
    );
    const escapedTruncatedNestedJson = JSON.stringify(
      truncatedNestedJson,
    ).replace(/'/g, "''");
    const escapedTruncatedChatMlJson = JSON.stringify(
      truncatedChatMlJson,
    ).replace(/'/g, "''");

    const tracesQuery = `
    INSERT INTO traces
    SELECT toString(number) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      arrayElement(['${REALISTIC_TRACE_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_TRACE_NAMES.length})) AS name,
      if(randUniform(0, 1) < 0.3, concat('user_', toString(rand() % 1000)), NULL) AS user_id,
      map('key', 'value') AS metadata,
      if(randUniform(0, 1) < 0.4, concat('v', toString(randUniform(1, 5)), '.', toString(randUniform(0, 10))), NULL) AS release,
      if(randUniform(0, 1) < 0.4, concat('v', toString(randUniform(1, 3)), '.', toString(randUniform(0, 20))), NULL) AS version,
      '${projectId}' AS project_id,
      'default' AS environment,
      if(rand() < 0.8, true, false) as public,
      if(rand() < 0.1, true, false) as bookmarked,
      if(rand() < 0.3, array('production', 'ai-agent'), array()) as tags,
      if(randUniform(0, 1) < 0.3, '${escapedHeavyMarkdownContent}',
        '${escapedTruncatedChatMlJson}'
      ) AS input,
      if(randUniform(0, 1) < 0.2, '${escapedTruncatedNestedJson}',
        '${escapedTruncatedChatMlJson}'
      ) AS output,
      if(randUniform(0, 1) < 0.3, NULL, concat('session_', toString(rand() % 1000))) AS session_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM numbers(${tracesPerProject});
  `;

    const observationsQuery = `
    INSERT INTO observations
    SELECT toString(number) AS id,
      toString(number % ${tracesPerProject}) AS trace_id,
      '${projectId}' AS project_id,
      'default' AS environment,
      if(randUniform(0, 1) < 0.47, 'GENERATION', if(randUniform(0, 1) < 0.94, 'SPAN', 'EVENT')) AS type,
      if(number % 6 = 0, NULL, toString(number - 1)) AS parent_observation_id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS start_time,
      addMilliseconds(start_time,
        case
          when "type" = 'GENERATION' then floor(randUniform(5, 30))
          when "type" = 'SPAN' then floor(randUniform(1, 50))
          else floor(randUniform(1, 10))
        end) AS end_time,
      case
        when "type" = 'GENERATION' then arrayElement(['${REALISTIC_GENERATION_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_GENERATION_NAMES.length}))
        when "type" = 'SPAN' then arrayElement(['${REALISTIC_SPAN_NAMES.map((name) => name.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_SPAN_NAMES.length}))
        else concat('event_', toString(number % 10))
      end AS name,
      map('key', 'value') AS metadata,
      if(randUniform(0, 1) < 0.85, 'DEFAULT', if(randUniform(0, 1) < 0.7, 'DEBUG', if(randUniform(0, 1) < 0.3, 'ERROR', 'WARNING'))) AS level,
      NULL AS status_message,
      NULL AS version,
      if("type" = 'GENERATION',
        if(randUniform(0, 1) < 0.4, '${escapedHeavyMarkdownContent}',
          '${escapedTruncatedChatMlJson}'
        ),
        NULL) AS input,
      if("type" = 'GENERATION',
        if(randUniform(0, 1) < 0.3, '${escapedTruncatedNestedJson}',
          '${escapedTruncatedChatMlJson}'
        ),
        NULL) AS output,
      if("type" = 'GENERATION',
        arrayElement(['${REALISTIC_MODELS.map((model) => model.replace(/'/g, "''")).join("','")}'], 1 + (number % ${REALISTIC_MODELS.length})),
        NULL) as provided_model_name,
      if("type" = 'GENERATION',
        concat('model_', toString(rand() % 1000)),
        NULL) as internal_model_id,
      if("type" = 'GENERATION',
        '{"temperature": 0.7}',
        '{}') AS model_parameters,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))),
        map()) AS provided_usage_details,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(20, 200)), 'output', toUInt64(randUniform(10, 100)), 'total', toUInt64(randUniform(30, 300))),
        map()) AS usage_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)),
        map()) AS provided_cost_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0.00001, 0.001), 8), 'output', toDecimal64(randUniform(0.00001, 0.002), 8), 'total', toDecimal64(randUniform(0.00002, 0.003), 8)),
        map()) AS cost_details,
      if("type" = 'GENERATION',
        toDecimal64(randUniform(0.00002, 0.003), 8),
        NULL) AS total_cost,
      if("type" = 'GENERATION',
        addMilliseconds(start_time, floor(randUniform(100, 500))),
        NULL) AS completion_start_time,
      if("type" = 'GENERATION' AND rand() < 0.3,
        array(${SEED_TEXT_PROMPTS.map((p) => `'${p.id}'`).join(
          ",",
        )})[(number % ${SEED_TEXT_PROMPTS.length})+1],
        NULL) AS prompt_id,
      if("type" = 'GENERATION' AND rand() < 0.3,
        array(${SEED_TEXT_PROMPTS.map((p) => `'${p.name}'`).join(
          ",",
        )})[(number % ${SEED_TEXT_PROMPTS.length})+1],
        NULL) AS prompt_name,
      if("type" = 'GENERATION' AND rand() < 0.3,
        array(${SEED_TEXT_PROMPTS.map((p) => `'${p.version}'`).join(
          ",",
        )})[(number % ${SEED_TEXT_PROMPTS.length})+1],
        NULL) AS prompt_version,
      start_time AS created_at,
      start_time AS updated_at,
      start_time AS event_ts,
      0 AS is_deleted
    FROM numbers(${observationsPerProject});
  `;

    const scoresQuery = `
    INSERT INTO scores
    SELECT toString(number) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      '${projectId}' AS project_id,
      'default' AS environment,
      toString(floor(randUniform(0, ${tracesPerProject}))) AS trace_id,
      NULL AS session_id,
      NULL AS dataset_run_id,
      if(
        rand() > 0.9,
        toString(floor(randUniform(0, ${observationsPerProject}))),
        NULL
      ) AS observation_id,
      concat('name_', toString(rand() % 10)) AS name,
      case
        when score_type = 1 then NULL
        when score_type = 2 then if(number % 2 = 0, 1, 0)
        else randUniform(0, 100)
      end as value,
      'API' as source,
      'comment' as comment,
      map('prototype', 'test') AS metadata,
      toString(rand() % 100) as author_user_id,
      toString(rand() % 100) as config_id,
      case
        when score_type = 0 then 'NUMERIC'
        when score_type = 1 then 'CATEGORICAL'
        else 'BOOLEAN'
      end as data_type,
      case
        when score_type = 0 then NULL
        when score_type = 1 then concat('category_', toString(number % 5))
        else if(number % 2 = 0, 'true', 'false')
      end as string_value,
      NULL as queue_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM (
      SELECT number,
        number % 3 as score_type
      FROM numbers(${scoresPerProject})
    );
  `;

    const queries = [tracesQuery, scoresQuery, observationsQuery];

    for (const query of queries) {
      logger.info(`Executing query: ${query}`);
      await clickhouseClient().command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });
    }
    // we also need to upsert trace sessions in postgres

    const sessionQuery = `
      SELECT session_id, project_id
      FROM traces
      WHERE session_id IS NOT NULL;
    `;
    const sessionResult = await clickhouseClient().query({
      query: sessionQuery,
      format: "JSONEachRow",
    });

    const sessionData = await sessionResult.json<{
      session_id: string;
      project_id: string;
    }>();

    const sessionsToScore = sessionData
      .filter(() => Math.random() < 0.5)
      .slice(0, Math.min(500, sessionData.length));

    if (sessionsToScore.length > 0) {
      // Generate session scores query with specific session IDs
      const sessionScoresQuery = `
        INSERT INTO scores
        SELECT
          concat('session-', toString(number)) AS id,
          toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
          '${projectId}' AS project_id,
          'default' AS environment,
          NULL AS trace_id,
          arrayElement(['${sessionsToScore.map((s) => s.session_id).join("','")}'], 1 + (number % ${sessionsToScore.length})) AS session_id,
          NULL AS dataset_run_id,
          NULL AS observation_id,
          concat('session_quality_', toString(rand() % 10)) AS name,
          randUniform(0, 100) AS value,
          'API' AS source,
          'Session-level assessment score' AS comment,
          map('key', 'value') AS metadata,
          toString(rand() % 100) AS author_user_id,
          toString(rand() % 100) AS config_id,
          if(rand() < 0.33, 'NUMERIC', if(rand() < 0.5, 'CATEGORICAL', 'BOOLEAN')) AS data_type,
          toString(rand() % 100) AS string_value,
          NULL AS queue_id,
          timestamp AS created_at,
          timestamp AS updated_at,
          timestamp AS event_ts,
          0 AS is_deleted
        FROM numbers(${sessionsToScore.length})
      `;

      await clickhouseClient().command({
        query: sessionScoresQuery,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });
    }

    const idProjectIdCombinations = sessionData.map((session) => ({
      id: session.session_id,
      projectId: session.project_id,
      public: Math.random() < 0.1,
      bookmarked: Math.random() < 0.1,
    }));

    await prisma.traceSession.createMany({
      data: idProjectIdCombinations,
      skipDuplicates: true,
    });
  }

  const tables = ["traces", "scores", "observations"];
  for (const table of tables) {
    const query = `
            SELECT
            project_id,
            count() AS per_project_count,
            bar(per_project_count, 0, (
                SELECT count(*)
                FROM ${table}
            ), 50) AS bar_representation
          FROM ${table}
          GROUP BY project_id
          ORDER BY count() desc
          `;

    const result = await clickhouseClient().query({
      query,
      format: "TabSeparated",
    });

    logger.info(
      `${table.charAt(0).toUpperCase() + table.slice(1)} per Project: \n` +
        (await result.text()),
    );
  }

  const tablesWithDateColumns = [
    { name: "traces", dateColumn: "timestamp" },
    { name: "scores", dateColumn: "timestamp" },
    { name: "observations", dateColumn: "start_time" },
  ];

  for (const { name: table, dateColumn } of tablesWithDateColumns) {
    const query = `
            SELECT
            toDate(${dateColumn}) AS event_date,
            count() AS per_date_count,
            bar(per_date_count, 0, (
                SELECT count(*)
                FROM ${table}
            ), 50) AS bar_representation
          FROM ${table}
          GROUP BY event_date
          ORDER BY event_date desc
          `;

    const result = await clickhouseClient().query({
      query,
      format: "TabSeparated",
    });

    logger.info(
      `${table.charAt(0).toUpperCase() + table.slice(1)} per Date: \n` +
        (await result.text()),
    );
  }
};
