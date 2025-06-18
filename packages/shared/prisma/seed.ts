import {
  PrismaClient,
  type Project,
  type Prisma,
  ScoreDataType,
  AnnotationQueueObjectType,
} from "../src/index";
import { hash } from "bcryptjs";
import { parseArgs } from "node:util";

import { chunk } from "lodash";
import { v4 } from "uuid";
import { ModelUsageUnit } from "../src";
import { getDisplaySecretKey, hashSecretKey, logger } from "../src/server";
import { encrypt } from "../src/encryption";
import { redis } from "../src/server/redis/redis";
import { randomUUID } from "crypto";
import { SEED_DATASETS, SEED_PROMPTS } from "./seed-constants";
import { generateTraceId } from "../utilities/seed-helpers";

const LOAD_TRACE_VOLUME = 10_000;

type ConfigCategory = {
  label: string;
  value: number;
};

const options = {
  environment: { type: "string" },
} as const;

const prisma = new PrismaClient();

async function main() {
  const environment = parseArgs({
    options,
  }).values.environment;

  const seedOrgId = "seed-org-id";
  const seedProjectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const seedUserId1 = "user-1"; // Owner of org
  const seedUserId2 = "user-2"; // Member of org, admin of project

  const user = await prisma.user.upsert({
    where: { id: seedUserId1 },
    update: {
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
    },
    create: {
      id: seedUserId1,
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
      image: "https://static.langfuse.com/langfuse-dev%2Fexample-avatar.png",
    },
  });
  const user2 = await prisma.user.upsert({
    where: { id: seedUserId2 },
    update: {
      name: "Demo User 2",
      email: "member@langfuse.com",
      password: await hash("password", 12),
    },
    create: {
      id: seedUserId2,
      name: "Demo User 2",
      email: "member@langfuse.com",
      password: await hash("password", 12),
    },
  });

  await prisma.organization.upsert({
    where: { id: seedOrgId },
    update: {
      name: "Seed Org",
      cloudConfig: {
        plan: "Team",
      },
    },
    create: {
      id: seedOrgId,
      name: "Seed Org",
      cloudConfig: {
        plan: "Team",
      },
    },
  });

  const project1 = await prisma.project.upsert({
    where: { id: seedProjectId },
    update: {
      name: "llm-app",
      orgId: seedOrgId,
    },
    create: {
      id: seedProjectId,
      name: "llm-app",
      orgId: seedOrgId,
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      orgId_userId: {
        userId: user.id,
        orgId: seedOrgId,
      },
    },
    create: {
      userId: user.id,
      orgId: seedOrgId,
      role: "OWNER",
    },
    update: {},
  });

  const orgMembership2 = await prisma.organizationMembership.upsert({
    where: {
      orgId_userId: {
        userId: user2.id,
        orgId: seedOrgId,
      },
    },
    create: {
      userId: user2.id,
      orgId: seedOrgId,
      role: "MEMBER",
    },
    update: {},
  });

  await prisma.projectMembership.upsert({
    where: {
      projectId_userId: {
        projectId: project1.id,
        userId: user2.id,
      },
    },
    create: {
      userId: user2.id,
      projectId: project1.id,
      role: "ADMIN",
      orgMembershipId: orgMembership2.id,
    },
    update: {
      orgMembershipId: orgMembership2.id,
    },
  });

  await prisma.prompt.upsert({
    where: {
      projectId_name_version: {
        projectId: seedProjectId,
        name: "summary-prompt",
        version: 1,
      },
    },
    create: {
      name: "summary-prompt",
      project: { connect: { id: seedProjectId } },
      prompt: "prompt {{variable}} {{anotherVariable}}",
      labels: ["production", "latest"],
      version: 1,
      createdBy: "user-1",
    },
    update: {},
  });

  const seedApiKey = {
    id: "seed-api-key",
    secret: process.env.SEED_SECRET_KEY ?? "sk-lf-1234567890",
    public: "pk-lf-1234567890",
    note: "seeded key",
  };

  if (!(await prisma.apiKey.findUnique({ where: { id: seedApiKey.id } }))) {
    await prisma.apiKey.create({
      data: {
        note: seedApiKey.note,
        id: seedApiKey.id,
        publicKey: seedApiKey.public,
        hashedSecretKey: await hashSecretKey(seedApiKey.secret),
        displaySecretKey: getDisplaySecretKey(seedApiKey.secret),
        scope: "PROJECT",
        project: {
          connect: {
            id: project1.id,
          },
        },
      },
    });
  }

  // Do not run the following for local docker compose setup
  if (environment === "examples" || environment === "load") {
    const seedOrgIdOrg2 = "demo-org-id";
    const project2Id = "239ad00f-562f-411d-af14-831c75ddd875";
    const org2 = await prisma.organization.upsert({
      where: { id: seedOrgIdOrg2 },
      update: {
        name: "Langfuse Demo",
      },
      create: {
        id: seedOrgIdOrg2,
        name: "Langfuse Demo",
      },
    });
    const project2 = await prisma.project.upsert({
      where: { id: project2Id },
      create: {
        id: project2Id,
        name: "demo-app",
        orgId: org2.id,
      },
      update: { orgId: seedOrgIdOrg2 },
    });
    await prisma.organizationMembership.upsert({
      where: {
        orgId_userId: {
          userId: user.id,
          orgId: seedOrgIdOrg2,
        },
      },
      create: {
        userId: user.id,
        orgId: seedOrgIdOrg2,
        role: "VIEWER",
      },
      update: {},
    });

    const secondKey = {
      id: "seed-api-key-2",
      secret: process.env.SEED_SECRET_KEY ?? "sk-lf-asdfghjkl",
      public: "pk-lf-asdfghjkl",
      note: "seeded key 2",
    };
    if (!(await prisma.apiKey.findUnique({ where: { id: secondKey.id } }))) {
      await prisma.apiKey.create({
        data: {
          note: secondKey.note,
          id: secondKey.id,
          publicKey: secondKey.public,
          hashedSecretKey: await hashSecretKey(secondKey.secret),
          displaySecretKey: getDisplaySecretKey(secondKey.secret),
          scope: "PROJECT",
          project: {
            connect: {
              id: project2.id,
            },
          },
        },
      });
    }

    const configIdsAndNames = await generateConfigsForProject([
      project1,
      project2,
    ]);

    const queueIds = await generateQueuesForProject(
      [project1, project2],
      configIdsAndNames,
    );

    const promptIds = await generatePromptsForProject([project1, project2]);

    const { sessions, comments, queueItems } = createObjects(
      project1,
      project2,
      promptIds,
      queueIds,
      configIdsAndNames,
    );

    await uploadObjects(sessions, comments, queueItems);

    // If openai key is in environment, add it to the projects LLM API keys
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (OPENAI_API_KEY) {
      await prisma.llmApiKeys.create({
        data: {
          projectId: project1.id,
          secretKey: encrypt(OPENAI_API_KEY),
          displaySecretKey: getDisplaySecretKey(OPENAI_API_KEY),
          provider: "openai",
          adapter: "openai",
        },
      });
    } else {
      logger.warn(
        "No OPENAI_API_KEY found in environment. Skipping seeding LLM API key.",
      );
    }

    // add eval objects
    const evalTemplate = await prisma.evalTemplate.upsert({
      where: {
        projectId_name_version: {
          projectId: project1.id,
          name: "toxicity-template",
          version: 1,
        },
      },
      create: {
        projectId: project1.id,
        name: "toxicity-template",
        version: 1,
        prompt:
          "Please evaluate the toxicity of the following text {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        vars: ["input", "output"],
        provider: "openai",
        outputSchema: {
          score: "provide a score between 0 and 1",
          reasoning: "one sentence reasoning for the score",
        },
        modelParams: {
          temperature: 0.7,
          outputTokenLimit: 100,
          topP: 0.9,
        },
      },
      update: {},
    });

    await prisma.jobConfiguration.upsert({
      where: {
        id: "toxicity-job",
      },
      create: {
        id: "toxicity-job",
        evalTemplateId: evalTemplate.id,
        projectId: project1.id,
        jobType: "EVAL",
        status: "ACTIVE",
        scoreName: "toxicity",
        filter: [
          {
            type: "string",
            value: "user",
            column: "User ID",
            operator: "contains",
          },
        ],
        variableMapping: [
          {
            langfuseObject: "trace",
            selectedColumnId: "input",
            templateVariable: "input",
          },
          {
            langfuseObject: "trace",
            selectedColumnId: "metadata",
            templateVariable: "output",
          },
        ],
        targetObject: "trace",
        sampling: 1,
        delay: 5_000,
      },
      update: {},
    });

    // await createDatasets(project1, project2, observations);

    await createDashboardsAndWidgets([project1, project2]);

    await prisma.llmSchema.createMany({
      data: [
        {
          projectId: project1.id,
          name: "get_weather",
          description: "Fetches weather in Celsius for a given location",
          schema: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              unit: {
                type: "string",
                enum: ["celsius", "fahrenheit"],
              },
            },
            required: ["location", "unit"],
          },
        },
        {
          projectId: project1.id,
          name: "calculator",
          description: "Performs basic arithmetic calculations",
          schema: {
            type: "object",
            properties: {
              expression: {
                type: "string",
                description:
                  "The mathematical expression to evaluate, e.g. '2 + 2'",
              },
            },
            required: ["expression"],
          },
        },
      ],
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    redis?.disconnect();
    logger.info("Disconnected from postgres and redis");
  })
  .catch(async (e) => {
    logger.error(e);
    await prisma.$disconnect();
    redis?.disconnect();
    logger.info("Disconnected from postgres and redis");
    process.exit(1);
  });

