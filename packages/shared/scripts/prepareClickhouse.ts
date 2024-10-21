import { clickhouseClient } from "../src/server";

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
  }
) => {
  console.log(
    `Preparing Clickhouse for ${projectIds.length} projects and ${opts.numberOfDays} days.`
  );

  const projectData = projectIds.map((projectId) => {
    const observationsPerProject = Math.ceil(
      randn_bm(0, opts.totalObservations, 2)
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
    console.log(
      `Preparing Clickhouse for ${projectId}: Traces: ${tracesPerProject}, Scores: ${scoresPerProject}, Observations: ${observationsPerProject}`
    );

    const tracesQuery = `
    INSERT INTO traces
    SELECT toString(number) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      concat('name_', toString(rand() % 100)) AS name,
      concat('user_id_', toString(randUniform(0, 100))) AS user_id,
      map('key', 'value') AS metadata,
      concat('release_', toString(randUniform(0, 100))) AS release,
      concat('version_', toString(randUniform(0, 100))) AS version,
      '${projectId}' AS project_id,
      if(rand() < 0.8, true, false) as public,
      if(rand() < 0.8, true, false) as bookmarked,
      array('tag1', 'tag2') as tags,
      repeat('input', toInt64(randExponential(1 / 100))) AS input,
      repeat('output', toInt64(randExponential(1 / 100))) AS output,
      concat('session_', toString(rand() % 100)) AS session_id,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts
    FROM numbers(${tracesPerProject});
  `;

    const observationsQuery = `
    INSERT INTO observations
    SELECT toString(number) AS id,
      toString(floor(randUniform(0, ${tracesPerProject}))) AS trace_id,
      '${projectId}' AS project_id,
      if(rand() < 0.47, 'GENERATION', if(rand() < 0.94, 'SPAN', 'EVENT')) AS type,
      toString(rand()) AS parent_observation_id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS start_time,
      addSeconds(start_time, if(rand() < 0.6, floor(randUniform(0, 20)), floor(randUniform(0, 3600)))) AS end_time,
      concat('name', toString(rand() % 100)) AS name,
      map('key', 'value') AS metadata,
      if(rand() < 0.9, 'DEFAULT', if(rand() < 0.5, 'ERROR', if(rand() < 0.5, 'DEBUG', 'WANING'))) AS level,
      'status_message' AS status_message,
      'version' AS version,
      repeat('input', toInt64(randExponential(1 / 100))) AS input,
      repeat('output', toInt64(randExponential(1 / 100))) AS output,
      case
        when number % 2 = 0 then 'claude-3-haiku-20240307'
        else 'gpt-4'
      end as provided_model_name,
      case
        when number % 2 = 0 then 'cltr0w45b000008k1407o9qv1'
        else 'clrntkjgy000f08jx79v9g1xj'
      end as internal_model_id,
      'model_parameters' AS model_parameters,
      toInt32(randUniform(0, 1000)) AS provided_input_usage_units,
      toInt32(randUniform(0, 1000)) AS provided_output_usage_units,
      toInt32(randUniform(0, 1000)) AS provided_total_usage_units,
      toInt32(randUniform(0, 1000)) AS input_usage_units,
      toInt32(randUniform(0, 1000)) AS output_usage_units,
      toInt32(randUniform(0, 1000)) AS total_usage_units,
      toInt32(randUniform(0, 1000)) AS provided_input_cost,
      toInt32(randUniform(0, 1000)) AS provided_output_cost,
      toInt32(randUniform(0, 1000)) AS provided_total_cost,
      'TOKENS' AS unit,
      toInt32(randUniform(0, 1000)) AS input_cost,
      toInt32(randUniform(0, 1000)) AS output_cost,
      toInt32(randUniform(0, 1000)) AS total_cost,
      start_time AS completion_start_time,
      toString(rand()) AS prompt_id,
      toString(rand()) AS prompt_name,
      1000 AS prompt_version,
      start_time AS created_at,
      start_time AS updated_at,
      start_time AS event_ts
    FROM numbers(${observationsPerProject});
  `;

    const scoresQuery = `
    INSERT INTO scores
    SELECT toString(floor(randUniform(0, 100))) AS id,
      toDateTime(now() - randUniform(0, ${opts.numberOfDays} * 24 * 60 * 60)) AS timestamp,
      '${projectId}' AS project_id,
      toString(floor(randUniform(0, ${tracesPerProject}))) AS trace_id,
      if(
        rand() > 0.9,
        toString(floor(randUniform(0, ${observationsPerProject}))),
        NULL
      ) AS observation_id,
      concat('name_', toString(rand() % 100)) AS name,
      randUniform(0, 100) as value,
      'API' as source,
      'comment' as comment,
      toString(rand() % 100) as author_user_id,
      toString(rand() % 100) as config_id,
      toString(rand() % 100) as data_type,
      toString(rand() % 100) as string_value,
      timestamp AS created_at,
      timestamp AS updated_at,
      timestamp AS event_ts
    FROM numbers(${scoresPerProject});
  `;

    const queries = [tracesQuery, scoresQuery, observationsQuery];

    for (const query of queries) {
      await clickhouseClient.command({
        query,
        clickhouse_settings: {
          wait_end_of_query: 1,
        },
      });
    }
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

    const result = await clickhouseClient.query({
      query,
      format: "TabSeparated",
    });

    console.log(
      `${table.charAt(0).toUpperCase() + table.slice(1)} per Project:`
    );
    console.log(await result.text());
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

    const result = await clickhouseClient.query({
      query,
      format: "TabSeparated",
    });

    console.log(`${table.charAt(0).toUpperCase() + table.slice(1)} per Date:`);
    console.log(await result.text());
  }
};