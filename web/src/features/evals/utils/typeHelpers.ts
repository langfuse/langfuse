import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "@langfuse/shared";

const partnerIdentifierToName = new Map([["ragas", "Ragas"]]);

export type MaintainerFormatter = (
  key:
    | "maintainers.partner"
    | "maintainers.langfuse"
    | "maintainers.user"
    | "maintainers.unknownPartner",
  values?: Record<string, string>,
) => string;

const defaultMaintainerFormatter: MaintainerFormatter = (key, values) => {
  switch (key) {
    case "maintainers.partner":
      return `${values?.partner} maintained`;
    case "maintainers.langfuse":
      return "Langfuse maintained";
    case "maintainers.user":
      return "User maintained";
    case "maintainers.unknownPartner":
      return "Unknown";
  }
};

export const getMaintainer = (
  evalTemplate: {
    partner?: string | null;
    projectId: string | null;
  },
  format: MaintainerFormatter = defaultMaintainerFormatter,
) => {
  if (evalTemplate.projectId === null) {
    if (evalTemplate.partner) {
      const partner =
        partnerIdentifierToName.get(evalTemplate.partner) ??
        format("maintainers.unknownPartner");
      return format("maintainers.partner", { partner });
    }
    return format("maintainers.langfuse");
  }
  return format("maintainers.user");
};

/**
 * Determines if an eval target object is using the legacy (deprecated) eval system.
 * Legacy eval types (trace-level, dataset-run-level) have limited SDK compatibility.
 * @param targetObject - The eval target object type
 * @returns true if the target object is legacy (trace or dataset)
 */
export const isLegacyEvalTarget = (targetObject: string): boolean => {
  return (
    targetObject === EvalTargetObject.TRACE ||
    targetObject === EvalTargetObject.DATASET
  );
};

/**
 * True when the legacy-migration nag (deprecated badge, callout, migration
 * dialog count) should show: the evaluator targets a legacy object AND is
 * actively evaluating new data. Inactive or backfill-only (EXISTING) legacy
 * evaluators keep working and need no action, so they get no label.
 */
export const requiresLegacyMigrationAction = (evaluator: {
  targetObject: string;
  status: string;
  timeScope: string[];
}): boolean =>
  isLegacyEvalTarget(evaluator.targetObject) &&
  evaluator.status === "ACTIVE" &&
  evaluator.timeScope.includes("NEW");

export const isTraceTarget = (targetObject: string): boolean => {
  return targetObject === EvalTargetObject.TRACE;
};

export const isTraceTargetOnV4 = (
  targetObject: string,
  isV4: boolean,
): boolean => isTraceTarget(targetObject) && isV4;

export const shouldShowLegacyTracePreview = (
  targetObject: string,
  isV4: boolean,
): boolean =>
  isTraceTarget(targetObject) && !isTraceTargetOnV4(targetObject, isV4);

export const isEventTarget = (targetObject: string): boolean => {
  return targetObject === EvalTargetObject.EVENT;
};

export const isDatasetTarget = (targetObject: string): boolean => {
  return targetObject === EvalTargetObject.DATASET;
};

export const isExperimentTarget = (targetObject: string): boolean => {
  return targetObject === EvalTargetObject.EXPERIMENT;
};

export const isTraceOrDatasetObject = (object: string): boolean => {
  return object === "trace" || object === "dataset_item";
};

export const mapLegacyToModernTarget = (
  legacyTarget: string,
): EvalTargetObjectType => {
  if (legacyTarget === EvalTargetObject.TRACE) return EvalTargetObject.EVENT;
  if (legacyTarget === EvalTargetObject.DATASET)
    return EvalTargetObject.EXPERIMENT;
  return legacyTarget as EvalTargetObjectType;
};
