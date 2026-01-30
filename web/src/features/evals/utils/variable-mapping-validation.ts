import { z } from "zod/v4";
import {
  variableMapping,
  observationVariableMapping,
  type EvalTargetObject,
} from "@langfuse/shared";
import {
  isEventTarget,
  isExperimentTarget,
} from "@/src/features/evals/utils/typeHelpers";

type FormMappingValue = {
  templateVariable: string;
  langfuseObject?: string;
  objectName?: string | null;
  selectedColumnId?: string | null;
  jsonSelector?: string | null;
};

type ValidationResult =
  | {
      success: true;
      data:
        | z.infer<typeof variableMapping>[]
        | z.infer<typeof observationVariableMapping>[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * Validates and transforms variable mappings based on the target type.
 * Returns validated data or an error message.
 */
export function validateAndTransformVariableMapping(
  mappings: FormMappingValue[],
  target: EvalTargetObject,
): ValidationResult {
  const isEventOrExperimentTarget =
    isEventTarget(target) || isExperimentTarget(target);

  // Check for incomplete mappings (missing selectedColumnId)
  const incompleteMappings = mappings.filter(
    (m) =>
      !m.selectedColumnId ||
      m.selectedColumnId === null ||
      m.selectedColumnId.trim() === "",
  );

  if (incompleteMappings.length > 0) {
    return {
      success: false,
      error: "Please complete all variable mappings",
    };
  }

  // For trace/dataset targets, check that observation objects have objectName
  if (!isEventOrExperimentTarget) {
    const missingObjectName = mappings.filter(
      (m) =>
        m.langfuseObject !== "trace" &&
        m.langfuseObject !== "dataset_item" &&
        (!m.objectName || m.objectName.trim() === ""),
    );

    if (missingObjectName.length > 0) {
      return {
        success: false,
        error: "Please complete all variable mappings",
      };
    }
  }

  // Transform and validate mappings based on target type
  const validatedVarMapping = isEventOrExperimentTarget
    ? z.array(observationVariableMapping).safeParse(
        mappings.map((m) => {
          const mapping: Record<string, any> = {
            templateVariable: m.templateVariable,
            selectedColumnId: m.selectedColumnId!,
          };
          // Only include jsonSelector if it has a value
          if (m.jsonSelector) {
            mapping.jsonSelector = m.jsonSelector;
          }
          return mapping;
        }),
      )
    : z.array(variableMapping).safeParse(
        mappings.map((m) => {
          const mapping: Record<string, any> = {
            templateVariable: m.templateVariable,
            langfuseObject: m.langfuseObject,
            selectedColumnId: m.selectedColumnId!,
          };
          // Only include objectName if it has a value
          if (m.objectName) {
            mapping.objectName = m.objectName;
          }
          // Only include jsonSelector if it has a value
          if (m.jsonSelector) {
            mapping.jsonSelector = m.jsonSelector;
          }
          return mapping;
        }),
      );

  if (!validatedVarMapping.success) {
    return {
      success: false,
      error: "Please complete all variable mappings",
    };
  }

  return {
    success: true,
    data: validatedVarMapping.data,
  };
}
