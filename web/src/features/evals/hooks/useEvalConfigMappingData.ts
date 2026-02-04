import { type EvalFormType } from "@/src/features/evals/utils/evaluator-form-utils";
import { EvalTargetObject, type ObservationType } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { useRouter } from "next/router";
import {
  PreviewData,
  usePreviewData,
} from "@/src/features/evals/hooks/usePreviewData";

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
    typeof router.query.observation === "string"
      ? router.query.observation
      : undefined;

  const { previewData, isLoading } = usePreviewData(
    projectId,
    form,
    !disabled,
    traceId,
    observationId,
  );

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