async function createDashboardsAndWidgets(projects: Project[]) {
  logger.info("Creating dashboards and widgets");

  // Process each project
  for (const project of projects) {
    const widget = await prisma.dashboardWidget.upsert({
      where: { id: "cabc" },
      create: {
        id: "cabc",
        projectId: project.id,
        name: "Trace Counts",
        description: "Trace Counts by Name Over Time",
        view: "TRACES",
        dimensions: [{ field: "name" }],
        metrics: [{ measure: "count", agg: "count" }],
        filters: [],
        chartType: "BAR_TIME_SERIES",
        chartConfig: {
          type: "BAR_TIME_SERIES",
        },
      },
      update: {},
    });

    const widget2 = await prisma.dashboardWidget.upsert({
      where: { id: "cdef" },
      create: {
        id: "cdef",
        projectId: project.id,
        name: "Observation Latencies by Model",
        description: "p95 Observation Latencies by Model Name",
        view: "OBSERVATIONS",
        dimensions: [{ field: "providedModelName" }],
        metrics: [{ measure: "count", agg: "sum" }],
        filters: [],
        chartType: "LINE_TIME_SERIES",
        chartConfig: {
          type: "LINE_TIME_SERIES",
        },
      },
      update: {},
    });

    // Create a dashboard with multiple widgets
    await prisma.dashboard.upsert({
      where: { id: "seed-dashboard" },
      create: {
        id: "seed-dashboard",
        projectId: project.id,
        name: "Performance Overview",
        description: "Dashboard with various performance metrics",
        definition: {
          widgets: [
            {
              type: "widget",
              id: randomUUID(),
              widgetId: widget.id,
              x: 0,
              y: 0,
              x_size: 6,
              y_size: 6,
            },
            {
              type: "widget",
              id: randomUUID(),
              widgetId: widget2.id,
              x: 6,
              y: 0,
              x_size: 6,
              y_size: 6,
            },
          ],
        },
      },
      update: {},
    });
  }
}

