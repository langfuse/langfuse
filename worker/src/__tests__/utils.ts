import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import { clickhouseClient, logger } from "@langfuse/shared/src/server";
export const pruneDatabase = async () => {
  if (!env.DATABASE_URL.includes("localhost:5432")) {
    throw new Error("You cannot prune database unless running on localhost.");
  }

  logger.info("Pruning database");
  await prisma.score.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.events.deleteMany();
  await prisma.model.deleteMany();
  await prisma.jobExecution.deleteMany();
  await prisma.jobConfiguration.deleteMany();
  await prisma.evalTemplate.deleteMany();
  await prisma.llmApiKeys.deleteMany();
  await prisma.price.deleteMany();

  if (env.CLICKHOUSE_URL) {
    if (!env.CLICKHOUSE_URL?.includes("localhost:8123")) {
      throw new Error("You cannot prune database unless running on localhost.");
    }

    logger.info("Pruning Clickhouse database");
    await clickhouseClient.command({ query: "delete from traces where true" });
    await clickhouseClient.command({
      query: "delete from observations where true",
    });
    await clickhouseClient.command({ query: "delete from scores where true" });
  }
};
