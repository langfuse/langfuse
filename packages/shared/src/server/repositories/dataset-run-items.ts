import { JsonValue } from "@prisma/client/runtime/library";
import { prisma } from "../../db";
import type { Prisma } from "@prisma/client";
import { v4 } from "uuid";

// Use Prisma's default inferred type for dataset runs (no field redefinition needed)
type DatasetRun = Prisma.DatasetRunsGetPayload<{}>;

type ValidateDatasetRunAndFetchReturn =
  | {
      success: true;
      datasetRun: DatasetRun;
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
    datasetIdToUse = dataset.id;
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