export async function createDatasets(
  project1: {
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
  },
  project2: {
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
  },
  observations: { id?: string; projectId?: string; traceId?: string | null }[],
) {
  for (const data of SEED_DATASETS) {
    for (const projectId of [project1.id, project2.id]) {
      const datasetName = data.name;

      // check if ds already exists
      const dataset =
        (await prisma.dataset.findFirst({
          where: {
            projectId,
            name: datasetName,
          },
        })) ??
        (await prisma.dataset.create({
          data: {
            name: datasetName,
            description: data.description,
            projectId,
            metadata: data.metadata,
          },
        }));

      const datasetItemIds: string[] = [];
      for (let index = 0; index < data.items.length; index++) {
        const item = data.items[index];
        const sourceObservation =
          Math.random() > 0.3
            ? observations[Math.floor(Math.random() * observations.length)]
            : undefined;

        // Use upsert to prevent duplicates
        const datasetItem = await prisma.datasetItem.upsert({
          where: {
            id_projectId: {
              id: `${dataset.id}-${index}`,
              projectId,
            },
          },
          create: {
            projectId,
            id: `${dataset.id}-${index}`,
            datasetId: dataset.id,
            sourceTraceId: sourceObservation?.traceId ?? null,
            sourceObservationId:
              sourceObservation && Math.random() > 0.5
                ? sourceObservation.id
                : null,
            input: item.input,
            expectedOutput: item.output,
            metadata: Math.random() > 0.5 ? { key: "value" } : undefined,
          },
          update: {}, // Don't update if it exists
        });
        datasetItemIds.push(datasetItem.id);
      }

      for (let datasetRunNumber = 0; datasetRunNumber < 3; datasetRunNumber++) {
        const datasetRun = await prisma.datasetRuns.upsert({
          where: {
            datasetId_projectId_name: {
              datasetId: dataset.id,
              projectId,
              name: `demo-dataset-run-${datasetRunNumber}`,
            },
          },
          create: {
            projectId,
            name: `demo-dataset-run-${datasetRunNumber}`,
            description: Math.random() > 0.5 ? "Dataset run description" : "",
            datasetId: dataset.id,
            metadata: [
              undefined,
              "string",
              100,
              { key: "value" },
              ["tag1", "tag2"],
            ][datasetRunNumber % 5],
          },
          update: {},
        });

        for (let index = 0; index < datasetItemIds.length; index++) {
          await prisma.datasetRunItems.upsert({
            where: {
              id_projectId: {
                id: `${dataset.id}-${index}-${datasetRunNumber}`,
                projectId,
              },
            },
            create: {
              id: `${dataset.id}-${index}-${datasetRunNumber}`,
              projectId,
              datasetItemId: datasetItemIds[index],
              traceId: `0-${generateTraceId(datasetName, index, projectId, datasetRunNumber)}`,
              datasetRunId: datasetRun.id,
            },
            update: {},
          });
        }
      }
    }
  }
}

