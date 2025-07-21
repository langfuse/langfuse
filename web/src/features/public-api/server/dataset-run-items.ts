import { type PostDatasetRunItemsV1Body } from "@/src/features/public-api/types/datasets";
import { prisma } from "@langfuse/shared/src/db";
import { getObservationById } from "@langfuse/shared/src/server";
import type z from "zod/v4";
import type { Prisma } from "@prisma/client";

// Use Prisma's default inferred type for dataset items (no field redefinition needed)
type DatasetItem = Prisma.DatasetItemGetPayload<{}>;

type ValidateDatasetItemAndFetchReturn =
  | {
      success: true;
      datasetItem: DatasetItem;
      traceId: string;
      observationId: string | null;
    }
  | {
      success: false;
      error: string;
    };

export const validateCreateDatasetRunItemBodyAndFetch = async (
  body: z.infer<typeof PostDatasetRunItemsV1Body>,
  projectId: string,
): Promise<ValidateDatasetItemAndFetchReturn> => {
  const { datasetItemId, observationId, traceId } = body;

  const datasetItem = await prisma.datasetItem.findUnique({
    where: {
      id_projectId: {
        projectId,
        id: datasetItemId,
      },
      status: "ACTIVE",
    },
  });

  if (!datasetItem) {
    return { success: false, error: "Dataset item not found or not active" };
  }

  let finalTraceId = traceId;

  // Backwards compatibility: historically, dataset run items were linked to observations, not traces
  if (!traceId && observationId) {
    const observation = await getObservationById({
      id: observationId,
      projectId,
      fetchWithInputOutput: true,
    });
    if (observationId && !observation) {
      return { success: false, error: "Observation not found" };
    }
    finalTraceId = observation?.traceId;
  }

  if (!finalTraceId) {
    return { success: false, error: "Trace not found" };
  }

  return {
    success: true,
    datasetItem,
    traceId: finalTraceId,
    observationId: observationId ?? null,
  };
};
