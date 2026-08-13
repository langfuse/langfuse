import {
  EvalTemplateTypeEnum,
  observationVariableMappingList,
  ScoreDataTypeEnum,
  type FilterState,
  type ModelConfig,
  type EvalTemplateSourceCodeLanguage,
  type EvalTemplateType,
} from "@langfuse/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { getDefaultCodeEvalSource } from "@/src/features/evals/utils/code-eval-template-starter-examples";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/scoreOutput/toScoreOutputFormState";

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
  configureModel: (selectedModel: JudgeModel, modelParams: ModelConfig) => void;
  setSelectedObservation: (
    selectedObservation: SampleObservation | null,
  ) => void;
  setSampleFilter: (sampleFilter: FilterState) => void;
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
  modelParams: ModelConfig | null;
  selectedObservation: SampleObservation | null;
  sampleFilter: FilterState;
  promptPreviewEnabled: boolean;
  testPanelOpen: boolean;
  actions: EvaluatorSetupStoreActions;
};

export type EvaluatorSetupStore = StoreApi<EvaluatorSetupStoreState>;

export function createEvaluatorSetupStore({
  initialEvaluator,
  initialType,
}: {
  initialEvaluator: {
    name: string;
    description: string | null;
    definition: EvaluatorDefinition;
  } | null;
  initialType?: EvalTemplateType;
}): EvaluatorSetupStore {
  const initialDefinition = initialEvaluator?.definition;

  return createStore<EvaluatorSetupStoreState>((set) => ({
    initialDefinition,
    type:
      initialDefinition?.type ??
      initialType ??
      EvalTemplateTypeEnum.LLM_AS_JUDGE,
    prompt:
      initialDefinition?.type === "LLM_AS_JUDGE"
        ? initialDefinition.prompt
        : DEFAULT_PROMPT,
    sourceCode:
      initialDefinition?.type === "CODE"
        ? initialDefinition.sourceCode
        : getDefaultCodeEvalSource("TYPESCRIPT"),
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
    modelParams:
      initialDefinition?.type === "LLM_AS_JUDGE"
        ? initialDefinition.modelParams
        : null,
    selectedObservation: null,
    sampleFilter: [],
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
        set((state) => ({
          selectedModel,
          modelMode: "custom",
          modelParams:
            state.selectedModel?.provider === selectedModel.provider &&
            state.selectedModel.model === selectedModel.model
              ? state.modelParams
              : null,
        })),
      configureModel: (selectedModel, modelParams) =>
        set({ selectedModel, modelParams, modelMode: "custom" }),
      setSelectedObservation: (selectedObservation) =>
        set({ selectedObservation }),
      setSampleFilter: (sampleFilter) => set({ sampleFilter }),
      setPromptPreviewEnabled: (promptPreviewEnabled) =>
        set({ promptPreviewEnabled }),
      setTestPanelOpen: (testPanelOpen) => set({ testPanelOpen }),
    },
  }));
}
