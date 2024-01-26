import { PrismaClient } from "@prisma/client";
import {
  hashSecretKey,
  getDisplaySecretKey,
} from "@/src/features/public-api/lib/apiKeys";
import { hash } from "bcryptjs";
import { parseArgs } from "node:util";

const options = {
  environment: { type: "string" },
} as const;

const prisma = new PrismaClient();

const TRACE_VOLUME = 100;

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
      members: {
        create: {
          role: "OWNER",
          userId: user.id,
        },
      },
    },
  });

  const prompt = await prisma.prompt.upsert({
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
      isActive: true,
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
  if (environment === "examples") {
    const project2 = await prisma.project.upsert({
      where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
      create: {
        name: "demo-app",
        apiKeys: {
          create: [
            {
              note: "seeded key",
              hashedSecretKey: await hashSecretKey("sk-lf-asdfghjkl"),
              displaySecretKey: getDisplaySecretKey("sk-lf-asdfghjkl"),
              publicKey: "pk-lf-asdfghjkl",
            },
          ],
        },
        members: {
          create: {
            role: "OWNER",
            userId: user.id,
          },
        },
      },
      update: {},
    });

    const generationIds: string[] = [];
    const envTags = [null, "development", "staging", "production"];
    const colorTags = [null, "red", "blue", "yellow"];

    for (let i = 0; i < TRACE_VOLUME; i++) {
      // print progress to console with a progress bar that refreshes every 10 iterations
      if ((i + 1) % 10 === 0 || i === TRACE_VOLUME - 1) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`Seeding ${i + 1} of ${TRACE_VOLUME}`);
      }
      // random date within last 90 days, with a linear bias towards more recent dates
      const traceTs = new Date(
        Date.now() -
          Math.floor(Math.random() ** 1.5 * 90 * 24 * 60 * 60 * 1000),
      );

      const envTag = envTags[Math.floor(Math.random() * envTags.length)];
      const colorTag = colorTags[Math.floor(Math.random() * colorTags.length)];

      const tags = [envTag, colorTag].filter((tag) => tag !== null);

      const projectId = [project1.id, project2.id][i % 2] as string;

      const trace = await prisma.trace.create({
        data: {
          id: `trace-${Math.floor(Math.random() * 1000000000)}`,
          timestamp: traceTs,
          name: ["generate-outreach", "label-inbound", "draft-response"][
            i % 3
          ] as string,
          metadata: {
            user: `user-${i}@langfuse.com`,
          },
          tags: tags as string[],
          project: {
            connect: { id: projectId },
          },
          userId: `user-${i % 10}`,
          session:
            Math.random() > 0.3
              ? {
                  connectOrCreate: {
                    where: {
                      id_projectId: {
                        id: `session-${i % 10}`,
                        projectId: projectId,
                      },
                    },
                    create: {
                      id: `session-${i % 10}`,
                      projectId: projectId,
                    },
                  },
                }
              : undefined,
          input:
            Math.random() > 0.3
              ? "I'm looking for a React component"
              : undefined,
          output:
            Math.random() > 0.3
              ? "What kind of component are you looking for?"
              : undefined,
          scores: {
            createMany: {
              data: [
                ...(Math.random() > 0.5
                  ? [
                      {
                        name: "feedback",
                        value: Math.floor(Math.random() * 3) - 1,
                        timestamp: traceTs,
                      },
                    ]
                  : []),
                ...(Math.random() > 0.7
                  ? [
                      {
                        name: "sentiment",
                        value: Math.floor(Math.random() * 10) - 5,
                        timestamp: traceTs,
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      });

      const existingSpanIds: string[] = [];

      for (let j = 0; j < Math.floor(Math.random() * 10) + 1; j++) {
        // add between 1 and 30 ms to trace timestamp
        const spanTsStart = new Date(
          traceTs.getTime() + Math.floor(Math.random() * 30),
        );
        // random duration of upto 30ms
        const spanTsEnd = new Date(
          spanTsStart.getTime() + Math.floor(Math.random() * 30),
        );

        const span = await prisma.observation.create({
          data: {
            type: "SPAN",
            id: `span-${Math.floor(Math.random() * 1000000000)}`,
            startTime: spanTsStart,
            endTime: spanTsEnd,
            name: `span-${i}-${j}`,
            metadata: {
              user: `user-${i}@langfuse.com`,
            },
            project: { connect: { id: trace.projectId } },
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
          },
        });

        existingSpanIds.push(span.id);

        for (let k = 0; k < Math.floor(Math.random() * 2) + 1; k++) {
          // random start and end times within span
          const generationTsStart = new Date(
            spanTsStart.getTime() +
              Math.floor(
                Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime()),
              ),
          );
          const generationTsEnd = new Date(
            generationTsStart.getTime() +
              Math.floor(
                Math.random() *
                  (spanTsEnd.getTime() - generationTsStart.getTime()),
              ),
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

          const generation = await prisma.observation.create({
            data: {
              type: "GENERATION",
              id: `generation-${Math.floor(Math.random() * 1000000000)}`,
              startTime: generationTsStart,
              endTime: generationTsEnd,
              name: `generation-${i}-${j}-${k}`,
              project: { connect: { id: trace.projectId } },
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
                topP:
                  Math.random() > 0.9 ? undefined : Math.random().toFixed(2),
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
                ...(Math.random() > 0.5 && trace.projectId === prompt.projectId
                  ? { prompt: { connect: { id: prompt.id } } }
                  : {}),
              },
              unit: model
                ? model.includes("claude")
                  ? "CHARACTERS"
                  : "TOKENS"
                : undefined,
            },
          });
          if (Math.random() > 0.6)
            await prisma.score.create({
              data: {
                name: "quality",
                value: Math.random() * 2 - 1,
                observationId: generation.id,
                traceId: trace.id,
              },
            });
          if (Math.random() > 0.6)
            await prisma.score.create({
              data: {
                name: "conciseness",
                value: Math.random() * 2 - 1,
                observationId: generation.id,
                traceId: trace.id,
              },
            });

          generationIds.push(generation.id);

          for (let l = 0; l < Math.floor(Math.random() * 2); l++) {
            // random start time within span
            const eventTs = new Date(
              spanTsStart.getTime() +
                Math.floor(
                  Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime()),
                ),
            );

            await prisma.observation.create({
              data: {
                type: "EVENT",
                id: `event-${Math.floor(Math.random() * 1000000000)}`,
                startTime: eventTs,
                name: `event-${i}-${j}-${k}-${l}`,
                metadata: {
                  user: `user-${i}@langfuse.com`,
                },
                parentObservationId: span.id,
                traceId: trace.id,
                project: { connect: { id: trace.projectId } },
              },
            });
          }
        }
      }
    }

    for (let datasetNumber = 0; datasetNumber < 2; datasetNumber++) {
      const dataset = await prisma.dataset.create({
        data: {
          name: `demo-dataset-${datasetNumber}`,
          projectId: project2.id,
        },
      });

      for (let datasetRunNumber = 0; datasetRunNumber < 2; datasetRunNumber++) {
        const datasetRun = await prisma.datasetRuns.create({
          data: {
            name: `demo-dataset-run-${datasetRunNumber}`,
            datasetId: dataset.id,
          },
        });

        for (let runNumber = 0; runNumber < 10; runNumber++) {
          //pick randomly from existingSpanIds
          const sourceObservationId =
            generationIds[Math.floor(Math.random() * generationIds.length)];
          const runObservationId =
            generationIds[Math.floor(Math.random() * generationIds.length)];

          const datasetItem = await prisma.datasetItem.create({
            data: {
              datasetId: dataset.id,
              sourceObservationId:
                Math.random() > 0.5 ? sourceObservationId : undefined,
              input: [
                {
                  role: "user",
                  content: "How can i create a React component?",
                },
              ],
              expectedOutput:
                "Creating a React component can be done in two ways: as a functional component or as a class component. Let's start with a basic example of both.",
            },
          });

          await prisma.datasetRunItems.create({
            data: {
              datasetItemId: datasetItem.id,
              observationId: runObservationId!,
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
