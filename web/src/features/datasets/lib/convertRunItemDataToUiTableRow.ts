import { usdFormatter } from "@/src/utils/numbers";
import {
  type DatasetRunItemByRunRowData,
  type DatasetRunItemByItemRowData,
} from "./types";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { isPresent } from "@langfuse/shared";

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
    totalCost: isPresent(item.observation?.calculatedTotalCost)
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : isPresent(item.trace?.totalCost)
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
    datasetItemVersion: item.datasetItemVersion ?? undefined,
    trace: !!item.trace?.id
      ? {
          traceId: item.trace.id,
          observationId: item.observation?.id,
        }
      : undefined,
    scores: item.scores,
    totalCost: isPresent(item.observation?.calculatedTotalCost)
      ? usdFormatter(item.observation.calculatedTotalCost.toNumber())
      : isPresent(item.trace?.totalCost)
        ? usdFormatter(item.trace.totalCost)
        : undefined,
    latency: item.observation?.latency ?? item.trace?.duration ?? undefined,
  };
};
