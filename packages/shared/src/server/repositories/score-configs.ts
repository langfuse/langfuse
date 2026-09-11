import { prisma } from "../../db";
import {
  filterAndValidateDbScoreConfigList,
  validateDbScoreConfigSafe,
} from "../../features/scoreConfigs/validation";
import { LangfuseNotFoundError, InternalServerError } from "../../errors";
import { traceException } from "../instrumentation";

export const listScoreConfigs = async ({
  projectId,
  fromTimestamp,
  toTimestamp,
  page,
  limit,
}: {
  projectId: string;
  fromTimestamp?: Date;
  toTimestamp?: Date;
  page: number;
  limit: number;
}) => {
  // Build the time-window filter on `createdAt`. Both params are
  // independently optional; together they form a half-open
  // `[fromTimestamp, toTimestamp)` range. The window composes with the
  // existing project scope — it can only narrow the result set, never
  // widen it.
  const createdAtFilter =
    fromTimestamp || toTimestamp
      ? {
          createdAt: {
            ...(fromTimestamp ? { gte: fromTimestamp } : {}),
            ...(toTimestamp ? { lt: toTimestamp } : {}),
          },
        }
      : {};

  const where = {
    projectId,
    ...createdAtFilter,
  };

  const [rawConfigs, totalItems] = await Promise.all([
    prisma.scoreConfig.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.scoreConfig.count({
      where,
    }),
  ]);

  const configs = filterAndValidateDbScoreConfigList(
    rawConfigs,
    traceException,
  );

  return {
    data: configs,
    meta: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

export const getScoreConfig = async ({
  projectId,
  configId,
}: {
  projectId: string;
  configId: string;
}) => {
  const config = await prisma.scoreConfig.findUnique({
    where: {
      id: configId,
      projectId,
    },
  });

  if (!config) {
    throw new LangfuseNotFoundError(
      "Score config not found within authorized project",
    );
  }

  const parsedConfig = validateDbScoreConfigSafe(config);
  if (!parsedConfig.success) {
    traceException(parsedConfig.error);
    throw new InternalServerError("Requested score config is corrupted");
  }

  return parsedConfig.data;
};
