import { prisma } from "../../src/db";
import { ObservationRecordReadType, redis } from "../../src/server";
import { prepareClickhouse } from "../../scripts/prepareClickhouse";
import { createDatasets } from "../../seeder/seed";
import { queryClickhouse } from "../../src/server/repositories/clickhouse";
import { convertObservation } from "../../src/server/repositories/observations_converters";

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
      totalObservations: 10000,
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