async function uploadObjects(
  sessions: Prisma.TraceSessionCreateManyInput[],
  comments: Prisma.CommentCreateManyInput[],
  queueItems: Prisma.AnnotationQueueItemCreateManyInput[],
) {
  let promises: Prisma.PrismaPromise<unknown>[] = [];

  const chunkSize = 10_000;

  chunk(sessions, 1).forEach((chunk) => {
    promises.push(
      prisma.traceSession.upsert({
        where: {
          id_projectId: { id: chunk[0]!.id!, projectId: chunk[0]!.projectId },
        },
        create: chunk[0]!,
        update: {},
      }),
    );
  });

  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      logger.info(
        `Seeding of Sessions ${((i + 1) / promises.length) * 100}% complete`,
      );
    await promises[i];
  }

  promises = [];
  chunk(comments, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.comment.createMany({
        data: chunk,
      }),
    );
  });
  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      logger.info(
        `Seeding of Comments ${((i + 1) / promises.length) * 100}% complete`,
      );
    await promises[i];
  }

  promises = [];
  chunk(queueItems, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.annotationQueueItem.createMany({
        data: chunk,
      }),
    );
  });
  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      logger.info(
        `Seeding of Annotation Queue Items ${((i + 1) / promises.length) * 100}% complete`,
      );
    await promises[i];
  }
}

function createObjects(
  project1: Project,
  project2: Project,
  promptIds: Map<string, string[]>,
  queueIds: Map<string, string[]>,
  configParams: Map<
    string,
    {
      name: string;
      id: string;
      dataType: ScoreDataType;
      categories: ConfigCategory[] | null;
    }[]
  >,
) {
  const sessions: Prisma.TraceSessionCreateManyInput[] = [];
  const events: any[] = [];
  const configs: Prisma.ScoreConfigCreateManyInput[] = [];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const queueItems: Prisma.AnnotationQueueItemCreateManyInput[] = [];

  // TODO: attach score configs to certain scores for traces
  // TODO: attach prompts to certain traces
  // TODO: attach sessions to certain traces
  // TODO: add comments to certain traces
  // TODO: add certain traces to annotation queues

  // find unique sessions by id and projectid
  const uniqueSessions: Prisma.TraceSessionCreateManyInput[] = Array.from(
    new Set(sessions.map((session) => JSON.stringify(session))),
  ).map((session) => JSON.parse(session) as Prisma.TraceSessionCreateManyInput);

  return {
    configs,
    queueItems,
    sessions: uniqueSessions,
    events,
    comments,
  };
}

async function generatePromptsForProject(projects: Project[]) {
  const promptIds = new Map<string, string[]>();

  await Promise.all(
    projects.map(async (project) => {
      const promptIdsForProject = await generatePrompts(project);
      promptIds.set(project.id, promptIdsForProject);
    }),
  );
  return promptIds;
}

export const PROMPT_IDS: string[] = [];

