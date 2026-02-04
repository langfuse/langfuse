import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { api, RouterOutputs } from "@/src/utils/api";
import { EvalTargetObject } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { isEventTarget } from "@/src/features/evals/utils/typeHelpers";

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
  // For trace evals without traceId: fetch latest trace matching filter
  const isEventEval = isEventTarget(form.watch("target"));
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
      enabled: enabled && !traceId && !isEventEval,
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
      enabled: enabled && !!actualTraceId && !isEventEval,
    },
  );

  // For event evals: fetch only the single observation
  const observationDetails = api.observations.byId.useQuery(
    {
      projectId,
      traceId: actualTraceId as string,
      observationId: observationId as string,
      startTime: null,
    },
    {
      enabled: enabled && !!actualTraceId && !!observationId && isEventEval,
    },
  );

  const previewData: PreviewData | null = isEventEval
    ? observationDetails.data && actualTraceId && observationId
      ? {
          type: EvalTargetObject.EVENT,
          traceId: actualTraceId,
          observationId: observationId,
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
