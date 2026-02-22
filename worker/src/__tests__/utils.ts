import { prisma } from "@langfuse/shared/src/db";

import { env } from "../env";
import { logger } from "@langfuse/shared/src/server";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export const pruneDatabase = async () => {
  const parsedUrl = new URL(env.DATABASE_URL);
  if (!LOCAL_HOSTNAMES.has(parsedUrl.hostname)) {
    throw new Error("You cannot prune database unless running on localhost.");
  }

  logger.info("Pruning database");
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.model.deleteMany();
  await prisma.jobExecution.deleteMany();
  await prisma.jobConfiguration.deleteMany();
  await prisma.evalTemplate.deleteMany();
  await prisma.llmApiKeys.deleteMany();
  await prisma.price.deleteMany();
};
