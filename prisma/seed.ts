import { PrismaClient } from "@prisma/client";
import {
  hashSecretKey,
  getDisplaySecretKey,
} from "@/src/features/publicApi/lib/apiKeys";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.create({
    data: {
      id: "user-1",
      name: "Demo User",
      email: "demo@langfuse.com",
      password: await hash("password", 12),
    },
  });

  const project = await prisma.project.create({
    data: {
      id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      name: "llm-app",
      apiKeys: {
        create: [
          {
            note: "seeded key",
            hashedSecretKey: await hashSecretKey("sk-lf-1234567890"),
            displaySecretKey: getDisplaySecretKey("sk-lf-1234567890"),
            publishableKey: "pk-lf-1234567890",
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
  });

  for (let i = 0; i < 1000; i++) {
    // print progress to console with a progress bar that refreshes every 10 iterations
    if (i % 10 === 0) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(`Seeding ${i} of 1000`);
    }
    // random date within last 90 days, with a linear bias towards more recent dates
    const traceTs = new Date(
      Date.now() - Math.floor(Math.random() ** 1.5 * 90 * 24 * 60 * 60 * 1000)
    );

    const trace = await prisma.trace.create({
      data: {
        id: `trace-${Math.floor(Math.random() * 1000000000)}`,
        timestamp: traceTs,
        name: ["generate-outreach", "label-inbound", "draft-response"][
          i % 3
        ] as string,
        attributes: {
          user: `user-${i}@langfuse.com`,
        },
        status: "success",
        project: {
          connect: {
            id: project.id,
          },
        },
        scores: {
          createMany: {
            data: [
              {
                name: "latency",
                value: Math.floor(Math.random() * 20),
                timestamp: traceTs,
              },
              {
                name: "feedback",
                value: Math.floor(Math.random() * 3) - 1,
                timestamp: traceTs,
              },
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
        traceTs.getTime() + Math.floor(Math.random() * 30)
      );
      // random duration of upto 30ms
      const spanTsEnd = new Date(
        spanTsStart.getTime() + Math.floor(Math.random() * 30)
      );

      const span = await prisma.observation.create({
        data: {
          type: "SPAN",
          id: `span-${Math.floor(Math.random() * 1000000000)}`,
          startTime: spanTsStart,
          endTime: spanTsEnd,
          name: `span-${i}-${j}`,
          attributes: {
            user: `user-${i}@langfuse.com`,
          },
          trace: {
            connect: {
              id: trace.id,
            },
          },
          // if this is the first span, add no parent; if not, then randomly select parent from existing spans or the first span
          ...(existingSpanIds.length === 0
            ? {}
            : {
                parent: {
                  connect: {
                    id: existingSpanIds[
                      Math.floor(Math.random() * existingSpanIds.length)
                    ],
                  },
                },
              }),
        },
      });

      existingSpanIds.push(span.id);

      for (let k = 0; k < Math.floor(Math.random() * 2) + 1; k++) {
        // random start and end times within span
        const llmCallTsStart = new Date(
          spanTsStart.getTime() +
            Math.floor(
              Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime())
            )
        );
        const llmCallTsEnd = new Date(
          llmCallTsStart.getTime() +
            Math.floor(
              Math.random() * (spanTsEnd.getTime() - llmCallTsStart.getTime())
            )
        );

        const llmCall = await prisma.observation.create({
          data: {
            type: "LLMCALL",
            id: `llm-call-${Math.floor(Math.random() * 1000000000)}`,
            startTime: llmCallTsStart,
            endTime: llmCallTsEnd,
            name: `llm-call-${i}-${j}-${k}`,
            attributes: {
              user: `user-${i}@langfuse.com`,
              prompt: "PROMPT TEXT SEEDED",
              completion: "COMPLETION TEXT SEEDED",
              model: {
                name: Math.random() > 0.5 ? "gpt-3.5-turbo" : "gpt-4",
                temperature: 0,
              },
              tokens: {
                prompt: Math.floor(Math.random() * 1000) + 300,
                completion: Math.floor(Math.random() * 500) + 100,
              },
            },
            parent: {
              connect: {
                id: span.id,
              },
            },
            trace: {
              connect: {
                id: trace.id,
              },
            },
          },
        });

        for (let l = 0; l < Math.floor(Math.random() * 2); l++) {
          // random start time within span
          const eventTs = new Date(
            spanTsStart.getTime() +
              Math.floor(
                Math.random() * (spanTsEnd.getTime() - spanTsStart.getTime())
              )
          );

          const event = await prisma.observation.create({
            data: {
              type: "EVENT",
              id: `event-${Math.floor(Math.random() * 1000000000)}`,
              startTime: eventTs,
              name: `event-${i}-${j}-${k}-${l}`,
              attributes: {
                user: `user-${i}@langfuse.com`,
              },
              parent: {
                connect: {
                  id: span.id,
                },
              },
              trace: {
                connect: {
                  id: trace.id,
                },
              },
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