async function generatePrompts(project: Project) {
  const promptIds = [];
  for (const prompt of SEED_PROMPTS) {
    await prisma.prompt.upsert({
      where: {
        projectId_name_version: {
          projectId: prompt.id + project.id,
          name: prompt.name,
          version: prompt.version,
        },
        id: prompt.id + project.id,
      },
      create: {
        id: prompt.id + project.id,
        projectId: project.id,
        createdBy: prompt.createdBy,
        prompt: prompt.prompt,
        name: prompt.name,
        version: prompt.version,
        labels: prompt.labels,
        tags: prompt.tags,
      },
      update: {},
    });
    promptIds.push(prompt.id);
  }

  const promptVersionsWithVariables = [
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 4 version 1 content with {{variable}}",
      name: "Prompt 4 with variable and config",
      config: {
        temperature: 0.7,
      },
      version: 1,
    },
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 4 version 2 content with {{variable}}",
      name: "Prompt 4 with variable and config",
      config: {
        temperature: 0.7,
        topP: 0.9,
      },
      version: 2,
      labels: ["production"],
    },
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 4 version 3 content with {{variable}}",
      name: "Prompt 4 with variable and config",
      config: {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.5,
      },
      version: 3,
      labels: ["production", "latest"],
    },
  ];

  for (const version of promptVersionsWithVariables) {
    await prisma.prompt.upsert({
      where: {
        projectId_name_version: {
          projectId: version.projectId,
          name: version.name,
          version: version.version,
        },
        id: version.id,
      },
      create: {
        id: version.id,
        projectId: version.projectId,
        createdBy: version.createdBy,
        prompt: version.prompt,
        name: version.name,
        config: version.config,
        version: version.version,
        labels: version.labels,
      },
      update: {
        id: version.id,
      },
    });
    promptIds.push(version.id);
  }
  const promptName = "Prompt with many versions";
  const projectId = project.id;
  const createdBy = "user-1";

  for (let i = 1; i <= 20; i++) {
    const promptId = `prompt-${v4()}`;
    await prisma.prompt.upsert({
      where: {
        projectId_name_version: {
          projectId: projectId,
          name: promptName,
          version: i,
        },
        id: promptId,
      },
      create: {
        id: promptId,
        projectId: projectId,
        createdBy: createdBy,
        prompt: `${promptName} version ${i} content`,
        name: promptName,
        version: i,
        labels: i === 20 ? ["production", "latest"] : [],
      },
      update: {
        id: promptId,
      },
    });
    promptIds.push(promptId);
  }
  return promptIds;
}

async function generateConfigsForProject(projects: Project[]) {
  const projectIdsToConfigs: Map<
    string,
    {
      name: string;
      id: string;
      dataType: ScoreDataType;
      categories: ConfigCategory[] | null;
    }[]
  > = new Map();

  await Promise.all(
    projects.map(async (project) => {
      const configNameAndId = await generateConfigs(project);
      projectIdsToConfigs.set(project.id, configNameAndId);
    }),
  );
  return projectIdsToConfigs;
}

async function generateConfigs(project: Project) {
  const configNameAndId: {
    name: string;
    id: string;
    dataType: ScoreDataType;
    categories: ConfigCategory[] | null;
  }[] = [];

  const configs = [
    {
      id: `config-${v4()}`,
      name: "manual-score",
      dataType: ScoreDataType.NUMERIC,
      projectId: project.id,
      isArchived: false,
    },
    {
      id: `config-${v4()}`,
      projectId: project.id,
      name: "Accuracy",
      dataType: ScoreDataType.CATEGORICAL,
      categories: [
        { label: "Incorrect", value: 0 },
        { label: "Partially Correct", value: 1 },
        { label: "Correct", value: 2 },
      ],
      isArchived: false,
    },
    {
      id: `config-${v4()}`,
      projectId: project.id,
      name: "Toxicity",
      dataType: ScoreDataType.BOOLEAN,
      categories: [
        { label: "True", value: 1 },
        { label: "False", value: 0 },
      ],
      description:
        "Used to indicate if text was harmful or offensive in nature.",
      isArchived: false,
    },
  ];

  for (const config of configs) {
    await prisma.scoreConfig.upsert({
      where: {
        id_projectId: {
          projectId: config.projectId,
          id: config.id,
        },
      },
      create: {
        id: config.id,
        projectId: config.projectId,
        name: config.name,
        dataType: config.dataType,
        categories: config.categories,
        isArchived: config.isArchived,
      },
      update: {
        id: config.id,
      },
    });
    configNameAndId.push({
      name: config.name,
      id: config.id,
      dataType: config.dataType,
      categories: config.categories ?? null,
    });
  }

  return configNameAndId;
}

