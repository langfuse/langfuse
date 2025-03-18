import { prisma } from "../../src/db";
import { ObservationRecordReadType, redis } from "../../src/server";
import { prepareClickhouse } from "../../scripts/prepareClickhouse";
import { createDatasets } from "../../prisma/seed";
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
    });

    const project1 = await prisma.project.findFirst({
      where: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
    });

    const project2 =
      projectIds.length > 1
        ? await prisma.project.findFirst({
            where: { id: "239ad00f-562f-411d-af14-831c75ddd875" },
          })
        : await prisma.project.findFirst();

    const query = `
        SELECT *
        FROM observations o
        WHERE o.project_id IN ({projectIds: Array(String)})
        LIMIT 2000;
      `;

    const res = await queryClickhouse<ObservationRecordReadType>({
      query,
      params: {
        projectIds,
      },
    });

    await createDatasets(
      project1!,
      project2!,
      (await Promise.all(res.map(convertObservation))).map((o) => ({
        ...o,
        metadata: {},
        modelParameters: {},
        input: {},
        output: {},
      })),
    );

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
