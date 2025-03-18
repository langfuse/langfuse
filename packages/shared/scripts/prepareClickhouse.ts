import { SEED_PROMPTS } from "../prisma/seed";
import { prisma } from "../src/db";
import { clickhouseClient, logger } from "../src/server";

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

export const prepareClickhouse = async (
  projectIds: string[],
  opts: {
    numberOfDays: number;
    totalObservations: number;
  },
) => {
  logger.info(
    `Preparing Clickhouse for ${projectIds.length} projects and ${opts.numberOfDays} days.`,
  );

  const projectData = projectIds.map((projectId) => {
    const observationsPerProject = Math.ceil(
      randn_bm(0, opts.totalObservations, 2),
    ); // Skew the number of observations

    const tracesPerProject = Math.floor(observationsPerProject / 6); // On average, one trace should have 6 observations
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

    const tracesQuery = `
    INSERT INTO traces
    SELECT toString(number) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      concat('name_', toString(rand() % 100)) AS name,
      concat('user_id_', toInt64(randExponential(1 / 100))) AS user_id,
      map('key', 'value') AS metadata,
      concat('release_', toString(randUniform(0, 100))) AS release,
      concat('version_', toString(randUniform(0, 100))) AS version,
      '${projectId}' AS project_id,
      'default' AS environment,
      if(rand() < 0.8, true, false) as public,
      if(rand() < 0.8, true, false) as bookmarked,
      array('tag1', 'tag2') as tags,
      repeat('input', toInt64(randExponential(1 / 100))) AS input,
      repeat('output', toInt64(randExponential(1 / 100))) AS output,
      if(randUniform(0, 1) < 0.2, NULL, concat('session_', toString(rand() % 1000))) AS session_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM numbers(${tracesPerProject});
  `;

    const observationsQuery = `
    INSERT INTO observations
    SELECT toString(number) AS id,
      toString(floor(randUniform(0, ${tracesPerProject}))) AS trace_id,
      '${projectId}' AS project_id,
      'default' AS environment,
      if(randUniform(0, 1) < 0.47, 'GENERATION', if(randUniform(0, 1) < 0.94, 'SPAN', 'EVENT')) AS type,
      toString(rand()) AS parent_observation_id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS start_time,
      addSeconds(start_time, if(rand() < 0.6, floor(randUniform(0, 20)), floor(randUniform(0, 3600)))) AS end_time,
      concat('name', toString(rand() % 100)) AS name,
      map('key', 'value') AS metadata,
      if(randUniform(0, 1) < 0.9, 'DEFAULT', if(randUniform(0, 1) < 0.5, 'ERROR', if(randUniform(0, 1) < 0.5, 'DEBUG', 'WARNING'))) AS level,
      'status_message' AS status_message,
      'version' AS version,
      repeat('input', toInt64(randExponential(1 / 100))) AS input,
      repeat('output', toInt64(randExponential(1 / 100))) AS output,
      case
        when number % 2 = 0 then 'clause-3-haiku-20230407'
        else 'gpt-4'
      end as provided_model_name,
      case
        when number % 2 = 0 then 'cltra4wbs0000k1407g0ya3'
        else '1cmtk9y0000y3y79x9jgxj'
      end as internal_model_id,
      if("type" = 'GENERATION',
        '{"temperature": 0.7, "max_tokens": 150}',
        '{}') AS model_parameters,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(0, 1000)), 'output', toUInt64(randUniform(0, 1000)), 'total', toUInt64(randUniform(0, 2000))),
        map()) AS provided_usage_details,
      if("type" = 'GENERATION',
        map('input', toUInt64(randUniform(0, 1000)), 'output', toUInt64(randUniform(0, 1000)), 'total', toUInt64(randUniform(0, 2000))),
        map()) AS usage_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0, 1000), 12), 'output', toDecimal64(randUniform(0, 1000), 12), 'total', toDecimal64(randUniform(0, 2000), 12)),
        map()) AS provided_cost_details,
      if("type" = 'GENERATION',
        map('input', toDecimal64(randUniform(0, 1000), 12), 'output', toDecimal64(randUniform(0, 1000), 12), 'total', toDecimal64(randUniform(0, 2000), 12)),
        map()) AS cost_details,
      if("type" = 'GENERATION',
        toDecimal64(randUniform(0, 2000), 12),
        NULL) AS total_cost,
      addMilliseconds(start_time, if(rand() < 0.6, floor(randUniform(0, 500)), floor(randUniform(0, 600)))) AS completion_start_time,
      array(${SEED_PROMPTS.map((p) => `concat('${p.id}',project_id)`).join(
        ",",
      )})[(number % ${SEED_PROMPTS.length})+1] AS prompt_id,
      array(${SEED_PROMPTS.map((p) => `'${p.name}'`).join(
        ",",
      )})[(number % ${SEED_PROMPTS.length})+1] AS prompt_name,
      array(${SEED_PROMPTS.map((p) => `'${p.version}'`).join(
        ",",
      )})[(number % ${SEED_PROMPTS.length})+1] AS prompt_version,
      start_time AS created_at,
      start_time AS updated_at,
      start_time AS event_ts,
      0 AS is_deleted
    FROM numbers(${observationsPerProject});
  `;

    console.log(observationsQuery);

    const scoresQuery = `
    INSERT INTO scores
    SELECT toString(number) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      '${projectId}' AS project_id,
      'default' AS environment,
      toString(floor(randUniform(0, ${tracesPerProject}))) AS trace_id,
      if(
        rand() > 0.9,
        toString(floor(randUniform(0, ${observationsPerProject}))),
        NULL
      ) AS observation_id,
      concat('name_', toString(rand() % 10)) AS name,
      randUniform(0, 100) as value,
      'API' as source,
      'comment' as comment,
      toString(rand() % 100) as author_user_id,
      toString(rand() % 100) as config_id,
      if (rand() < 0.33, 'NUMERIC', if (rand() < 0.5, 'CATEGORICAL', 'BOOLEAN')) as data_type,
      toString(rand() % 100) as string_value,
      NULL as queue_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts,
      0 AS is_deleted
    FROM numbers(${scoresPerProject});
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
