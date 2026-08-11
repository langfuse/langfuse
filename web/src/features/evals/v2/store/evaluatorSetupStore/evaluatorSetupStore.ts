import {
  EvalTemplateTypeEnum,
  observationVariableMappingList,
  ScoreDataTypeEnum,
  type EvalTemplateSourceCodeLanguage,
  type EvalTemplateType,
} from "@langfuse/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import type { ActiveVariableMapping } from "@/src/features/evals/v2/components/VariableMapping/VariableMapping";
import type { VariableFieldState } from "@/src/features/evals/v2/components/VariableMapping/types";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/toScoreOutputFormState";

const DEFAULT_PROMPT = `Evaluate the quality of the response.

Input: {{input}}
Response: {{output}}`;

const DEFAULT_OUTPUT = {
  version: 2 as const,
  dataType: ScoreDataTypeEnum.NUMERIC,
  score: { description: "Quality score" },
  reasoning: { description: "Reasoning for the score" },
};

function buildInitialVariableFields(
  definition: EvaluatorDefinition | null | undefined,
): Record<string, VariableFieldState> {
  if (definition?.type !== "LLM_AS_JUDGE") return {};

  const parsed = observationVariableMappingList.safeParse(
    definition.variableMapping,
  );
  return Object.fromEntries(
    definition.vars.map((variable) => {
      const stored = parsed.success
        ? parsed.data.find((mapping) => mapping.templateVariable === variable)
        : undefined;
      return [
        variable,
        {
          selectedColumnId:
            stored?.selectedColumnId ??
            inferDefaultMapping(variable).selectedColumnId ??
            null,
          jsonSelector: stored?.jsonSelector ?? null,
        },
      ];
    }),
  );
}

type EvaluatorSetupStoreActions = {
  setType: (type: EvalTemplateType) => void;
  setPrompt: (prompt: string) => void;
  setSourceCode: (sourceCode: string) => void;
  setSourceCodeLanguage: (
    sourceCodeLanguage: EvalTemplateSourceCodeLanguage,
  ) => void;
  setScoreOutput: (scoreOutput: ScoreOutputFormState) => void;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setStepOpen: (step: number, open: boolean) => void;
  setVariableField: (variable: string, fieldState: VariableFieldState) => void;
  setActiveMapping: (activeMapping: ActiveVariableMapping) => void;
  setModelPickerOpen: (modelPickerOpen: boolean) => void;
  setModelMode: (modelMode: "default" | "custom") => void;
  selectModel: (selectedModel: JudgeModel) => void;
  setSelectedObservation: (
    selectedObservation: SampleObservation | null,
  ) => void;
  setPromptPreviewEnabled: (promptPreviewEnabled: boolean) => void;
  setTestPanelOpen: (testPanelOpen: boolean) => void;
};

export type EvaluatorSetupStoreState = {
  initialDefinition: EvaluatorDefinition | undefined;
  type: EvalTemplateType;
  prompt: string;
  sourceCode: string;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage;
  scoreOutput: ScoreOutputFormState;
  name: string;
  description: string;
  openSteps: Record<number, boolean>;
  variableFields: Record<string, VariableFieldState>;
  activeMapping: ActiveVariableMapping;
  modelPickerOpen: boolean;
  modelMode: "default" | "custom";
  selectedModel: JudgeModel | null;
  selectedObservation: SampleObservation | null;
  promptPreviewEnabled: boolean;
  testPanelOpen: boolean;
  actions: EvaluatorSetupStoreActions;
};

export type EvaluatorSetupStore = StoreApi<EvaluatorSetupStoreState>;

export function createEvaluatorSetupStore({
  initialEvaluator,
}: {
  initialEvaluator: {
    name: string;
    description: string | null;
    definition: EvaluatorDefinition;
  } | null;
}): EvaluatorSetupStore {
  const initialDefinition = initialEvaluator?.definition;

  return createStore<EvaluatorSetupStoreState>((set) => ({
    initialDefinition,
    type: initialDefinition?.type ?? EvalTemplateTypeEnum.LLM_AS_JUDGE,
    prompt:
      initialDefinition?.type === "LLM_AS_JUDGE"
        ? initialDefinition.prompt
        : DEFAULT_PROMPT,
    sourceCode:
      initialDefinition?.type === "CODE" ? initialDefinition.sourceCode : "",
    sourceCodeLanguage:
      initialDefinition?.type === "CODE"
        ? initialDefinition.sourceCodeLanguage
        : "TYPESCRIPT",
    scoreOutput: toScoreOutputFormState(
      initialDefinition?.type === "LLM_AS_JUDGE"
        ? initialDefinition.outputDefinition
        : DEFAULT_OUTPUT,
    ),
    name: initialEvaluator?.name ?? "",
    description: initialEvaluator?.description ?? "",
    openSteps: { 1: true, 2: true, 3: false },
    variableFields: buildInitialVariableFields(initialDefinition),
    activeMapping: null,
    modelPickerOpen: false,
    modelMode:
      initialDefinition?.type === "LLM_AS_JUDGE" && initialDefinition.model
        ? "custom"
        : "default",
    selectedModel:
      initialDefinition?.type === "LLM_AS_JUDGE" &&
      initialDefinition.provider &&
      initialDefinition.model
        ? {
            provider: initialDefinition.provider,
            model: initialDefinition.model,
          }
        : null,
    selectedObservation: null,
    promptPreviewEnabled: false,
    testPanelOpen: true,
    actions: {
      setType: (type) => set({ type }),
      setPrompt: (prompt) => set({ prompt }),
      setSourceCode: (sourceCode) => set({ sourceCode }),
      setSourceCodeLanguage: (sourceCodeLanguage) =>
        set({ sourceCodeLanguage }),
      setScoreOutput: (scoreOutput) => set({ scoreOutput }),
      setName: (name) => set({ name }),
      setDescription: (description) => set({ description }),
      setStepOpen: (step, open) =>
        set((state) => ({ openSteps: { ...state.openSteps, [step]: open } })),
      setVariableField: (variable, fieldState) =>
        set((state) => ({
          variableFields: { ...state.variableFields, [variable]: fieldState },
        })),
      setActiveMapping: (activeMapping) => set({ activeMapping }),
      setModelPickerOpen: (modelPickerOpen) => set({ modelPickerOpen }),
      setModelMode: (modelMode) => set({ modelMode }),
      selectModel: (selectedModel) =>
        set({ selectedModel, modelMode: "custom" }),
      setSelectedObservation: (selectedObservation) =>
        set({ selectedObservation }),
      setPromptPreviewEnabled: (promptPreviewEnabled) =>
        set({ promptPreviewEnabled }),
      setTestPanelOpen: (testPanelOpen) => set({ testPanelOpen }),
    },
  }));
}
