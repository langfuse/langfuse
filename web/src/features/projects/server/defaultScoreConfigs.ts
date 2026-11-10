import { prisma, type Prisma } from "@langfuse/shared/src/db";
import { logger } from "@langfuse/shared/src/server";

const DEFAULT_PROJECT_SCORE_CONFIGS: Omit<
  Prisma.ScoreConfigCreateManyInput,
  "projectId"
>[] = [
  {
    name: "open coding",
    dataType: "TEXT",
  },
  {
    name: "pass or fail",
    dataType: "CATEGORICAL",
    categories: [
      { label: "Pass", value: 1 },
      { label: "Fail", value: 0 },
    ],
  },
];

// Runs after the project row is committed. A database error here is swallowed
// so project creation still succeeds; the project then has no default configs.
export async function createDefaultScoreConfigs(projectId: string) {
  try {
    await prisma.scoreConfig.createMany({
      data: DEFAULT_PROJECT_SCORE_CONFIGS.map((config) => ({
        ...config,
        projectId,
      })),
    });
  } catch (error) {
    logger.warn("Failed to create default score configs", {
      projectId,
      error,
    });
  }
}
