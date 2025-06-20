import { prisma } from "../../src/db";
import { redis } from "../../src/server";
import { prepareClickhouse } from "./prepare-clickhouse";

async function main() {
  try {
    const projectIds = ["7a88fb47-b4e2-43b8-a06c-a5ce950dc53a"]; // Example project IDs
    if (
      await prisma.project.findFirst({
        where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
      })
    ) {
      projectIds.push("239ad00f-562f-411d-af14-831c75ddd875");
    }
    await prepareClickhouse(projectIds, {
      numberOfDays: 3,
      totalObservations: 1000,
      numberOfRuns: 3,
    });

    console.log("Clickhouse preparation completed successfully.");
  } catch (error) {
    console.error("Error during Clickhouse preparation:", error);
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
    console.log("Disconnected from Clickhouse.");
  }
}

main();
