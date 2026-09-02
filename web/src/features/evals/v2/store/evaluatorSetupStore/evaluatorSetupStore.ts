import {
  EvalTemplateTypeEnum,
  observationVariableMappingList,
  type FilterState,
  type ModelConfig,
  type EvalTemplateSourceCodeLanguage,
  type EvalTemplateType,
  type EvaluatorPromptMessage,
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
import type { NormalizedEvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/scoreOutput/toScoreOutputFormState";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";

const DEFAULT_PROMPT = `Evaluate the quality of the response.

Input: {{input}}
Response: {{output}}`;

function buildInitialVariableFields(
  definition: NormalizedEvaluatorDefinition | null | undefined,
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
  setPromptMessage: (index: number, message: EvaluatorPromptMessage) => void;
  addPromptMessage: () => void;
  removePromptMessage: (index: number) => void;
  reorderPromptMessage: (fromIndex: number, toIndex: number) => void;
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
  setDefaultModel: (defaultModel: JudgeModel | null) => void;
  selectModel: (selectedModel: JudgeModel) => void;
  configureModel: (selectedModel: JudgeModel, modelParams: ModelConfig) => void;
  setSelectedObservation: (
    selectedObservation: SampleObservation | null,
  ) => void;
  setSampleFilter: (sampleFilter: FilterState) => void;
  setPromptPreviewEnabled: (promptPreviewEnabled: boolean) => void;
  setTestPanelOpen: (testPanelOpen: boolean) => void;
  applyDefinition: (definition: NormalizedEvaluatorDefinition) => void;
};

export type EvaluatorSetupStoreState = {
  initialDefinition: NormalizedEvaluatorDefinition | undefined;
  type: EvalTemplateType;
  promptMessages: EvaluatorPromptMessage[];
  /** Stable client-only ids used by drag-and-drop; never persisted. */
  promptMessageIds: string[];
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
  defaultModel: JudgeModel | null;
  selectedModel: JudgeModel | null;
  modelParams: ModelConfig | null;
  selectedObservation: SampleObservation | null;
  sampleFilter: FilterState;
  promptPreviewEnabled: boolean;
  testPanelOpen: boolean;
  actions: EvaluatorSetupStoreActions;
};

export type EvaluatorSetupStore = StoreApi<EvaluatorSetupStoreState>;

export const selectHasValidModel = (state: EvaluatorSetupStoreState) =>
  state.type !== EvalTemplateTypeEnum.LLM_AS_JUDGE ||
  Boolean(
    state.modelMode === "custom" ? state.selectedModel : state.defaultModel,
  );

export function createEvaluatorSetupStore({
  initialEvaluator,
  initialSampleFilter,
  initialType,
  defaultModel = null,
}: {
  initialEvaluator: {
    name: string;
    description: string | null;
    definition: NormalizedEvaluatorDefinition;
  } | null;
  initialSampleFilter?: FilterState;
  initialType?: EvalTemplateType;
  defaultModel?: JudgeModel | null;
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

  const initialPromptMessages =
    initialDefinition?.type === "LLM_AS_JUDGE"
      ? initialDefinition.promptMessages
      : [{ role: "user" as const, content: DEFAULT_PROMPT }];

  return createStore<EvaluatorSetupStoreState>((set) => ({
    initialDefinition,
    type:
      initialDefinition?.type ??
      initialType ??
      EvalTemplateTypeEnum.LLM_AS_JUDGE,
    promptMessages: initialPromptMessages,
    promptMessageIds: initialPromptMessages.map(() => safeRandomUUID()),
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
    defaultModel,
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
    sampleFilter: initialSampleFilter ?? [
      ...DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING,
    ],
    promptPreviewEnabled: false,
    testPanelOpen: true,
    actions: {
      setType: (type) => set({ type }),
      setPromptMessage: (index, message) =>
        set((state) => {
          const promptMessages = state.promptMessages.map((current, i) =>
            i === index ? message : current,
          );
          return { promptMessages };
        }),
      addPromptMessage: () =>
        set((state) => ({
          promptMessages: [
            ...state.promptMessages,
            { role: "user", content: "" },
          ],
          promptMessageIds: [...state.promptMessageIds, safeRandomUUID()],
        })),
      removePromptMessage: (index) =>
        set((state) => {
          if (state.promptMessages.length === 1) return state;
          const promptMessages = state.promptMessages.filter(
            (_, i) => i !== index,
          );
          return {
            promptMessages,
            promptMessageIds: state.promptMessageIds.filter(
              (_, i) => i !== index,
            ),
          };
        }),
      reorderPromptMessage: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.promptMessages.length ||
            toIndex >= state.promptMessages.length
          )
            return state;

          const reorder = <T>(items: T[]) => {
            const result = [...items];
            const [item] = result.splice(fromIndex, 1);
            result.splice(toIndex, 0, item);
            return result;
          };
          const promptMessages = reorder(state.promptMessages);
          return {
            promptMessages,
            promptMessageIds: reorder(state.promptMessageIds),
          };
        }),
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
      setDefaultModel: (defaultModel) => set({ defaultModel }),
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
      applyDefinition: (definition) =>
        set((state) => {
          if (definition.type === EvalTemplateTypeEnum.CODE) {
            return {
              type: definition.type,
              sourceCode: definition.sourceCode,
              sourceCodeLanguage: definition.sourceCodeLanguage,
              sourceCodeDrafts: {
                ...state.sourceCodeDrafts,
                [definition.sourceCodeLanguage]: definition.sourceCode,
              },
              activeMapping: null,
            };
          }

          const selectedModel =
            definition.provider && definition.model
              ? {
                  provider: definition.provider,
                  model: definition.model,
                }
              : null;

          return {
            type: definition.type,
            promptMessages: definition.promptMessages,
            promptMessageIds: definition.promptMessages.map(() =>
              safeRandomUUID(),
            ),
            scoreOutput: toScoreOutputFormState(definition.outputDefinition),
            variableFields: buildInitialVariableFields(definition),
            activeMapping: null,
            modelMode: selectedModel ? "custom" : "default",
            selectedModel,
            modelParams: selectedModel ? definition.modelParams : null,
          };
        }),
    },
  }));
}
