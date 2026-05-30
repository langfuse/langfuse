import { LangfuseNotFoundError, type jsonSchema } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { addToDeleteDatasetQueue } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { generateDatasetRunItemsForPublicApi } from "@/src/features/public-api/server/dataset-run-items";
import { v4 } from "uuid";
import type z from "zod";

type Json = z.infer<typeof jsonSchema>;

const isUniqueConstraintError = (error: any): boolean => {
  return (
    error.code === "P2002" || // Prisma unique constraint
    error.message?.includes("duplicate key") ||
    error.message?.toLowerCase().includes("unique constraint") ||
    error.message?.includes("violates unique constraint")
  );
};

/**
 * Create or fetch a dataset run with optimistic concurrency handling.
 *
 * Behavior:
 * - First tries to find an existing run by (projectId, datasetId, name).
 * - If not found, attempts to create it.
 * - If creation fails due to a unique constraint (likely created concurrently),
 *   fetches and returns the existing run.
 * - If all steps fail, throws an error.
 *
 * Rationale: The public API can receive many POST requests almost simultaneously,
 * which is not concurrency-safe without this guard.
 */
export const createOrFetchDatasetRun = async ({
  projectId,
  datasetId,
  name,
  description,
  metadata,
  createdAt,
}: {
  projectId: string;
  datasetId: string;
  name: string;
  description?: string;
  metadata?: Json | null;
  createdAt?: Date;
}) => {
  try {
    // Attempt to fetch existing run
    const existingRun = await prisma.datasetRuns.findUnique({
      where: {
        datasetId_projectId_name: {
          datasetId,
          projectId,
          name: name,
        },
      },
    });
    if (existingRun) {
      return existingRun;
    }

    // Attempt creation
    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: v4(),
        datasetId,
        projectId,
        name,
        description: description ?? null,
        metadata: metadata ?? {},
        createdAt: createdAt ?? new Date(),
        updatedAt: createdAt ?? new Date(),
      },
    });
    return datasetRun;
  } catch (error) {
    // Check if it's a unique constraint violation
    if (isUniqueConstraintError(error)) {
      // Fetch existing run
      const existingRun = await prisma.datasetRuns.findUnique({
        where: {
          datasetId_projectId_name: {
            datasetId,
            projectId,
            name: name,
          },
        },
      });

      if (existingRun) {
        return existingRun;
      }
    } else {
      throw error;
    }
  }

  throw new Error("Failed to create or fetch dataset run");
};

export const listDatasetRunsByDatasetIdForApi = async ({
  datasetId,
  projectId,
  page,
  limit,
}: {
  datasetId: string;
  projectId: string;
  page: number;
  limit: number;
}) => {
  const dataset = await prisma.dataset.findUnique({
    where: {
      id_projectId: {
        id: datasetId,
        projectId,
      },
    },
    include: {
      datasetRuns: {
        where: { projectId },
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      },
    },
  });

  if (!dataset) {
    throw new LangfuseNotFoundError("Dataset not found");
  }

  const totalItems = await prisma.datasetRuns.count({
    where: {
      datasetId,
      projectId,
    },
  });

  return {
    datasetName: dataset.name,
    runs: dataset.datasetRuns,
    totalItems,
  };
};

export const getDatasetRunByIdForApi = async ({
  datasetId,
  runId,
  projectId,
}: {
  datasetId: string;
  runId: string;
  projectId: string;
}) => {
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      id_projectId: {
        id: runId,
        projectId,
      },
    },
    include: {
      dataset: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!datasetRun || datasetRun.dataset.id !== datasetId) {
    throw new LangfuseNotFoundError("Dataset run not found");
  }

  const { dataset, ...run } = datasetRun;
  const datasetRunItems = await generateDatasetRunItemsForPublicApi({
    props: {
      datasetId,
      runId: run.id,
      projectId,
    },
  });

  return {
    run: {
      ...run,
      datasetName: dataset.name,
    },
    datasetRunItems,
  };
};

export const deleteDatasetRunByIdForApi = async ({
  datasetId,
  runId,
  projectId,
  orgId,
  apiKeyId,
}: {
  datasetId: string;
  runId: string;
  projectId: string;
  orgId: string;
  apiKeyId?: string;
}) => {
  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      id_projectId: {
        id: runId,
        projectId,
      },
    },
  });

  if (!datasetRun || datasetRun.datasetId !== datasetId) {
    throw new LangfuseNotFoundError("Dataset run not found");
  }

  await prisma.datasetRuns.delete({
    where: {
      id_projectId: {
        projectId,
        id: runId,
      },
    },
  });

  await auditLog({
    action: "delete",
    resourceType: "datasetRun",
    resourceId: datasetRun.id,
    projectId,
    orgId,
    apiKeyId,
    before: datasetRun,
  });

  await addToDeleteDatasetQueue({
    deletionType: "dataset-runs",
    projectId,
    datasetRunIds: [datasetRun.id],
    datasetId: datasetRun.datasetId,
  });

  return datasetRun;
};
