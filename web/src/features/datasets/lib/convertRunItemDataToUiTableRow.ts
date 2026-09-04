import {
  type DatasetRunItemByRunRowData,
  type DatasetRunItemByItemRowData,
} from "./types";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { isPresent } from "@langfuse/shared";

const getRunItemTotalCost = (
  item: EnrichedDatasetRunItem,
): number | undefined => {
  const observationCost = item.observation?.calculatedTotalCost;
  if (isPresent(observationCost)) {
    return observationCost.toNumber();
  }
  if (isPresent(item.trace?.totalCost)) {
    return item.trace.totalCost;
  }
  return undefined;
};

export const convertRunItemToItemsByItemUiTableRow = (
  item: EnrichedDatasetRunItem,
): DatasetRunItemByItemRowData => {
  return {
    id: item.id,
    runAt: item.createdAt,
    datasetRunName: item.datasetRunName,
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: getRunItemTotalCost(item),
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
  };
};

export const convertRunItemToItemsByRunUiTableRow = (
  item: EnrichedDatasetRunItem,
): DatasetRunItemByRunRowData => {
  return {
    id: item.id,
    runAt: item.createdAt,
    datasetItemId: item.datasetItemId,
    datasetItemVersion: item.datasetItemVersion ?? undefined,
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: getRunItemTotalCost(item),
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
  };
};
