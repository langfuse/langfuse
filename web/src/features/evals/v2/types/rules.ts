import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
  type EvalTemplateType,
  type FilterState,
  type ObservationVariableMapping,
  type ScoreResultTrigger,
} from "@langfuse/shared";
import type { StoreApi } from "zustand/vanilla";
import type { TableSelectionStore } from "@/src/components/table/table-selection-store";
import type { RouterOutputs } from "@/src/utils/api";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";

type RuleDraftAssignment = {
  evaluatorId: string;
  evaluatorName: string;
  evaluatorType: EvalTemplateType;
  defaultVariableMapping: ObservationVariableMapping[];
  variableMapping: ObservationVariableMapping[] | null;
  requiredVariables?: string[];
};

export type RuleDraft = {
  name: string;
  filter: FilterState;
  sampling: number;
  assignments: RuleDraftAssignment[];
  targetObject: Extract<
    EvalTargetObjectType,
    "event" | "experiment" | "score_result"
  >;
  scoreResultTrigger: ScoreResultTrigger | null;
};

export function toRuleDraftTargetObject(
  targetObject: EvalTargetObjectType,
): RuleDraft["targetObject"] {
  switch (targetObject) {
    case EvalTargetObject.SCORE_RESULT:
      return EvalTargetObject.SCORE_RESULT;
    case EvalTargetObject.EXPERIMENT:
      return EvalTargetObject.EXPERIMENT;
    default:
      return EvalTargetObject.EVENT;
  }
}

export type RuleEvaluatorOption = {
  id: string;
  name: string;
  type: EvalTemplateType;
  updatedAt?: Date;
  createdByUser?: { name: string | null; email: string | null } | null;
  defaultVariableMapping: ObservationVariableMapping[];
  initialVariableMapping: ObservationVariableMapping[] | null;
  requiredVariables?: string[];
};

export type ActivationConfirmationRequest = {
  targets: Array<{
    evaluatorId: string;
    evaluatorName: string;
    filter: FilterState;
    sampling: number;
  }>;
  onConfirm: (sampling?: number) => Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
};

type RuleSetupStoreActions = {
  setName: (name: string) => void;
  setFilter: (filter: FilterState) => void;
  setSampling: (sampling: number) => void;
  attachEvaluator: (assignment: RuleDraftAssignment) => void;
  detachEvaluator: (evaluatorId: string) => void;
  setVariableMapping: (
    evaluatorId: string,
    variableMapping: ObservationVariableMapping[],
  ) => void;
  setSelectedObservation: (observation: SampleObservation | null) => void;
  setTargetObject: (targetObject: RuleDraft["targetObject"]) => void;
  setScoreResultTrigger: (trigger: ScoreResultTrigger | null) => void;
  setPreviewSourceRuleId: (ruleId: string | null) => void;
  setPreviewFilter: (filter: FilterState) => void;
};

type RuleSetupStoreState = RuleDraft & {
  initialDraft: RuleDraft;
  selectedObservation: SampleObservation | null;
  previewSourceRuleId: string | null;
  previewFilter: FilterState;
  actions: RuleSetupStoreActions;
};

export type RuleSetupStore = StoreApi<RuleSetupStoreState>;

export type RulesTableStore = TableSelectionStore;

export type RuleTableRow =
  RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];
