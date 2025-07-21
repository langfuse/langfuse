import { commandClickhouse } from "./clickhouse";
import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../db";
import type { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { env } from "../../env";

// Use Prisma's default inferred type for dataset runs (no field redefinition needed)
type DatasetRun = Prisma.DatasetRunsGetPayload<{}>;
type DatasetItem = Prisma.DatasetItemGetPayload<{}>;

type ValidateDatasetRunAndFetchReturn =
  | {
      success: true;
      datasetRun: DatasetRun;
    }
  | {
      success: false;
      error: string;
    };

type ValidateDatasetItemAndFetchReturn =
  | {
      success: true;
      datasetItem: DatasetItem;
    }
  | {
      success: false;
      error: string;
    };

export const validateDatasetRunAndFetch = async (params: {
  datasetId: string;
  runName: string;
  projectId: string;
}): Promise<ValidateDatasetRunAndFetchReturn> => {
  const { datasetId, runName, projectId } = params;

  const datasetRun = await prisma.datasetRuns.findUnique({
    where: {
      datasetId_projectId_name: {
        datasetId,
        name: runName,
        projectId,
      },
    },
  });

  if (!datasetRun) {
    return {
      success: false,
      error:
        "Dataset run not found for the given project, dataset id and run name",
    };
  }

  return {
    success: true,
    datasetRun: datasetRun,
  };
};

export const validateDatasetItemAndFetch = async (params: {
  datasetId: string;
  itemId: string;
  projectId: string;
}): Promise<ValidateDatasetItemAndFetchReturn> => {
  const { datasetId, itemId, projectId } = params;

  const datasetItem = await prisma.datasetItem.findFirst({
    where: {
      datasetId,
      projectId,
      id: itemId,
      status: "ACTIVE",
    },
  });

  if (!datasetItem) {
    return {
      success: false,
      error:
        "Dataset item not found for the given project, dataset id and item id or is not active",
    };
  }

  return {
    success: true,
    datasetItem: datasetItem,
  };
};

export const createOrFetchDatasetRun = async ({
  projectId,
  datasetId,
  name,
  description,
  metadata,
}: {
  projectId: string;
  datasetId: string;
  name: string;
  description?: string;
  metadata?: JsonValue;
}) => {
  try {
    // Attempt optimistic creation
    const datasetRun = await prisma.datasetRuns.create({
      data: {
        id: v4(),
        datasetId,
        projectId,
        name: name,
        description: description || null,
        metadata: metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
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

const isUniqueConstraintError = (error: any): boolean => {
  return (
    error.code === "P2002" || // Prisma unique constraint
    error.message?.includes("duplicate key") ||
    error.message?.includes("UNIQUE constraint") ||
    error.message?.includes("violates unique constraint")
  );
};

export const deleteDatasetRunItemsByProjectId = async (projectId: string) => {
  const query = `
      DELETE FROM dataset_run_items
      WHERE project_id = {projectId: String};
    `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};
