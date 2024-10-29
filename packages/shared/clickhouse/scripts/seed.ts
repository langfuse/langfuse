import { clickhouseClient } from "@langfuse/shared/src/server";
import { prisma } from "../../src/db";
import { redis } from "@langfuse/shared/src/server";
import { prepareClickhouse } from "../../scripts/prepareClickhouse";

async function main() {
  try {
    const projectIds = [
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      "239ad00f-562f-411d-af14-831c75ddd875",
    ]; // Example project IDs
    await prepareClickhouse(projectIds, {
      numberOfDays: 3,
      totalObservations: 1000,
    });

    console.log("Clickhouse preparation completed successfully.");
  } catch (error) {
    console.error("Error during Clickhouse preparation:", error);
  } finally {
    await clickhouseClient.close();
    await prisma.$disconnect();
    redis?.disconnect();
    console.log("Disconnected from Clickhouse.");
  }
}

main();
