import { type Prisma, type PrismaClient } from "@langfuse/shared/src/db";

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

export async function createDefaultScoreConfigs(
  db: PrismaClient | Prisma.TransactionClient,
  projectId: string,
) {
  await db.scoreConfig.createMany({
    data: DEFAULT_PROJECT_SCORE_CONFIGS.map((config) => ({
      ...config,
      projectId,
    })),
  });
}
