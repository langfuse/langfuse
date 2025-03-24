import { type RouterOutput } from "@/src/utils/types";

export type QueueItemType =
  RouterOutput["annotationQueueItems"]["byId"]["item"] & {
    parentTraceId: string | null;
  };
