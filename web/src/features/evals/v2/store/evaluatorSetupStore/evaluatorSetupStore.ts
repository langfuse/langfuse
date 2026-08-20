import {
  EvalTemplateTypeEnum,
  observationVariableMappingList,
  type FilterState,
  type ModelConfig,
  type EvalTemplateSourceCodeLanguage,
  type EvalTemplateType,
} from "@langfuse/shared";
import { createStore, type StoreApi } from "zustand/vanilla";

import { inferDefaultMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { getDefaultCodeEvalSource } from "@/src/features/evals/utils/code-eval-template-starter-examples";
import { DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING } from "@/src/features/evals/utils/evaluator-constants";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { ScoreOutputFormState } from "@/src/features/evals/v2/scoreOutputTypes";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/scoreOutput/toScoreOutputFormState";
import { EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS } from "@/src/features/evals/v2/constants/experimentAndEvalFilters";

const DEFAULT_PROMPT = `Evaluate the quality of the response.

Input: {{input}}
Response: {{output}}`;

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
  sourceCodeDrafts: Partial<Record<EvalTemplateSourceCodeLanguage, string>>;
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
  mode,
}: {
  initialEvaluator: {
    name: string;
    description: string | null;
    definition: EvaluatorDefinition;
  } | null;
  initialType?: EvalTemplateType;
  mode: "create" | "edit";
}): EvaluatorSetupStore {
  const initialDefinition = initialEvaluator?.definition;
  const initialSourceCodeLanguage =
    initialDefinition?.type === "CODE"
      ? initialDefinition.sourceCodeLanguage
      : "TYPESCRIPT";
  const initialSourceCode =
    initialDefinition?.type === "CODE"
      ? initialDefinition.sourceCode
      : getDefaultCodeEvalSource(initialSourceCodeLanguage);

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
    sourceCode: initialSourceCode,
    sourceCodeLanguage: initialSourceCodeLanguage,
    sourceCodeDrafts: {
      [initialSourceCodeLanguage]: initialSourceCode,
    },
    scoreOutput: toScoreOutputFormState(
      initialDefinition?.type === "LLM_AS_JUDGE"
        ? initialDefinition.outputDefinition
        : null,
    ),
    name: initialEvaluator?.name ?? "",
    description: initialEvaluator?.description ?? "",
    openSteps: { 1: true, 2: true, 3: true },
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
    sampleFilter:
      mode === "create"
        ? [
            ...DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING,
            ...EXPERIMENTS_AND_EVALS_EXCLUSION_FILTERS,
          ]
        : [],
    promptPreviewEnabled: false,
    testPanelOpen: true,
    actions: {
      setType: (type) => set({ type }),
      setPrompt: (prompt) => set({ prompt }),
      setSourceCode: (sourceCode) =>
        set((state) => ({
          sourceCode,
          sourceCodeDrafts: {
            ...state.sourceCodeDrafts,
            [state.sourceCodeLanguage]: sourceCode,
          },
        })),
      setSourceCodeLanguage: (sourceCodeLanguage) =>
        set((state) => {
          const sourceCodeDrafts = {
            ...state.sourceCodeDrafts,
            [state.sourceCodeLanguage]: state.sourceCode,
          };

          return {
            sourceCodeLanguage,
            sourceCode:
              sourceCodeDrafts[sourceCodeLanguage] ??
              getDefaultCodeEvalSource(sourceCodeLanguage),
            sourceCodeDrafts,
          };
        }),
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
