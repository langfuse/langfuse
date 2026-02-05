import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { api, type RouterOutputs } from "@/src/utils/api";
import { EvalTargetObject } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { isEventTarget } from "@/src/features/evals/utils/typeHelpers";
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
      data: RouterOutputs["observations"]["byId"];
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
      enabled: enabled && !observationId && isEventEval && !isBetaEnabled,
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
      enabled: enabled && !observationId && isEventEval && isBetaEnabled,
    },
  );

  const latestObservationTraceId = !!observationId
    ? traceId
    : isBetaEnabled
      ? latestObservationBeta.data?.observations[0]?.traceId
      : latestObservation.data?.generations[0]?.traceId;
  const latestObservationObservationId = !!observationId
    ? observationId
    : isBetaEnabled
      ? latestObservationBeta.data?.observations[0]?.id
      : latestObservation.data?.generations[0]?.id;

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
        isEventEval,
    },
  );

  const previewData: PreviewData | null = isEventEval
    ? observationDetails.data &&
      latestObservationTraceId &&
      latestObservationObservationId
      ? {
          type: EvalTargetObject.EVENT,
          traceId: latestObservationTraceId,
          observationId: latestObservationObservationId,
          data: observationDetails.data,
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
    observationDetails.isLoading;

  return {
    previewData,
    isLoading,
  };
}
