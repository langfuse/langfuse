import { api } from "@/src/utils/api";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
} from "@langfuse/shared";

export interface ObjectDataHook<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
  errorCode?: string;
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
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
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
      isError: false,
    };
  }

  switch (item.objectType) {
    case AnnotationQueueObjectType.TRACE:
    case AnnotationQueueObjectType.OBSERVATION:
      return {
        data: traceQuery.data,
        isLoading: traceQuery.isLoading,
        isError: traceQuery.isError,
        errorCode: traceQuery.error?.data?.code,
      };
    case AnnotationQueueObjectType.SESSION:
      return {
        data: sessionQuery.data,
        isLoading: sessionQuery.isLoading,
        isError: sessionQuery.isError,
        errorCode: sessionQuery.error?.data?.code,
      };
    default:
      // This should never happen as it's a DB enum
      throw new Error(`Unsupported object type: ${item.objectType}`);
  }
};
