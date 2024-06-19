import {
  PrismaClient,
  type Project,
  type Prisma,
  ObservationType,
  ScoreSource,
  ScoreDataType,
} from "../src/index";
import { hash } from "bcryptjs";
import { parseArgs } from "node:util";

import { chunk } from "lodash";
import { v4 } from "uuid";
import { ModelUsageUnit } from "../src";
import { getDisplaySecretKey, hashSecretKey } from "../src/server";
import { encrypt } from "../src/encryption";

const LOAD_TRACE_VOLUME = 10_000;

const options = {
  environment: { type: "string" },
} as const;

const prisma = new PrismaClient();

async function main() {
  const environment = parseArgs({
    options,
  }).values.environment;

  const user = await prisma.user.upsert({
    where: { id: "user-1" },
    update: {
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
    },
    create: {
      id: "user-1",
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
      image: "https://static.langfuse.com/langfuse-dev%2Fexample-avatar.png",
    },
  });

  const seedProjectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const project1 = await prisma.project.upsert({
    where: { id: seedProjectId },
    update: {
      name: "llm-app",
    },
    create: {
      id: seedProjectId,
      name: "llm-app",
      projectMembers: {
        create: {
          role: "OWNER",
          userId: user.id,
        },
      },
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
    const project2 = await prisma.project.upsert({
      where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
      create: {
        id: "239ad00f-562f-411d-af14-831c75ddd875",
        name: "demo-app",
        projectMembers: {
          create: {
            role: "OWNER",
            userId: user.id,
          },
        },
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

    const promptIds = await generatePromptsForProject([project1, project2]);

    const envTags = [null, "development", "staging", "production"];
    const colorTags = [null, "red", "blue", "yellow"];

    const traceVolume = environment === "load" ? LOAD_TRACE_VOLUME : 100;

    const { traces, observations, scores, sessions, events } = createObjects(
      traceVolume,
      envTags,
      colorTags,
      project1,
      project2,
      promptIds,
      configIdsAndNames
    );

    console.log(
      `Seeding ${traces.length} traces, ${observations.length} observations, and ${scores.length} scores`
    );

    await uploadObjects(traces, observations, scores, sessions, events);

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
      console.warn(
        "No OPENAI_API_KEY found in environment. Skipping seeding LLM API key."
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

    for (let datasetNumber = 0; datasetNumber < 2; datasetNumber++) {
      const dataset = await prisma.dataset.create({
        data: {
          name: `demo-dataset-${datasetNumber}`,
          description:
            datasetNumber === 0 ? "Dataset test description" : undefined,
          projectId: project2.id,
          metadata: datasetNumber === 0 ? { key: "value" } : undefined,
        },
      });

      const datasetItemIds = [];
      for (let i = 0; i < 18; i++) {
        const sourceObservation =
          Math.random() > 0.3
            ? observations[Math.floor(Math.random() * observations.length)]
            : undefined;
        const datasetItem = await prisma.datasetItem.create({
          data: {
            datasetId: dataset.id,
            sourceTraceId: sourceObservation?.traceId,
            sourceObservationId:
              Math.random() > 0.5 ? sourceObservation?.id : undefined,
            input:
              Math.random() > 0.3
                ? [
                    {
                      role: "user",
                      content: "How can i create a React component?",
                    },
                  ]
                : undefined,
            expectedOutput:
              Math.random() > 0.3
                ? "Creating a React component can be done in two ways: as a functional component or as a class component. Let's start with a basic example of both."
                : undefined,
            metadata: Math.random() > 0.5 ? { key: "value" } : undefined,
          },
        });
        datasetItemIds.push(datasetItem.id);
      }

      for (let datasetRunNumber = 0; datasetRunNumber < 5; datasetRunNumber++) {
        const datasetRun = await prisma.datasetRuns.create({
          data: {
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
        });

        for (const datasetItemId of datasetItemIds) {
          const relevantObservations = observations.filter(
            (o) => o.projectId === project2.id
          );
          const observation =
            relevantObservations[
              Math.floor(Math.random() * relevantObservations.length)
            ];

          await prisma.datasetRunItems.create({
            data: {
              datasetItemId,
              traceId: observation.traceId as string,
              observationId: Math.random() > 0.5 ? observation.id : undefined,
              datasetRunId: datasetRun.id,
            },
          });
        }
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

async function uploadObjects(
  traces: Prisma.TraceCreateManyInput[],
  observations: Prisma.ObservationCreateManyInput[],
  scores: Prisma.ScoreCreateManyInput[],
  sessions: Prisma.TraceSessionCreateManyInput[],
  events: Prisma.ObservationCreateManyInput[]
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
      })
    );
  });

  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      console.log(
        `Seeding of Sessions ${((i + 1) / promises.length) * 100}% complete`
      );
    await promises[i];
  }

  promises = [];

  chunk(traces, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.trace.createMany({
        data: chunk,
      })
    );
  });
  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      console.log(
        `Seeding of Traces ${((i + 1) / promises.length) * 100}% complete`
      );
    await promises[i];
  }

  promises = [];
  chunk(observations, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.observation.createMany({
        data: chunk,
      })
    );
  });

  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      console.log(
        `Seeding of Observations ${((i + 1) / promises.length) * 100}% complete`
      );
    await promises[i];
  }

  promises = [];
  chunk(events, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.observation.createMany({
        data: chunk,
      })
    );
  });

  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      console.log(
        `Seeding of Events ${((i + 1) / promises.length) * 100}% complete`
      );
    await promises[i];
  }

  promises = [];
  chunk(scores, chunkSize).forEach((chunk) => {
    promises.push(
      prisma.score.createMany({
        data: chunk,
      })
    );
  });
  for (let i = 0; i < promises.length; i++) {
    if (i + 1 >= promises.length || i % Math.ceil(promises.length / 10) === 0)
      console.log(
        `Seeding of Scores ${((i + 1) / promises.length) * 100}% complete`
      );
    await promises[i];
  }
}

