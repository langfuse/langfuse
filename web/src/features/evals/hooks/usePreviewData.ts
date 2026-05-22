import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { api, type RouterOutputs } from "@/src/utils/api";
import { EvalTargetObject, type FilterState } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export type PreviewData =
  | {
      type: typeof EvalTargetObject.TRACE;
      traceId: string;
      data: RouterOutputs["traces"]["byIdWithObservationsAndScores"];
    }
  | {
      type: typeof EvalTargetObject.EVENT;
      traceId: string;
      observationId: string;
      data:
        | RouterOutputs["observations"]["byId"]
        | RouterOutputs["events"]["batchIO"][number]
        | NonNullable<
            RouterOutputs["events"]["experimentEvalPreviewObservation"]
          >
        | undefined;
    };

// Temporary workaround to make filter backwards compatible with generations table
const transformFilterForGenerations = (filter: FilterState | null) => {
  if (!filter) return [];
  return filter.map((f) => {
    if (f.column === "tags") {
      return {
        ...f,
        column: "traceTags",
      };
    }
    return f;
  });
};

export function usePreviewData(
  projectId: string,
  form: UseFormReturn<EvalFormType>,
  enabled: boolean,
  traceId: string | undefined,
  observationId: string | undefined,
): { previewData: PreviewData | null; isLoading: boolean } {
  const { isBetaEnabled } = useV4Beta();

  // For trace evals without traceId: fetch latest trace matching filter
  const target = form.watch("target");
  const isEventEval = isEventTarget(target);
  const isExperimentEval = isExperimentTarget(target);
  const shouldUseExperimentPreview = isExperimentEval && isBetaEnabled;
  const shouldUseObservationPreview = isEventEval || shouldUseExperimentPreview;
  const isTraceEval = target === EvalTargetObject.TRACE;
  const latestTrace = api.traces.all.useQuery(
    {
      projectId,
      filter: form.watch("filter"),
      searchQuery: "",
      searchType: [],
      limit: 1,
      page: 0,
      orderBy: { column: "timestamp", order: "DESC" },
    },
    {
      enabled: enabled && !traceId && isTraceEval,
    },
  );

  const actualTraceId = traceId ?? latestTrace.data?.traces[0]?.id;

  // For trace evals: fetch full trace with observations
  const traceDetails = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      projectId,
      traceId: actualTraceId as string,
    },
    {
      enabled: enabled && !!actualTraceId && isTraceEval,
    },
  );

  const latestObservation = api.generations.all.useQuery(
    {
      projectId,
      filter: transformFilterForGenerations(form.watch("filter")) ?? [],
      searchQuery: "",
      searchType: [],
      limit: 1,
      page: 0,
      orderBy: {
        column: "startTime",
        order: "DESC",
      },
    },
    {
      enabled:
        enabled &&
        !observationId &&
        isEventEval &&
        !isBetaEnabled &&
        !shouldUseExperimentPreview,
    },
  );

  const latestObservationBeta = api.events.all.useQuery(
    {
      projectId,
      filter: form.watch("filter") ?? [],
      searchQuery: "",
      searchType: [],
      limit: 1,
      page: 0,
      orderBy: {
        column: "startTime",
        order: "DESC",
      },
    },
    {
      enabled:
        enabled &&
        !observationId &&
        isEventEval &&
        isBetaEnabled &&
        !shouldUseExperimentPreview,
    },
  );

  const experimentPreviewObservation =
    api.events.experimentEvalPreviewObservation.useQuery(
      {
        projectId,
        filter: form.watch("filter") ?? [],
        traceId,
        observationId,
      },
      {
        enabled: enabled && shouldUseExperimentPreview,
      },
    );

  const latestObservationTraceId = !!observationId
    ? traceId
    : shouldUseExperimentPreview
      ? experimentPreviewObservation.data?.traceId
      : isBetaEnabled
        ? latestObservationBeta.data?.observations[0]?.traceId
        : latestObservation.data?.generations[0]?.traceId;
  const latestObservationObservationId = !!observationId
    ? observationId
    : shouldUseExperimentPreview
      ? experimentPreviewObservation.data?.id
      : isBetaEnabled
        ? latestObservationBeta.data?.observations[0]?.id
        : latestObservation.data?.generations[0]?.id;

  const latestObservationStartTime =
    latestObservationBeta.data?.observations[0]?.startTime;
  const latestObservationEndTime =
    latestObservationBeta.data?.observations[0]?.endTime;

  // For event evals: fetch only the single observation
  const observationDetails = api.observations.byId.useQuery(
    {
      projectId,
      traceId: latestObservationTraceId as string,
      observationId: latestObservationObservationId as string,
      startTime: null,
    },
    {
      enabled:
        enabled &&
        !!latestObservationTraceId &&
        !!latestObservationObservationId &&
        isEventEval &&
        !isBetaEnabled,
    },
  );

  const observationDetailsBeta = api.events.batchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: latestObservationObservationId as string,
          traceId: latestObservationTraceId as string,
        },
      ],
      minStartTime: latestObservationStartTime as Date,
      maxStartTime: latestObservationEndTime as Date,
      truncated: false,
    },
    {
      enabled:
        enabled &&
        !!latestObservationTraceId &&
        !!latestObservationObservationId &&
        !!latestObservationStartTime &&
        !!latestObservationEndTime &&
        isEventEval &&
        isBetaEnabled &&
        !shouldUseExperimentPreview,
    },
  );

  const observationPreviewData = shouldUseExperimentPreview
    ? experimentPreviewObservation.data
    : isBetaEnabled
      ? observationDetailsBeta.data?.[0]
      : observationDetails.data;

  const previewData: PreviewData | null = shouldUseObservationPreview
    ? observationPreviewData &&
      latestObservationTraceId &&
      latestObservationObservationId
      ? {
          type: EvalTargetObject.EVENT,
          traceId: latestObservationTraceId,
          observationId: latestObservationObservationId,
          data: observationPreviewData,
        }
      : null
    : traceDetails.data && actualTraceId
      ? {
          type: EvalTargetObject.TRACE,
          traceId: actualTraceId,
          data: traceDetails.data,
        }
      : null;

  const isLoading =
    latestTrace.isLoading ||
    traceDetails.isLoading ||
    latestObservation.isLoading ||
    latestObservationBeta.isLoading ||
    experimentPreviewObservation.isLoading ||
    (isBetaEnabled && !shouldUseExperimentPreview
      ? observationDetailsBeta.isLoading
      : observationDetails.isLoading);

  return {
    previewData,
    isLoading,
  };
}
