import { usdFormatter } from "@/src/utils/numbers";
import {
  type DatasetRunItemByRunRowData,
  type DatasetRunItemByItemRowData,
} from "./types";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";

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
    totalCost: !!item.observation?.calculatedTotalCost
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : !!item.trace?.totalCost
        ? usdFormatter(item.trace.totalCost)
        : undefined,
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
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: !!item.observation?.calculatedTotalCost
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : !!item.trace?.totalCost
        ? usdFormatter(item.trace.totalCost)
        : undefined,
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
  };
};
