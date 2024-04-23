import { prisma } from "@langfuse/shared/src/db";
import logger from "../logger";

export const pruneDatabase = async () => {
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
};
