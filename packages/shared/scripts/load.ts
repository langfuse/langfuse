import { prisma } from "../src/db";
import {
  clickhouseClient,
  getDisplaySecretKey,
  hashSecretKey,
} from "../src/server";

const createRandomProjectId = () =>
  `project-${Math.random().toString(36).substr(2, 9)}`;

const prepareProjectsAndApiKeys = async (
  numOfProjects: number,
  opts: { requiredProjectIds: string[] }
) => {
  const { requiredProjectIds } = opts;
  const projectsToCreate = numOfProjects - requiredProjectIds.length;
  const projectIds = [...requiredProjectIds];

  for (let i = 0; i < projectsToCreate; i++) {
    projectIds.push(createRandomProjectId());
  }

  for (const projectId of projectIds) {
    const orgId = `org-${projectId}`;

    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: {
        id: orgId,
        name: `Organization for ${projectId}`,
      },
    });

    await prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: {
        id: projectId,
        name: `Project ${projectId}`,
        orgId: orgId,
      },
    });

    const apiKeyId = `api-key-${projectId}`;
    if (!(await prisma.apiKey.findUnique({ where: { id: apiKeyId } }))) {
      await prisma.apiKey.create({
        data: {
          id: apiKeyId,
          note: `API Key for ${projectId}`,
          publicKey: `pk-${Math.random().toString(36).substr(2, 9)}`,
          hashedSecretKey: await hashSecretKey(
            `sk-${Math.random().toString(36).substr(2, 9)}`
          ),
          displaySecretKey: getDisplaySecretKey(
            `sk-${Math.random().toString(36).substr(2, 9)}`
          ),
          project: {
            connect: {
              id: projectId,
            },
          },
        },
      });
    }
  }
  return projectIds;
};

export const prepareClickhouse = async (
  projectIds: string[],
  opts: {
    numberOfDays: number;
  }
) => {
  const projectData = projectIds.map((projectId) => {
    const totalObservations = opts.numberOfDays;
    const tracesPerProject = Math.floor(
      (totalObservations *
        Math.exp(-projectIds.indexOf(projectId) / projectIds.length)) /
        6
    );
    const observationsPerProject = tracesPerProject * 6; // On average, one trace should have 6 observations
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
      `Preparing Clickhouse for ${projectId}: Traces: ${tracesPerProject}, Scores: ${scoresPerProject}, Generations: ${observationsPerProject}`
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
      '2024-07-31 09:47:59.270' AS start_time,
      addSeconds(start_time, floor(randExponential(1 / 10))) AS end_time,
      concat('name', toString(rand() % 100)) AS name,
      map('key', 'value') AS metadata,
      'level' AS level,
      'status_message' AS status_message,
      'version' AS version,
      repeat('input', toInt64(randExponential(1 / 100))) AS input,
      repeat('output', toInt64(randExponential(1 / 100))) AS output,
      if(
        number % 2 = 0,
        'claude-3-haiku-20240307',
        'gpt-4'
      ) as provided_model_name,
      toString(floor(randUniform(0, 1000000000))) as internal_model_id,
      'model_parameters' AS model_parameters,
      1000 AS provided_input_usage_units,
      1000 AS provided_output_usage_units,
      1000 AS provided_total_usage_units,
      1000 AS input_usage_units,
      1000 AS output_usage_units,
      1000 AS total_usage_units,
      1000 AS provided_input_cost,
      1000 AS provided_output_cost,
      1000 AS provided_total_cost,
      'unit' AS unit,
      1000 AS input_cost,
      1000 AS output_cost,
      1000 AS total_cost,
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
      now() - randUniform(0, 100) AS timestamp,
      '${projectId}' AS project_id,
      toString(floor(randUniform(0, 1000))) AS trace_id,
      if(
        rand() > 0.9,
        toString(floor(randUniform(0, 1000))),
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

    await Promise.all(
      queries.map((query) =>
        clickhouseClient.command({
          query,
          clickhouse_settings: {
            wait_end_of_query: 1,
          },
        })
      )
    );
  }
};

async function main() {
  let numOfProjects = parseInt(process.argv[2], 10);
  let numberOfDays = parseInt(process.argv[3], 10);

  if (isNaN(numOfProjects)) {
    console.warn(
      "Number of projects not provided or invalid. Defaulting to 10 projects."
    );
    numOfProjects = 10;
  }

  if (isNaN(numberOfDays)) {
    console.warn(
      "Number of days not provided or invalid. Defaulting to 3 days."
    );
    numberOfDays = 3;
  }

  try {
    const projectIds = [
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      "239ad00f-562f-411d-af14-831c75ddd875",
    ];

    const createdProjectIds = await prepareProjectsAndApiKeys(numOfProjects, {
      requiredProjectIds: projectIds,
    });

    await prepareClickhouse(createdProjectIds, { numberOfDays });

    console.log("Clickhouse preparation completed successfully.");
  } catch (error) {
    console.error("Error during Clickhouse preparation:", error);
  } finally {
    await clickhouseClient.close();
    await prisma.$disconnect();
    redis?.disconnect();
    console.log("Disconnected from Clickhouse.");
  }
}

main();
