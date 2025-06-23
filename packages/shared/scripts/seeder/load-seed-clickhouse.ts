import { randomUUID } from "crypto";
import { prisma } from "../../src/db";
import { getDisplaySecretKey, hashSecretKey, logger } from "../../src/server";
import { prepareClickhouse } from "./prepare-clickhouse";
import { redis } from "../../src/server";

const createRandomProjectId = () => randomUUID().toString();

const prepareProjectsAndApiKeys = async (
  numOfProjects: number,
  opts: { requiredProjectIds: string[] },
) => {
  const { requiredProjectIds } = opts;
  const projectsToCreate = numOfProjects - requiredProjectIds.length;
  const projectIds = [...requiredProjectIds];

  for (let i = 0; i < projectsToCreate; i++) {
    projectIds.push(createRandomProjectId());
  }

  const operations = projectIds.map(async (projectId) => {
    const orgId = `org-${projectId}`;

    await prisma.organization.upsert({
      where: { id: orgId },
      update: {},
      create: {
        id: orgId,
        name: `Organization for ${projectId}`,
        cloudConfig: {
          plan: "Team",
        },
      },
    });

    await prisma.project.upsert({
      where: { id: projectId },
      update: {},
      create: {
        id: projectId,
        name: `Project ${projectId}`,
        orgId: orgId,
      },
    });

    const apiKeyId = `api-key-${projectId}`;
    const apiKeyExists = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
    });
    if (!apiKeyExists) {
      const sk = await hashSecretKey(
        `sk-${Math.random().toString(36).substr(2, 9)}`,
      );
      await prisma.apiKey.create({
        data: {
          id: apiKeyId,
          note: `API Key for ${projectId}`,
          publicKey: `pk-${Math.random().toString(36).substr(2, 9)}`,
          hashedSecretKey: sk,
          displaySecretKey: getDisplaySecretKey(sk),
          scope: "PROJECT",
          project: {
            connect: {
              id: projectId,
            },
          },
        },
      });
    }
  });

  await Promise.all(operations);
  return projectIds;
};

async function main() {
  let numOfProjects = parseInt(process.argv[2], 10);
  let numberOfDays = parseInt(process.argv[3], 10);
  let totalObservations = parseInt(process.argv[4], 10);

  logger.info(process.argv);
  logger.info(
    `Preparing Clickhouse for ${numOfProjects} projects and ${numberOfDays} days with max Observations ${totalObservations}.`,
  );

  if (isNaN(totalObservations)) {
    logger.warn(
      "Total observations not provided or invalid. Defaulting to 1000 observations.",
    );
    totalObservations = 1000;
  }

  if (isNaN(numOfProjects)) {
    logger.warn(
      "Number of projects not provided or invalid. Defaulting to 10 projects.",
    );
    numOfProjects = 10;
  }

  if (isNaN(numberOfDays)) {
    logger.warn(
      "Number of days not provided or invalid. Defaulting to 3 days.",
    );
    numberOfDays = 3;
  }

  try {
    const projectIds = [
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      "239ad00f-562f-411d-af14-831c75ddd875",
    ];

    const createdProjectIds = await prepareProjectsAndApiKeys(numOfProjects, {
      requiredProjectIds: projectIds,
    });

    await prepareClickhouse(createdProjectIds, {
      numberOfDays,
      totalObservations: totalObservations ?? 1000,
      numberOfRuns: 3,
    });

    logger.info("Clickhouse preparation completed successfully.");
  } catch (error) {
    logger.error("Error during Clickhouse preparation:", error);
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
    logger.info("Disconnected from Clickhouse.");
  }
}

main();
