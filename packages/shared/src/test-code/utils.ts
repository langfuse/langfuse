import { prisma } from "../db";

export const pruneDatabase = async () => {
  await prisma.score.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.trace.deleteMany();
  await prisma.datasetItem.deleteMany();
  await prisma.dataset.deleteMany();
  await prisma.datasetRuns.deleteMany();
  await prisma.prompt.deleteMany();
  await prisma.events.deleteMany();
  await prisma.model.deleteMany();
};

export function createBasicAuthHeader(
  username: string,
  password: string
): string {
  const base64Credentials = Buffer.from(`${username}:${password}`).toString(
    "base64"
  );
  return `Basic ${base64Credentials}`;
}
