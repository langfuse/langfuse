import { type VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { api } from "@/src/utils/api";
import { extractValueFromObject } from "@langfuse/shared";
import { useEffect, useState, useRef } from "react";

/**
 * Helper function to find an observation by name in the trace data
 */
function getObservation(
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
  trace,
  isLoading,
}: {
  variables: string[];
  variableMapping: VariableMapping[];
  trace?: Record<string, unknown> & {
    observations?: Record<string, unknown>[];
  };
  isLoading: boolean;
}) {
  const utils = api.useUtils();
  const [extractedVariables, setExtractedVariables] = useState<
    ExtractedVariable[]
  >([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const previousMappingRef = useRef<string>("");

  // Create a stable string representation of the current mapping for comparison
  const currentMappingString = JSON.stringify(variableMapping);

  // Create a stable reference to the trace ID
  const traceId = trace?.id;
  const traceIdRef = useRef<string | undefined>(traceId as string | undefined);

  useEffect(() => {
    // Return early conditions
    if (isLoading || !variables.length) {
      setExtractedVariables(
        variables.map((variable) => ({ variable, value: "n/a" })),
      );
      return;
    }

    // Check if the variableMapping has changed by comparing string representations
    // OR if the trace ID has changed
    const mappingChanged = previousMappingRef.current !== currentMappingString;
    const traceChanged = traceIdRef.current !== traceId;
    const shouldExtract = mappingChanged || traceChanged;

    // Update the trace ID reference
    if (traceChanged) {
      traceIdRef.current = traceId as string | undefined;
    }

    // Exit if we don't need to extract
    if (!shouldExtract) {
      return;
    }

    // Clear existing variables immediately when trace changes to avoid showing stale data
    if (traceChanged) {
      setExtractedVariables(
        variables.map((variable) => ({ variable, value: "n/a" })),
      );
    }

    // Set loading state
    setIsExtracting(true);

    // Process all variables and collect promises
    const extractPromises = variables.map(async (variable) => {
      const mapping = variableMapping.find(
        (m) => m.templateVariable === variable,
      );

      if (!mapping || !mapping.selectedColumnId) {
        return { variable, value: "n/a" };
      }

      let object;
      if (mapping.langfuseObject === "trace") {
        object = trace;
      } else if (mapping.objectName) {
        // For observations, find them in the pre-loaded trace data
        const observation = getObservation(
          mapping.objectName,
          trace?.observations,
        );

        if (observation?.id) {
          try {
            const observationWithInputAndOutput =
              await utils.observations.byId.fetch({
                observationId: observation.id as string,
                startTime: observation.startTime as Date | null,
                traceId: trace?.id as string,
                projectId: trace?.projectId as string,
              });
            object = observationWithInputAndOutput;
          } catch (error) {
            console.error(`Error fetching observation data:`, error);
          }
        }
      }

      if (!object) {
        return { variable, value: "n/a" };
      }

      try {
        const result = extractValueFromObject(object, {
          ...mapping,
          selectedColumnId: mapping.selectedColumnId,
        });
        return { variable, value: result };
      } catch (error) {
        console.error(
          `Error extracting value for variable ${variable}:`,
          error,
        );
        return { variable, value: "" };
      }
    });

    // Resolve all promises and update state
    Promise.all(extractPromises)
      .then((results) => {
        setExtractedVariables(results);
        // Update the ref to the current mapping string to track changes
        previousMappingRef.current = currentMappingString;
      })
      .catch((error) => {
        console.error("Error extracting variables:", error);
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
    traceId,
    utils.observations.byId,
    trace,
  ]);

  return { extractedVariables, isExtracting };
}
