import { prisma } from "../../db";
import {
  filterAndValidateDbScoreConfigList,
  validateDbScoreConfigSafe,
} from "../../features/scoreConfigs/validation";
import { LangfuseNotFoundError, InternalServerError } from "../../errors";
import { traceException } from "../instrumentation";
import type { ScoreConfigDataType } from "@prisma/client";

export const listScoreConfigs = async ({
  projectId,
  dataType,
  page,
  limit,
}: {
  projectId: string;
  dataType?: ScoreConfigDataType;
  page: number;
  limit: number;
}) => {
  // Optional categorical filter on `dataType`. The column is indexed
  // (`@@index([dataType])` in `packages/shared/prisma/schema.prisma`),
  // so the filter is cheap.
  const dataTypeFilter = dataType ? { dataType } : {};

  const where = {
    projectId,
    ...dataTypeFilter,
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
