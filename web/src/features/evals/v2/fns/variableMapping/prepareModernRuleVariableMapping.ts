import {
  EvalTemplateType,
  getCodeEvalVariableMapping,
  observationVariableMappingList,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export type ModernRuleVariableMapping = {
  defaultVariableMapping: ObservationVariableMapping[];
  initialVariableMapping: ObservationVariableMapping[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Converts an evaluator version's stored mapping into the observation mapping
 * used by modern rules. Legacy mappings must be detected before Zod parsing:
 * object schemas strip `langfuseObject` and `objectName`, which would otherwise
 * make a trace or dataset mapping look like a valid observation mapping.
 */
export function prepareModernRuleVariableMapping(
  value: unknown,
  evaluatorType: EvalTemplateType,
): ModernRuleVariableMapping {
  if (evaluatorType === EvalTemplateType.CODE) {
    const mapping = getCodeEvalVariableMapping();
    return {
      defaultVariableMapping: mapping,
      initialVariableMapping: null,
    };
  }

  const entries = Array.isArray(value) ? value : [];
  const isLegacyMapping = entries.some(
    (entry) =>
      isRecord(entry) &&
      (Object.hasOwn(entry, "langfuseObject") ||
        Object.hasOwn(entry, "objectName")),
  );

  if (isLegacyMapping) {
    const clearedMapping = entries.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.templateVariable !== "string") {
        return [];
      }
      return [
        {
          templateVariable: entry.templateVariable,
          selectedColumnId: "",
          jsonSelector: null,
        },
      ];
    });
    return {
      defaultVariableMapping: clearedMapping,
      // This must be persisted rather than inherited. Inheriting would make
      // execution fall back to the legacy evaluator-version mapping again.
      initialVariableMapping: clearedMapping,
    };
  }

  return {
    defaultVariableMapping: observationVariableMappingList
      .catch([])
      .parse(value),
    initialVariableMapping: null,
  };
}
