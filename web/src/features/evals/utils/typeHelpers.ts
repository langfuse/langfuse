import { type EvalTemplate } from "@langfuse/shared";

export const partnerIdentifierToName = new Map([["ragas", "Ragas"]]);

const getPartnerName = (partner: string) => {
  return partnerIdentifierToName.get(partner) ?? "Unknown";
};

export const getMaintainer = (
  evalTemplate: Partial<EvalTemplate> & {
    partner?: string | null;
    projectId: string | null;
  },
) => {
  if (evalTemplate.projectId === null) {
    if (evalTemplate.partner) {
      return `${getPartnerName(evalTemplate.partner)} maintained`;
    }
    return "Langfuse maintained";
  }
  return "User maintained";
};

/**
 * Determines if an eval target object is using the legacy (deprecated) eval system.
 * Legacy eval types (trace-level, dataset-run-level) have limited SDK compatibility.
 * @param targetObject - The eval target object type
 * @returns true if the target object is legacy (trace or dataset)
 */
export const isLegacyEvalTarget = (targetObject: string): boolean => {
  return targetObject === "trace" || targetObject === "dataset";
};
