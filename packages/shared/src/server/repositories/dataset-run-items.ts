import { commandClickhouse, queryClickhouse } from "./clickhouse";
import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../db";
import type { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { env } from "../../env";
import { DatasetRunItemRecordReadType } from "./definitions";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";

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
  projectId: string;
  datasetId?: string;
  datasetName?: string;
  runName?: string;
  runId?: string;
}): Promise<ValidateDatasetRunAndFetchReturn> => {
  const { datasetId, runName, runId, projectId, datasetName } = params;

  if (!runName && !runId) {
    return {
      success: false,
      error: "Run name or run id is required",
    };
  }

  if (!datasetId && !datasetName) {
    return {
      success: false,
      error: "Dataset id or dataset name is required",
    };
  }

  let datasetIdToUse = datasetId;
  if (!datasetId && datasetName) {
    const dataset = await prisma.dataset.findFirst({
      where: {
        name: datasetName,
        projectId,
      },
    });

    if (!dataset) {
      return {
        success: false,
        error: "Dataset not found for the given project and dataset name",
      };
    }
  }

  let datasetRun: DatasetRun | null = null;
  if (runName && datasetIdToUse) {
    datasetRun = await prisma.datasetRuns.findUnique({
      where: {
        datasetId_projectId_name: {
          datasetId: datasetIdToUse,
          name: runName,
          projectId,
        },
      },
    });
  } else if (runId) {
    datasetRun = await prisma.datasetRuns.findFirst({
      where: {
        id: runId,
        projectId,
      },
    });
  }

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

export const deleteDatasetRunItemsByDatasetRunId = async (
  projectId: string,
  datasetRunId: string,
  datasetId: string,
) => {
  const query = `
    DELETE FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_run_id = {datasetRunId: String}
    AND dataset_id = {datasetId: String}
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunId,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "datasets",
      action: "delete",
    },
  });
};

export const getDatasetRunItemsByRunId = async ({
  projectId,
  runId,
  datasetId,
}: {
  projectId: string;
  runId: string;
  datasetId: string;
}) => {
  const query = `
    SELECT * FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_run_id = {runId: String}
    AND dataset_id = {datasetId: String}
  `;

  const rows = await queryClickhouse<DatasetRunItemRecordReadType>({
    query,
    params: {
      projectId,
      runId,
      datasetId,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "byRunId",
      projectId,
    },
  });
  return rows.map(convertDatasetRunItemClickhouseToDomain);
};
