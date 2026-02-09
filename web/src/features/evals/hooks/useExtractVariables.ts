import { type PreviewData } from "@/src/features/evals/hooks/usePreviewData";
import { type VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { useObservationEvals } from "@/src/features/events/hooks/useObservationEvals";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { EvalTargetObject, extractValueFromObject } from "@langfuse/shared";
import { useEffect, useState, useRef } from "react";

/**
 * Helper function to find an observation by name in the trace data
 */
function getObservationByName(
  objectName: string | null | undefined,
  observations: Record<string, unknown>[] | undefined,
): Record<string, unknown> | null {
  if (!objectName || !observations) {
    return null;
  }
  return observations.find((o) => o.name === objectName) || null;
}

type ExtractedVariable = {
  variable: string;
  value: unknown;
};

export function useExtractVariables({
  variables,
  variableMapping,
  previewData,
  isLoading,
}: {
  variables: string[];
  variableMapping: VariableMapping[];
  previewData: PreviewData;
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const isBetaEnabled = useObservationEvals();
  const [extractedVariables, setExtractedVariables] = useState<
    ExtractedVariable[]
  >([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<Error | null>(null);
  const previousMappingRef = useRef<string>("");

  // Create a stable string representation of the current mapping for comparison
  const currentMappingString =
    variables.length > 0 ? JSON.stringify(variableMapping) : "";

  const id =
    previewData.type === EvalTargetObject.EVENT
      ? previewData.observationId
      : previewData.traceId;
  const idRef = useRef<string | undefined>(id);

  // Handle error toasts separately to avoid repeated toasts on re-renders
  useEffect(() => {
    if (extractionError) {
      trpcErrorToast(extractionError);
    }
  }, [extractionError]);

  useEffect(() => {
    // Return early conditions
    if (isLoading) {
      setExtractedVariables([]);
      return;
    }

    // If no variables, only update if current state is not empty
    if (!Boolean(variables.length)) {
      setExtractedVariables((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    // Check if the variableMapping has changed by comparing string representations
    // OR if the target ID has changed
    const mappingChanged = previousMappingRef.current !== currentMappingString;
    const idChanged = idRef.current !== id;
    const shouldExtract = mappingChanged || idChanged;

    // Update the id reference
    if (idChanged) {
      idRef.current = id;
    }

    // Exit if we don't need to extract
    if (!shouldExtract) {
      return;
    }

    // Clear existing variables immediately when id changes to avoid showing stale data
    if (idChanged) {
      setExtractedVariables(
        variables.map((variable) => ({ variable, value: "n/a" })),
      );
    }

    // Set loading state and clear previous errors
    setIsExtracting(true);
    setExtractionError(null);

    // Process all variables and collect promises
    const extractPromises = variables.map(async (variable) => {
      const mapping = variableMapping.find(
        (m) => m.templateVariable === variable,
      );

      if (
        !mapping ||
        !mapping.selectedColumnId ||
        (!mapping.langfuseObject &&
          !(isBetaEnabled && previewData.type === "event"))
      ) {
        return { variable, value: "n/a" };
      }

      let object;

      if (previewData.type === "event") {
        object = previewData.data; // Already has input/output
      } else {
        // Trace eval: can map to trace or observation fields
        if (mapping.langfuseObject === "trace") {
          object = previewData.data;
        } else if (mapping.langfuseObject !== "dataset_item") {
          // Find observation by name from mapping
          const observation = getObservationByName(
            mapping.objectName,
            previewData.data.observations as Record<string, unknown>[],
          );

          if (observation?.id) {
            try {
              // Fetch observation to get input/output
              const observationWithInputAndOutput =
                await utils.observations.byId.fetch({
                  observationId: observation.id as string,
                  startTime: observation.startTime as Date | null,
                  traceId: previewData.data.id as string,
                  projectId: previewData.data.projectId as string,
                });
              object = observationWithInputAndOutput;
            } catch (error) {
              console.error(`Error fetching observation data:`, error);
            }
          }
        }
      }

      if (!object) {
        return { variable, value: "n/a" };
      }

      const { value, error } = extractValueFromObject(
        object,
        mapping.selectedColumnId,
        mapping.jsonSelector ?? undefined,
      );
      return { variable, value, error };
    });

    // Resolve all promises and update state
    Promise.all(extractPromises)
      .then((results) => {
        const firstError = results.find(
          (result) => result.error instanceof Error,
        );
        if (firstError) {
          setExtractionError(firstError.error as Error);
        }
        setExtractedVariables(results);
        // Update the ref to the current mapping string to track changes
        previousMappingRef.current = currentMappingString;
      })
      .catch((error) => {
        console.error("Error extracting variables:", error);
        setExtractionError(error);
        setExtractedVariables(
          variables.map((variable) => ({
            variable,
            value: "",
          })),
        );
      })
      .finally(() => {
        setIsExtracting(false);
      });
    // Include all dependencies that should trigger a re-extraction
  }, [
    variables,
    variableMapping,
    currentMappingString,
    isLoading,
    id,
    utils.observations.byId,
    previewData,
    isBetaEnabled,
  ]);

  return { extractedVariables, isExtracting };
}
