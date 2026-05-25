import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  EvalTargetObject,
  extractValueFromObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "@langfuse/shared";

export type PreviewDataFields = {
  input: unknown;
  output: unknown;
  metadata: unknown;
  experimentItemExpectedOutput: unknown;
  experimentItemMetadata: unknown;
};

type TracePreviewData = {
  type: typeof EvalTargetObject.TRACE;
  traceId: string;
  timestamp: Date | null;
  observationId?: undefined;
  trace: RouterOutputs["traces"]["byIdWithObservationsAndScores"];
};

type ObservationPreviewData = {
  type: typeof EvalTargetObject.EVENT;
  traceId: string;
  observationId: string;
  timestamp: Date | null;
  data: PreviewDataFields;
};

export type PreviewData = TracePreviewData | ObservationPreviewData;

type PreviewResult = {
  previewData: PreviewData | null;
  isLoading: boolean;
};

type UsePreviewDataParams = {
  projectId: string;
  enabled: boolean;
  target: EvalTargetObjectType;
  traceId?: string;
  observationId?: string;
  timestamp?: Date;
};

type PreviewMode = "none" | "trace" | "observation" | "event" | "experiment";

const EMPTY_PREVIEW_RESULT: PreviewResult = {
  previewData: null,
  isLoading: false,
};

function getPreviewMode({
  enabled,
  target,
  shouldUseEventsTable,
}: {
  enabled: boolean;
  target: EvalTargetObjectType;
  shouldUseEventsTable: boolean;
}): PreviewMode {
  if (!enabled) return "none";
  if (target === EvalTargetObject.TRACE) return "trace";
  if (isExperimentTarget(target) && shouldUseEventsTable) return "experiment";
  if (isEventTarget(target)) {
    return shouldUseEventsTable ? "event" : "observation";
  }
  return "none";
}

function normalizePreviewDataFields(
  record: Record<string, unknown> | null | undefined,
): PreviewDataFields {
  return {
    input: getRecordValue(record, "input"),
    output: getRecordValue(record, "output"),
    metadata: getRecordValue(record, "metadata"),
    experimentItemExpectedOutput: getRecordValue(
      record,
      "experimentItemExpectedOutput",
    ),
    experimentItemMetadata: getRecordValue(record, "experimentItemMetadata"),
  };
}

function getRecordValue(
  record: Record<string, unknown> | null | undefined,
  selectedColumnId: string,
) {
  if (!record) return null;

  const { value } = extractValueFromObject(record, selectedColumnId);
  return value === undefined ? null : value;
}

function useTracePreview({
  projectId,
  traceId,
  timestamp,
  enabled,
}: Pick<UsePreviewDataParams, "projectId" | "traceId" | "timestamp"> & {
  enabled: boolean;
}): PreviewResult {
  const traceDetails = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      projectId,
      traceId: traceId as string,
      timestamp: timestamp ?? null,
    },
    {
      enabled: enabled && !!traceId,
    },
  );

  return {
    previewData:
      traceDetails.data && traceId
        ? {
            type: EvalTargetObject.TRACE,
            traceId,
            timestamp: traceDetails.data.timestamp ?? timestamp ?? null,
            trace: traceDetails.data,
          }
        : null,
    isLoading: traceDetails.isLoading,
  };
}

function useObservationPreview({
  projectId,
  traceId,
  observationId,
  timestamp,
  enabled,
}: Pick<
  UsePreviewDataParams,
  "projectId" | "traceId" | "observationId" | "timestamp"
> & {
  enabled: boolean;
}): PreviewResult {
  const observationDetails = api.observations.byId.useQuery(
    {
      projectId,
      traceId: traceId as string,
      observationId: observationId as string,
      startTime: timestamp ?? null,
    },
    {
      enabled: enabled && !!traceId && !!observationId,
    },
  );

  return {
    previewData:
      observationDetails.data && traceId && observationId
        ? {
            type: EvalTargetObject.EVENT,
            traceId,
            observationId,
            timestamp: observationDetails.data.startTime ?? null,
            data: normalizePreviewDataFields(
              observationDetails.data as Record<string, unknown>,
            ),
          }
        : null,
    isLoading: observationDetails.isLoading,
  };
}

function useEventPreview({
  projectId,
  traceId,
  observationId,
  timestamp,
  enabled,
}: Pick<
  UsePreviewDataParams,
  "projectId" | "traceId" | "observationId" | "timestamp"
> & {
  enabled: boolean;
}): PreviewResult {
  const eventDetails = api.events.batchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: observationId as string,
          traceId: traceId as string,
        },
      ],
      minStartTime: timestamp as Date,
      maxStartTime: timestamp as Date,
      truncated: false,
    },
    {
      enabled: enabled && !!observationId && !!traceId && !!timestamp,
    },
  );

  return {
    previewData:
      observationId && traceId && timestamp && eventDetails.data?.[0]
        ? {
            type: EvalTargetObject.EVENT,
            traceId,
            observationId,
            timestamp,
            data: normalizePreviewDataFields(
              eventDetails.data[0] as Record<string, unknown>,
            ),
          }
        : null,
    isLoading: eventDetails.isLoading,
  };
}

function useExperimentPreview({
  projectId,
  traceId,
  observationId,
  timestamp,
  enabled,
}: Pick<
  UsePreviewDataParams,
  "projectId" | "traceId" | "observationId" | "timestamp"
> & {
  enabled: boolean;
}): PreviewResult {
  const experimentDetails = api.events.experimentBatchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: observationId as string,
          traceId: traceId as string,
        },
      ],
      minStartTime: timestamp as Date,
      maxStartTime: timestamp as Date,
      truncated: false,
    },
    {
      enabled: enabled && !!observationId && !!traceId && !!timestamp,
    },
  );

  return {
    previewData:
      observationId && traceId && timestamp && experimentDetails.data?.[0]
        ? {
            type: EvalTargetObject.EVENT,
            traceId,
            observationId,
            timestamp,
            data: normalizePreviewDataFields(
              experimentDetails.data[0] as Record<string, unknown>,
            ),
          }
        : null,
    isLoading: experimentDetails.isLoading,
  };
}

export function usePreviewData({
  projectId,
  enabled,
  target,
  traceId,
  observationId,
  timestamp,
}: UsePreviewDataParams): PreviewResult {
  const { isBetaEnabled } = useV4Beta();
  const mode = getPreviewMode({
    enabled,
    target,
    shouldUseEventsTable: isBetaEnabled,
  });

  const tracePreview = useTracePreview({
    projectId,
    traceId,
    timestamp,
    enabled: mode === "trace",
  });
  const observationPreview = useObservationPreview({
    projectId,
    traceId,
    observationId,
    timestamp,
    enabled: mode === "observation",
  });
  const eventPreview = useEventPreview({
    projectId,
    traceId,
    observationId,
    timestamp,
    enabled: mode === "event",
  });
  const experimentPreview = useExperimentPreview({
    projectId,
    traceId,
    observationId,
    timestamp,
    enabled: mode === "experiment",
  });

  if (mode === "trace") return tracePreview;
  if (mode === "observation") return observationPreview;
  if (mode === "event") return eventPreview;
  if (mode === "experiment") return experimentPreview;

  return EMPTY_PREVIEW_RESULT;
}
