import { prisma } from "../../db";
import {
  filterAndValidateDbScoreConfigList,
  validateDbScoreConfigSafe,
} from "../../features/scoreConfigs/validation";
import { LangfuseNotFoundError, InternalServerError } from "../../errors";
import { traceException } from "../instrumentation";

export const listScoreConfigs = async ({
  projectId,
  page,
  limit,
}: {
  projectId: string;
  page: number;
  limit: number;
}) => {
  const [rawConfigs, totalItems] = await Promise.all([
    prisma.scoreConfig.findMany({
      where: {
        projectId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.scoreConfig.count({
      where: {
        projectId,
      },
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
