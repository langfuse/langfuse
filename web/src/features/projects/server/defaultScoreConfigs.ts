import { logger } from "@langfuse/shared/src/server";
import { type Prisma } from "@langfuse/shared/src/db";

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

type DefaultScoreConfigWriter = {
  scoreConfig: {
    createMany: (args: {
      data: Prisma.ScoreConfigCreateManyInput[];
    }) => Promise<unknown>;
  };
};

// Runs after the project row is committed. A database error here is swallowed
// so project creation still succeeds; the project then has no default configs.
export async function createDefaultScoreConfigs(
  db: DefaultScoreConfigWriter,
  projectId: string,
) {
  try {
    await db.scoreConfig.createMany({
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
