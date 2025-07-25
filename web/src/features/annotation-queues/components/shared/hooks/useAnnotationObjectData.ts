import { api } from "@/src/utils/api";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
} from "@langfuse/shared";

export interface ObjectDataHook<TData> {
  data: TData | undefined;
  isLoading: boolean;
}

export const useAnnotationObjectData = (
  item: (AnnotationQueueItem & { parentTraceId?: string | null }) | null,
  projectId: string,
): ObjectDataHook<any> => {
  const traceId = item?.parentTraceId ?? item?.objectId;

  const traceQuery = api.traces.byIdWithObservationsAndScores.useQuery(
    { traceId: traceId as string, projectId },
    {
      enabled:
        !!item &&
        (item.objectType === AnnotationQueueObjectType.TRACE ||
          item.objectType === AnnotationQueueObjectType.OBSERVATION),
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
    },
  );

  const sessionQuery = api.sessions.byIdWithScores.useQuery(
    {
      sessionId: item?.objectId as string,
      projectId,
    },
    {
      enabled: !!item && item.objectType === AnnotationQueueObjectType.SESSION,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  if (!item) {
    return {
      data: undefined,
      isLoading: false,
    };
  }

  switch (item.objectType) {
    case AnnotationQueueObjectType.TRACE:
    case AnnotationQueueObjectType.OBSERVATION:
      return {
        data: traceQuery.data,
        isLoading: traceQuery.isLoading,
      };
    case AnnotationQueueObjectType.SESSION:
      return {
        data: sessionQuery.data,
        isLoading: sessionQuery.isLoading,
      };
    default:
      // This should never happen as it's a DB enum
      throw new Error(`Unsupported object type: ${item.objectType}`);
  }
};
