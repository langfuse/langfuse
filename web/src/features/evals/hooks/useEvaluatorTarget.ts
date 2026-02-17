import { useState, useEffect } from "react";
import {
  EvalTargetObject,
  availableTraceEvalVariables,
  availableDatasetEvalVariables,
} from "@langfuse/shared";
import {
  isTraceTarget,
  isEventTarget,
  isExperimentTarget,
  isLegacyEvalTarget,
} from "@/src/features/evals/utils/typeHelpers";
import {
  type VariableMapping,
  type LangfuseObject,
} from "../utils/evaluator-form-utils";
import { OBSERVATION_VARIABLES } from "../utils/evaluator-constants";

/**
 * Custom hook to manage user-facing target state.
 * Maps internal target objects to UI tabs (trace/event/offline-experiment).
 */
export const useUserFacingTarget = (targetObject?: string) => {
  const [userFacingTarget, setUserFacingTarget] = useState<
    "trace" | "event" | "offline-experiment"
  >("event");
  const [useOtelDataForExperiment, setUseOtelDataForExperiment] =
    useState(true);

  useEffect(() => {
    const currentTarget = targetObject ?? EvalTargetObject.EVENT;

    if (isTraceTarget(currentTarget)) {
      setUserFacingTarget("trace");
    } else if (isEventTarget(currentTarget)) {
      setUserFacingTarget("event");
    } else if (isExperimentTarget(currentTarget)) {
      setUserFacingTarget("offline-experiment");
      setUseOtelDataForExperiment(true);
    } else if (isLegacyEvalTarget(currentTarget)) {
      // DATASET target (legacy non-OTEL experiments)
      setUserFacingTarget("offline-experiment");
      setUseOtelDataForExperiment(false);
    }
  }, [targetObject]);

  return {
    userFacingTarget,
    setUserFacingTarget,
    useOtelDataForExperiment,
    setUseOtelDataForExperiment,
  };
};

/**
 * Custom hook to manage evaluator target-dependent state.
 * Handles available variables and variable mapping transformations.
 */
export const useEvaluatorTargetState = () => {
  const getAvailableVariables = (targetObject: string) => {
    if (isEventTarget(targetObject) || isExperimentTarget(targetObject)) {
      return OBSERVATION_VARIABLES;
    }
    return isTraceTarget(targetObject)
      ? availableTraceEvalVariables
      : availableDatasetEvalVariables;
  };

  const transformMapping = (
    currentMapping: VariableMapping[],
    targetObject: string,
  ): VariableMapping[] => {
    const isObservationBased =
      isEventTarget(targetObject) || isExperimentTarget(targetObject);

    return currentMapping.map((field) => {
      if (isObservationBased) {
        // Placeholder langfuseObject (stripped in onSubmit)
        return {
          templateVariable: field.templateVariable,
          selectedColumnId: field.selectedColumnId,
          jsonSelector: field.jsonSelector,
          langfuseObject: "event" as LangfuseObject,
          objectName: null,
        };
      }

      // Proper langfuseObject for trace/dataset
      return {
        ...field,
        langfuseObject: (isTraceTarget(targetObject)
          ? "trace"
          : "dataset_item") as LangfuseObject,
        objectName: field.objectName ?? null,
      };
    });
  };

  return {
    getAvailableVariables,
    transformMapping,
  };
};
