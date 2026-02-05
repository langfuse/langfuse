import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { EvalTargetObject, type ObservationType } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { useRouter } from "next/router";
import {
  type PreviewData,
  usePreviewData,
} from "@/src/features/evals/hooks/usePreviewData";
import { useEffect, useRef } from "react";

type EvalConfigMappingData = {
  namesByObject: Map<string, Set<string>>;
  isLoading: boolean;
  previewData: PreviewData | null;
};

export function useEvalConfigMappingData(
  projectId: string,
  form: UseFormReturn<EvalFormType>,
  disabled = false,
): EvalConfigMappingData {
  const router = useRouter();

  // Get traceId and observationId from URL query parameters
  const traceId =
    typeof router.query.traceId === "string" ? router.query.traceId : undefined;
  const observationId =
    typeof router.query.observationId === "string"
      ? router.query.observationId
      : undefined;

  const { previewData, isLoading } = usePreviewData(
    projectId,
    form,
    !disabled,
    traceId,
    observationId,
  );

  // drop the traceId and observation-related params from the URL query parameters when target changes
  const targetValue = form.watch("target");
  const prevTargetRef = useRef(targetValue);

  useEffect(() => {
    // Only run when target actually changes (not on initial mount)
    if (
      prevTargetRef.current !== targetValue &&
      prevTargetRef.current !== undefined
    ) {
      // Remove both 'observationId' (used in eval pages) and 'observation' (used in trace detail links)
      const { traceId, observationId, observation, ...restQuery } =
        router.query;

      // Use replace to avoid adding to browser history
      void router.replace(
        {
          pathname: router.pathname,
          query: restQuery,
        },
        undefined,
        { shallow: true },
      );
    }
    prevTargetRef.current = targetValue;
  }, [targetValue, router]);

  const observationTypeToNames = new Map<ObservationType, Set<string>>([
    ["SPAN", new Set()],
    ["EVENT", new Set()],
    ["GENERATION", new Set()],
  ]);

  // Only populate observation names for trace evals (where observations are available)
  if (previewData?.type === EvalTargetObject.TRACE) {
    previewData?.data?.observations.forEach((observation) => {
      if (observation.type && observation.name) {
        observationTypeToNames.get(observation.type)?.add(observation.name);
      }
    });
  }

  return {
    namesByObject: new Map<string, Set<string>>(),
    isLoading,
    previewData,
  };
}