function createObjects(
  traceVolume: number,
  envTags: (string | null)[],
  colorTags: (string | null)[],
  project1: Project,
  project2: Project,
  promptIds: Map<string, string[]>,
  configIdsAndNames: Map<string, { name: string; id: string }[]>
) {
  const traces: Prisma.TraceCreateManyInput[] = [];
  const observations: Prisma.ObservationCreateManyInput[] = [];
  const scores: Prisma.ScoreCreateManyInput[] = [];
  const sessions: Prisma.TraceSessionCreateManyInput[] = [];
  const events: Prisma.ObservationCreateManyInput[] = [];
  const configs: Prisma.ScoreConfigCreateManyInput[] = [];

  for (let i = 0; i < traceVolume; i++) {
    // print progress to console with a progress bar that refreshes every 10 iterations
    // random date within last 90 days, with a linear bias towards more recent dates
    const traceTs = new Date(
      Date.now() - Math.floor(Math.random() ** 1.5 * 90 * 24 * 60 * 60 * 1000)
    );

    const envTag = envTags[Math.floor(Math.random() * envTags.length)];
    const colorTag = colorTags[Math.floor(Math.random() * colorTags.length)];

    const tags = [envTag, colorTag].filter((tag) => tag !== null);

    const projectId = [project1.id, project2.id][i % 2] as string;

    const session =
      Math.random() > 0.3
        ? {
            id: `session-${i % 3}`,
            projectId: projectId,
          }
        : undefined;

    if (session) {
      sessions.push(session);
    }

    const trace = {
      id: `trace-${v4()}`,
      timestamp: traceTs,
      projectId: projectId,
      name: ["generate-outreach", "label-inbound", "draft-response"][
        i % 3
      ] as string,
      metadata: {
        user: `user-${i}@langfuse.com`,
        more: "1,2,3;4?6",
      },
      tags: tags as string[],
      userId: Math.random() > 0.3 ? `user-${i % 60}` : undefined,
      input:
        Math.random() > 0.3 ? "I'm looking for a React component" : undefined,
      output:
        Math.random() > 0.3
          ? "What kind of component are you looking for?"
          : undefined,
      ...(session ? { sessionId: session.id } : {}),
    };

    traces.push(trace);

    const configArray = configIdsAndNames.get(projectId) ?? [];
    const randomIndex = Math.floor(Math.random() * 3);
    const config =
      configArray.length >= randomIndex - 1 && configArray[randomIndex];
    const { name: annotationScoreName, id: configId } = config || {
      name: "manual-score",
      id: undefined,
    };

    const traceScores = [
      ...(Math.random() > 0.5
        ? [
            {
              traceId: trace.id,
              name: annotationScoreName,
              value: Math.floor(Math.random() * 3) - 1,
              timestamp: traceTs,
              source: ScoreSource.ANNOTATION,
              projectId,
              authorUserId: `user-${i}`,
              dataType: ScoreDataType.NUMERIC,
              ...(configId ? { configId } : {}),
            },
          ]
        : []),
      ...(Math.random() > 0.7
        ? [
            {
              traceId: trace.id,
              name: "sentiment",
              value: Math.floor(Math.random() * 10) - 5,
              timestamp: traceTs,
              source: ScoreSource.API,
              projectId,
              dataType: ScoreDataType.NUMERIC,
            },
          ]
        : []),
    ];

    scores.push(...traceScores);

    const existingSpanIds: string[] = [];

    for (let j = 0; j < Math.floor(Math.random() * 10) + 1; j++) {
      // add between 1 and 30 ms to trace timestamp
      const spanTsStart = new Date(
        traceTs.getTime() + Math.floor(Math.random() * 30)
      );
      // random duration of upto 5000ms
      const spanTsEnd = new Date(
        spanTsStart.getTime() + Math.floor(Math.random() * 5000)
      );

      const span = {
        type: ObservationType.SPAN,
        id: `span-${v4()}`,
        startTime: spanTsStart,
        endTime: spanTsEnd,
        name: `span-${i}-${j}`,
        metadata: {
          user: `user-${i}@langfuse.com`,
        },
        projectId: trace.projectId,
        traceId: trace.id,
        // if this is the first span or in 50% of cases, add no parent; otherwise randomly select parent from existing spans
        ...(existingSpanIds.length === 0 || Math.random() > 0.5
          ? {}
          : {
              parentObservationId:
                existingSpanIds[
                  Math.floor(Math.random() * existingSpanIds.length)
                ],
            }),
      };

      observations.push(span);

      existingSpanIds.push(span.id);

      for (let k = 0; k < Math.floor(Math.random() * 2) + 1; k++) {
        // random start and end times within span
        const generationTsStart = new Date(
          spanTsStart.getTime() +
            Math.floor(
              Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime())
            )
        );
        const generationTsEnd = new Date(
          generationTsStart.getTime() +
            Math.floor(
              Math.random() *
                (spanTsEnd.getTime() - generationTsStart.getTime())
            )
        );
        // somewhere in the middle
        const generationTsCompletionStart = new Date(
          generationTsStart.getTime() +
            Math.floor(
              (generationTsEnd.getTime() - generationTsStart.getTime()) / 3
            )
        );

        const promptTokens = Math.floor(Math.random() * 1000) + 300;
        const completionTokens = Math.floor(Math.random() * 500) + 100;

        const models = [
          "gpt-3.5-turbo",
          "gpt-4",
          "gpt-4-32k-0613",
          "gpt-3.5-turbo-16k-0613",
          "claude-instant-1",
          "claude-2.1",
          "gpt-4-vision-preview",
          "MIXTRAL-8X7B",
        ];

        const model = models[Math.floor(Math.random() * models.length)];
        const promptId =
          promptIds.get(projectId)![
            Math.floor(
              Math.random() * Math.floor(promptIds.get(projectId)!.length / 2)
            )
          ];

        const generation = {
          type: ObservationType.GENERATION,
          id: `generation-${v4()}`,
          startTime: generationTsStart,
          endTime: generationTsEnd,
          completionStartTime:
            Math.random() > 0.5 ? generationTsCompletionStart : undefined,
          name: `generation-${i}-${j}-${k}`,
          projectId: trace.projectId,
          promptId: promptId,
          input:
            Math.random() > 0.5
              ? [
                  {
                    role: "system",
                    content: "Be a helpful assistant",
                  },
                  {
                    role: "user",
                    content: "How can i create a React component?",
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
                },
          output: {
            completion: `Creating a React component can be done in two ways: as a functional component or as a class component. Let's start with a basic example of both.

              1.  **Functional Component**:
              
              A functional component is just a plain JavaScript function that accepts props as an argument, and returns a React element. Here's how you can create one:
              
              
              'import React from 'react';  function Greeting(props) {   return <h1>Hello, {props.name}</h1>; }  export default Greeting;'
              
              To use this component in another file, you can do:
              
              
              'import Greeting from './Greeting';  function App() {   return (     <div>       <Greeting name="John" />     </div>   ); }  export default App;'
              
              2.  **Class Component**:
              
              You can also define components as classes in React. These have some additional features compared to functional components:
              
              
              'import React, { Component } from 'react';  class Greeting extends Component {   render() {     return <h1>Hello, {this.props.name}</h1>;   } }  export default Greeting;'
              
              And here's how to use this component:
              
              
              'import Greeting from './Greeting';  class App extends Component {   render() {     return (       <div>         <Greeting name="John" />       </div>     );   } }  export default App;'
              
              With the advent of hooks in React, functional components can do everything that class components can do and hence, the community has been favoring functional components over class components.
              
              Remember to import React at the top of your file whenever you're creating a component, because JSX transpiles to 'React.createElement' calls under the hood.`,
          },
          model: model,
          internalModel: model,
          modelParameters: {
            temperature:
              Math.random() > 0.9 ? undefined : Math.random().toFixed(2),
            topP: Math.random() > 0.9 ? undefined : Math.random().toFixed(2),
            maxTokens:
              Math.random() > 0.9
                ? undefined
                : Math.floor(Math.random() * 1000),
          },
          metadata: {
            user: `user-${i}@langfuse.com`,
          },
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          parentObservationId: span.id,
          traceId: trace.id,
          ...{
            ...(Math.random() > 0.5 ? { promptId: promptId } : {}),
          },
          unit: ModelUsageUnit.Tokens,
        };

        observations.push(generation);

        if (Math.random() > 0.6)
          scores.push({
            name: "quality",
            value: Math.random() * 2 - 1,
            observationId: generation.id,
            traceId: trace.id,
            source: ScoreSource.API,
            projectId: trace.projectId,
          });
        if (Math.random() > 0.6)
          scores.push({
            name: "conciseness",
            value: Math.random() * 2 - 1,
            observationId: generation.id,
            traceId: trace.id,
            source: ScoreSource.API,
            projectId: trace.projectId,
          });

        for (let l = 0; l < Math.floor(Math.random() * 2); l++) {
          // random start time within span
          const eventTs = new Date(
            spanTsStart.getTime() +
              Math.floor(
                Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime())
              )
          );

          events.push({
            type: ObservationType.EVENT,
            id: `event-${v4()}`,
            startTime: eventTs,
            name: `event-${i}-${j}-${k}-${l}`,
            metadata: {
              user: `user-${i}@langfuse.com`,
            },
            parentObservationId: span.id,
            traceId: trace.id,
            projectId: trace.projectId,
          });
        }
      }
    }
  }
  // find unique sessions by id and projectid
  const uniqueSessions: Prisma.TraceSessionCreateManyInput[] = Array.from(
    new Set(sessions.map((session) => JSON.stringify(session)))
  ).map((session) => JSON.parse(session) as Prisma.TraceSessionCreateManyInput);

  return {
    traces,
    observations,
    scores,
    configs,
    sessions: uniqueSessions,
    events,
  };
}

