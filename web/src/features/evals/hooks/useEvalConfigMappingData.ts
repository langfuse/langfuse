import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { EvalTargetObject, type ObservationType } from "@langfuse/shared";
import { type UseFormReturn, useWatch } from "react-hook-form";
import { useRouter } from "next/router";
import {
  type PreviewData,
  usePreviewData,
} from "@/src/features/evals/hooks/usePreviewData";
import { useEffect, useRef } from "react";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import {
  type EvalPreviewPointer,
  getEvalPreviewPointerFromUrlQuery,
  useFirstEvalPreviewPointer,
} from "@/src/features/evals/hooks/useEvalPreviewNavigation";

type EvalConfigMappingData = {
  namesByObject: Map<string, Set<string>>;
  isLoading: boolean;
  previewData: PreviewData | null;
};

export function useEvalConfigMappingData(
  projectId: string,
  form: UseFormReturn<EvalFormType>,
  disabled = false,
  selectedPreviewPointer?: EvalPreviewPointer,
): EvalConfigMappingData {
  const router = useRouter();
  const { isBetaEnabled } = useV4Beta();

  const targetValue = useWatch({ control: form.control, name: "target" });
  const firstPreviewPointer = useFirstEvalPreviewPointer({
    target: targetValue,
    useEventsTable: isBetaEnabled,
  });
  const urlPreviewPointer = getEvalPreviewPointerFromUrlQuery(
    router.query,
    targetValue,
  );
  // Peek navigation wins over URL state; URL state wins over the table's first row.
  const previewPointer =
    selectedPreviewPointer ?? urlPreviewPointer ?? firstPreviewPointer;

  const { previewData, isLoading } = usePreviewData({
    projectId,
    enabled: !disabled && Boolean(previewPointer),
    target: targetValue,
    traceId: previewPointer?.traceId,
    observationId: previewPointer?.observationId,
    timestamp: previewPointer?.timestamp,
  });

  const prevTargetRef = useRef(targetValue);
  const isLocallyManagedPreview = Boolean(selectedPreviewPointer);

  // drop the traceId and observation-related params from the URL query parameters when target changes
  useEffect(() => {
    if (isLocallyManagedPreview) {
      prevTargetRef.current = targetValue;
      return;
    }

    if (
      prevTargetRef.current !== targetValue &&
      prevTargetRef.current !== undefined
    ) {
      // Remove navigation-related params when target changes
      const { traceId, observationId, timestamp, startTime, ...restQuery } =
        router.query;

      // Use replace to avoid adding to browser history
      router.replace(
        {
          pathname: router.pathname,
          query: restQuery,
        },
        undefined,
        { shallow: true },
      );
    }
    prevTargetRef.current = targetValue;
  }, [targetValue, router, isLocallyManagedPreview]);

  const observationTypeToNames = new Map<ObservationType, Set<string>>([
    ["SPAN", new Set()],
    ["EVENT", new Set()],
    ["GENERATION", new Set()],
  ]);

  // Only populate observation names for trace evals (where observations are available)
  if (previewData?.type === EvalTargetObject.TRACE) {
    previewData.trace.observations.forEach((observation) => {
      if (observation.type && observation.name) {
        observationTypeToNames.get(observation.type)?.add(observation.name);
      }
    });
  }

  return {
    namesByObject: observationTypeToNames,
    isLoading,
    previewData,
  };
}
