import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const trace = await prisma.trace.create({
    data: {
      id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53b",
      timestamp: new Date(),
      name: "sales-pilot",
      attributes: {
        user: "user@lanfgfuse.com",
      },
      status: "success",
    },
  });

  const span = await prisma.observation.create({
    data: {
      id: "57a266de-df34-4cea-b4e4-087bb6a3eac0",
      trace: { connect: { id: trace.id } },
      type: "SPAN",
      name: "sales-pilot-retrieval",
      attributes: {
        user: "user@lanfgfuse.com",
      },
      startTime: new Date(new Date().setMinutes(new Date().getMinutes() - 1)),
      endTime: new Date(),
    },
  });

  const event = await prisma.observation.create({
    data: {
      id: "57a266de-df34-4cea-b4e4-78vcdhuv6",
      type: "EVENT",
      startTime: new Date(),
      trace: { connect: { id: trace.id } },
      parent: {
        connect: {
          id: span.id,
        },
      },
      name: "sales-pilot-vector-db-response",
      attributes: {
        docs: ["Doc 1", "Doc 2", "Doc 3"],
      },
    },
  });

  const llmCall = await prisma.observation.create({
    data: {
      id: "57a266de-df34-4cea-b4e4-678fdshj3678",
      trace: { connect: { id: trace.id } },
      type: "LLMCALL",
      name: "sales-pilot-retrieval-llm",
      attributes: {
        user: "user@lanfgfuse.com",
        prompt: "Hello world",
        completion: "Completion",
        tokens: {
          prompt: 2500,
          completion: 100,
        },
        model: {
          name: "gpt-3.5-turbo",
          provider: "OpenAI",
          temperature: 0,
        },
      },
      parent: {
        connect: {
          id: span.id,
        },
      },
      startTime: new Date(new Date().setMinutes(new Date().getMinutes() - 0.5)),
      endTime: new Date(),
    },
  });

  const score1 = await prisma.score.create({
    data: {
      name: "user_feedback",
      value: 1,
      trace: {
        connect: {
          id: trace.id,
        },
      },
      observation: {
        connect: {
          id: llmCall.id,
        },
      },
    },
  });

  const score2 = await prisma.score.create({
    data: {
      name: "change_of_completion",
      value: 22,
      trace: {
        connect: {
          id: trace.id,
        },
      },
    },
  });

  console.log({
    trace,
    span,
    event,
    llmCall,
    grading1: score1,
    grading2: score2,
  });
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