function getGenerationInputOutput(): {
  input: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue;
} {
  if (Math.random() > 0.9) {
    const input = [
      {
        role: "user",
        content: [
          { text: "What's depicted in this image?", type: "text" },
          {
            type: "image_url",
            image_url: {
              url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg",
            },
          },
          { text: "Describe the scene in detail.", type: "text" },
        ],
      },
    ];

    const output =
      "The image depicts a serene landscape featuring a wooden pathway or boardwalk that winds through a lush green field. The field is filled with tall grass and surrounded by trees and shrubs. Above, the sky is bright with scattered clouds, suggesting a clear and pleasant day. The scene conveys a sense of tranquility and natural beauty.";

    return { input, output };
  }

  const input =
    Math.random() > 0.5
      ? [
          {
            role: "system",
            content: "Be a helpful assistant",
          },
          {
            role: "user",
            content: "How can i create a *React* component?",
          },
        ]
      : {
          input: "How can i create a React component?",
          retrievedDocuments: [
            {
              title: "How to create a React component",
              url: "https://www.google.com",
              description: "A guide to creating React components",
            },
            {
              title: "React component creation",
              url: "https://www.google.com",
              description: "A guide to creating React components",
            },
          ],
        };

  const output =
    "Creating a React component can be done in two ways: as a functional component or as a class component. Let's start with a basic example of both.\n\n**Image**\n\n![Languse Example Image](https://static.langfuse.com/langfuse-dev/langfuse-example-image.jpeg)\n\n1.  **Functional Component**:\n\nA functional component is just a plain JavaScript function that accepts props as an argument, and returns a React element. Here's how you can create one:\n\n```javascript\nimport React from 'react';\nfunction Greeting(props) {\n  return <h1>Hello, {props.name}</h1>;\n}\nexport default Greeting;\n```\n\nTo use this component in another file, you can do:\n\n```javascript\nimport Greeting from './Greeting';\nfunction App() {\n  return (\n    <div>\n      <Greeting name=\"John\" />\n    </div>\n  );\n}\nexport default App;\n```\n\n2.  **Class Component**:\n\nYou can also define components as classes in React. These have some additional features compared to functional components:\n\n```javascript\nimport React, { Component } from 'react';\nclass Greeting extends Component {\n  render() {\n    return <h1>Hello, {this.props.name}</h1>;\n  }\n}\nexport default Greeting;\n```\n\nAnd here's how to use this component:\n\n```javascript\nimport Greeting from './Greeting';\nclass App extends Component {\n  render() {\n    return (\n      <div>\n        <Greeting name=\"John\" />\n      </div>\n    );\n  }\n}\nexport default App;\n```\n\nWith the advent of hooks in React, functional components can do everything that class components can do and hence, the community has been favoring functional components over class components.\n\nRemember to import React at the top of your file whenever you're creating a component, because JSX transpiles to `React.createElement` calls under the hood.";

  return { input, output };
}

async function generateQueuesForProject(
  projects: Project[],
  configIdsAndNames: Map<
    string,
    {
      name: string;
      id: string;
      dataType: ScoreDataType;
      categories: ConfigCategory[] | null;
    }[]
  >,
) {
  const projectIdsToQueues: Map<string, string[]> = new Map();

  await Promise.all(
    projects.map(async (project) => {
      const queueIds = await generateQueues(
        project,
        configIdsAndNames.get(project.id) ?? [],
      );
      projectIdsToQueues.set(project.id, queueIds);
    }),
  );
  return projectIdsToQueues;
}

async function generateQueues(
  project: Project,
  configIdsAndNames: {
    name: string;
    id: string;
    dataType: ScoreDataType;
    categories: ConfigCategory[] | null;
  }[],
) {
  const queue = {
    id: `queue-${v4()}`,
    name: "Default",
    description: "Default queue",
    scoreConfigIds: configIdsAndNames.map((config) => config.id),
    projectId: project.id,
  };

  await prisma.annotationQueue.upsert({
    where: {
      projectId_name: {
        projectId: queue.projectId,
        name: queue.name,
      },
    },
    create: {
      ...queue,
    },
    update: {
      id: queue.id,
    },
  });

  return [queue.id];
}