async function generatePromptsForProject(projects: Project[]) {
  const promptIds = new Map<string, string[]>();

  await Promise.all(
    projects.map(async (project) => {
      const promptIdsForProject = await generatePrompts(project);
      promptIds.set(project.id, promptIdsForProject);
    })
  );
  return promptIds;
}

async function generatePrompts(project: Project) {
  const promptIds: string[] = [];
  const prompts = [
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 1 content",
      name: "Prompt 1",
      version: 1,
      labels: ["production", "latest"],
    },
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 2 content",
      name: "Prompt 2",
      version: 1,
      labels: ["production", "latest"],
    },
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "API",
      prompt: "Prompt 3 content",
      name: "Prompt 3 by API",
      version: 1,
      labels: ["production", "latest"],
    },
    {
      id: `prompt-${v4()}`,
      projectId: project.id,
      createdBy: "user-1",
      prompt: "Prompt 4 content",
      name: "Prompt 4",
      version: 1,
      labels: ["production", "latest"],
      tags: ["tag1", "tag2"],
    },
  ];

  for (const prompt of prompts) {
    await prisma.prompt.upsert({
      where: {
        projectId_name_version: {
          projectId: prompt.projectId,
          name: prompt.name,
          version: prompt.version,
        },
      },
      create: {
        id: prompt.id,
        projectId: prompt.projectId,
        createdBy: prompt.createdBy,
        prompt: prompt.prompt,
        name: prompt.name,
        version: prompt.version,
        labels: prompt.labels,
        tags: prompt.tags,
      },
      update: {
        id: prompt.id,
      },
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
  const projectIdsToConfigs: Map<string, { name: string; id: string }[]> =
    new Map();

  await Promise.all(
    projects.map(async (project) => {
      const configNameAndId = await generateConfigs(project);
      projectIdsToConfigs.set(project.id, configNameAndId);
    })
  );
  return projectIdsToConfigs;
}

async function generateConfigs(project: Project) {
  const configNameAndId: { name: string; id: string }[] = [];

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
    configNameAndId.push({ name: config.name, id: config.id });
  }

  return configNameAndId;
}
