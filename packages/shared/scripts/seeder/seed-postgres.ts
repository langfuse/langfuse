import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { hash } from "bcryptjs";
import { v4 } from "uuid";
import { encrypt } from "../../src/encryption";
import {
  type JobConfiguration,
  JobExecutionStatus,
  PrismaClient,
  type Project,
  ScoreDataType,
} from "../../src/index";
import { getDisplaySecretKey, hashSecretKey, logger } from "../../src/server";
import { redis } from "../../src/server/redis/redis";
import {
  EVAL_TRACE_COUNT,
  FAILED_EVAL_TRACE_INTERVAL,
  SEED_CHAT_ML_PROMPTS,
  SEED_DATASETS,
  SEED_EVALUATOR_CONFIGS,
  SEED_EVALUATOR_TEMPLATES,
  SEED_PROMPT_VERSIONS,
  SEED_TEXT_PROMPTS,
} from "./utils/postgres-seed-constants";
import {
  generateDatasetRunTraceId,
  generateEvalObservationId,
  generateEvalScoreId,
  generateEvalTraceId,
} from "./utils/seed-helpers";

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
    secret: process.env.SEED_SECRET_KEY ?? "sk-lf-1234567890", // eslint-disable-line turbo/no-undeclared-env-vars
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
      secret: process.env.SEED_SECRET_KEY ?? "sk-lf-asdfghjkl", // eslint-disable-line turbo/no-undeclared-env-vars
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

    await generateQueuesForProject([project1, project2], configIdsAndNames);
    await generatePromptsForProject([project1, project2]);
    await createDatasets(project1, project2);
    await createTraceSessions(project1, project2);

    // If openai key is in environment, add it to the projects LLM API keys
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // eslint-disable-line turbo/no-undeclared-env-vars

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
    for (const evalTemplate of SEED_EVALUATOR_TEMPLATES) {
      await prisma.evalTemplate.upsert({
        where: {
          projectId_name_version: {
            projectId: project1.id,
            name: evalTemplate.name,
            version: 1,
          },
        },
        create: {
          id: evalTemplate.id,
          projectId: project1.id,
          name: evalTemplate.name,
          version: evalTemplate.version,
          prompt: evalTemplate.prompt,
          model: evalTemplate.model,
          vars: evalTemplate.vars,
          provider: evalTemplate.provider,
          outputSchema: evalTemplate.outputSchema,
          modelParams: evalTemplate.modelParams,
        },
        update: {},
      });
    }

    for (const evalConfig of SEED_EVALUATOR_CONFIGS) {
      await prisma.jobConfiguration.upsert({
        where: {
          id: evalConfig.id,
        },
        create: {
          id: evalConfig.id,
          evalTemplateId: evalConfig.evalTemplateId,
          projectId: project1.id,
          jobType: evalConfig.jobType as any,
          status: evalConfig.status as any,
          scoreName: evalConfig.scoreName,
          filter: evalConfig.filter,
          variableMapping: evalConfig.variableMapping,
          targetObject: evalConfig.targetObject,
          sampling: evalConfig.sampling,
          delay: evalConfig.delay,
        },
        update: {},
      });
    }

    await generateEvalJobExecutions(
      [project1, project2],
      SEED_EVALUATOR_CONFIGS as unknown as Partial<JobConfiguration>[],
    );

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
        const sourceTraceId =
          Math.random() > 0.3
            ? `${Math.floor(Math.random() * 100)}`
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
            sourceTraceId: sourceTraceId ?? null,
            sourceObservationId: null,
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
              traceId: `${generateDatasetRunTraceId(datasetName, index, projectId, datasetRunNumber)}`,
              datasetRunId: datasetRun.id,
            },
            update: {},
          });
        }
      }
    }
  }
}

async function generateEvalJobExecutions(
  projects: Project[],
  evalJobConfigurations: Partial<JobConfiguration>[],
) {
  for (const project of projects) {
    for (let i = 0; i < EVAL_TRACE_COUNT; i++) {
      const jobConfiguration =
        evalJobConfigurations[i % evalJobConfigurations.length];

      const isFailed = i % FAILED_EVAL_TRACE_INTERVAL === 0;
      await prisma.jobExecution.create({
        data: {
          projectId: project.id,
          jobTemplateId: jobConfiguration.evalTemplateId,
          jobInputTraceId: generateEvalTraceId(
            jobConfiguration.evalTemplateId!,
            i,
            project.id,
          ),
          jobConfigurationId: jobConfiguration.id!,
          status: isFailed
            ? JobExecutionStatus.ERROR
            : JobExecutionStatus.COMPLETED,
          error: isFailed ? "Error message" : undefined,
          jobOutputScoreId: generateEvalScoreId(
            jobConfiguration.evalTemplateId!,
            i,
            project.id,
          ),
          jobInputObservationId: generateEvalObservationId(
            jobConfiguration.evalTemplateId!,
            i,
            project.id,
          ),
        },
      });
    }
  }
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
  for (const prompt of SEED_TEXT_PROMPTS) {
    const versions = Math.floor(Math.random() * 20) + 1;
    for (let i = 1; i <= versions; i++) {
      const promptId = `prompt-${v4()}`;
      await prisma.prompt.upsert({
        where: {
          projectId_name_version: {
            projectId: project.id,
            name: prompt.name,
            version: i,
          },
          id: promptId,
        },
        create: {
          id: promptId,
          projectId: project.id,
          createdBy: prompt.createdBy,
          prompt: `${prompt.prompt} version ${i} content`,
          name: prompt.name,
          version: i,
          labels: i === versions ? prompt.labels : [],
        },
        update: {
          id: promptId,
        },
      });
      promptIds.push(promptId);
    }
  }

  for (const prompt of SEED_CHAT_ML_PROMPTS) {
    const promptId = `prompt-${v4()}`;
    const versions = Math.floor(Math.random() * 20) + 1;
    for (let i = 1; i <= versions; i++) {
      const versionAddition = [
        {
          role: "user",
          content: "This is content for version " + i,
        },
      ];

      await prisma.prompt.upsert({
        where: {
          projectId_name_version: {
            projectId: project.id,
            name: prompt.name,
            version: prompt.version,
          },
          id: promptId,
        },
        create: {
          id: promptId,
          projectId: project.id,
          createdBy: prompt.createdBy,
          prompt: [...prompt.prompt, ...versionAddition],
          name: prompt.name,
          version: i,
          type: "chat",
          labels: prompt.labels,
          tags: prompt.tags,
        },
        update: {
          id: promptId,
        },
      });
      promptIds.push(promptId);
    }
  }

  for (const version of SEED_PROMPT_VERSIONS) {
    const id = `prompt-${v4()}`;
    await prisma.prompt.upsert({
      where: {
        projectId_name_version: {
          projectId: project.id,
          name: version.name,
          version: version.version,
        },
        id: id,
      },
      create: {
        id: id,
        projectId: project.id,
        createdBy: version.createdBy,
        prompt: version.prompt,
        name: version.name,
        config: version.config,
        version: version.version,
        labels: version.labels,
      },
      update: {
        id: id,
      },
    });
    promptIds.push(id);
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

async function createTraceSessions(project1: Project, project2: Project) {
  for (const project of [project1, project2]) {
    for (let i = 0; i < 100; i++) {
      await prisma.traceSession.create({
        data: {
          projectId: project.id,
          id: `session_${i}`,
          createdAt: new Date(),
        },
      });
    }
  }
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
