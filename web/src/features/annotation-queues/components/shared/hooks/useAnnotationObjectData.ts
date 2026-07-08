import { api } from "@/src/utils/api";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";

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
  const { isBetaEnabled } = useV4Beta();
  const traceId = item?.parentTraceId ?? item?.objectId;

  const isTraceOrObservation =
    !!item &&
    (item.objectType === AnnotationQueueObjectType.TRACE ||
      item.objectType === AnnotationQueueObjectType.OBSERVATION);

  // Old path: fetch from traces table (beta OFF)
  const traceQuery = api.traces.byIdWithObservationsAndScores.useQuery(
    { traceId: traceId as string, projectId },
    {
      enabled: isTraceOrObservation && !isBetaEnabled,
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

  const eventsData = useEventsTraceData({
    projectId,
    traceId: traceId ?? "",
    enabled: isTraceOrObservation && isBetaEnabled,
  });

  const isSession =
    !!item && item.objectType === AnnotationQueueObjectType.SESSION;

  // Old path: fetch from traces table (beta OFF)
  const sessionQuery = api.sessions.byIdWithScores.useQuery(
    {
      sessionId: item?.objectId as string,
      projectId,
    },
    {
      enabled: isSession && !isBetaEnabled,
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

  // New path: fetch from events table (beta ON)
  const sessionEventsQuery = api.sessions.byIdWithScoresFromEvents.useQuery(
    {
      sessionId: item?.objectId as string,
      projectId,
    },
    {
      enabled: isSession && isBetaEnabled,
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
      if (isBetaEnabled) {
        return {
          data: eventsData.data,
          isLoading: eventsData.isLoading,
          isError: !!eventsData.error,
          errorCode: (eventsData.error as any)?.data?.code,
        };
      }
      return {
        data: traceQuery.data,
        isLoading: traceQuery.isLoading,
        isError: traceQuery.isError,
        errorCode: traceQuery.error?.data?.code,
      };
    case AnnotationQueueObjectType.SESSION:
      if (isBetaEnabled) {
        return {
          data: sessionEventsQuery.data,
          isLoading: sessionEventsQuery.isLoading,
          isError: sessionEventsQuery.isError,
          errorCode: sessionEventsQuery.error?.data?.code,
        };
      }
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
