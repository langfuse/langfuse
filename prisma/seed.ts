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
      type: "span",
      name: "sales-pilot-retrieval",
      attributes: {
        user: "user@lanfgfuse.com",
      },
      startTime: new Date(new Date().setMinutes(new Date().getMinutes() - 1)),
      endTime: new Date(),
    },
  });

  console.log({ trace, span });
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
