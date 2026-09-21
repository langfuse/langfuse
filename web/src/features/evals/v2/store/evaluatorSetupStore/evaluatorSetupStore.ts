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

// Decision models see the observation fields as state, so the instructions
// are a single question and the categories below are its possible answers.
const DEFAULT_DECISION_MODEL_INSTRUCTIONS =
  "Does the output answer the input accurately and completely?";

const DEFAULT_DECISION_MODEL_SCORE_OUTPUT: ScoreOutputFormState = {
  dataType: "CATEGORICAL",
  scoreDescription: "",
  reasoningDescription: "",
  choices: [{ label: "pass" }, { label: "fail" }],
  shouldAllowMultipleMatches: false,
  minValue: "",
  maxValue: "",
};

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

function buildInitialScoreOutput(
  definition: NormalizedEvaluatorDefinition | null | undefined,
  type: EvalTemplateType,
): ScoreOutputFormState {
  if (
    definition?.type === "LLM_AS_JUDGE" ||
    definition?.type === "DECISION_MODEL"
  ) {
    return toScoreOutputFormState(definition.outputDefinition);
  }
  if (type === EvalTemplateTypeEnum.DECISION_MODEL) {
    return DEFAULT_DECISION_MODEL_SCORE_OUTPUT;
  }
  return toScoreOutputFormState(null);
}

type EvaluatorSetupStoreActions = {
  setType: (type: EvalTemplateType) => void;
  setInstructions: (instructions: string) => void;
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
  /** Decision-model question instructions; persisted as the version prompt. */
  instructions: string;
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

export const selectHasValidModel = (state: EvaluatorSetupStoreState) => {
  if (state.type === EvalTemplateTypeEnum.LLM_AS_JUDGE) {
    return Boolean(
      state.modelMode === "custom" ? state.selectedModel : state.defaultModel,
    );
  }
  // Decision models have no project default; a connection must be picked.
  if (state.type === EvalTemplateTypeEnum.DECISION_MODEL) {
    return Boolean(state.selectedModel);
  }
  return true;
};

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
  const type =
    initialDefinition?.type ?? initialType ?? EvalTemplateTypeEnum.LLM_AS_JUDGE;
  const hasModelSelection =
    initialDefinition?.type === "LLM_AS_JUDGE" ||
    initialDefinition?.type === "DECISION_MODEL";

  return createStore<EvaluatorSetupStoreState>((set) => ({
    initialDefinition,
    type,
    promptMessages: initialPromptMessages,
    promptMessageIds: initialPromptMessages.map(() => safeRandomUUID()),
    instructions:
      initialDefinition?.type === "DECISION_MODEL"
        ? initialDefinition.prompt
        : DEFAULT_DECISION_MODEL_INSTRUCTIONS,
    sourceCode: initialSourceCode,
    sourceCodeLanguage: initialSourceCodeLanguage,
    sourceCodeDrafts: {
      [initialSourceCodeLanguage]: initialSourceCode,
    },
    scoreOutput: buildInitialScoreOutput(initialDefinition, type),
    name: initialEvaluator?.name ?? "",
    description: initialEvaluator?.description ?? "",
    openSteps: { 1: true, 2: true, 3: true },
    variableFields: buildInitialVariableFields(initialDefinition),
    activeMapping: null,
    modelPickerOpen: false,
    modelMode:
      (initialDefinition?.type === "LLM_AS_JUDGE" && initialDefinition.model) ||
      type === EvalTemplateTypeEnum.DECISION_MODEL
        ? "custom"
        : "default",
    defaultModel,
    selectedModel:
      hasModelSelection && initialDefinition.provider && initialDefinition.model
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
      setType: (type) =>
        set((state) =>
          // Decision models always answer with one category; switching to one
          // replaces a numeric or boolean output with a categorical default.
          type === EvalTemplateTypeEnum.DECISION_MODEL
            ? {
                type,
                modelMode: "custom",
                scoreOutput:
                  state.scoreOutput.dataType === "CATEGORICAL"
                    ? {
                        ...state.scoreOutput,
                        shouldAllowMultipleMatches: false,
                      }
                    : DEFAULT_DECISION_MODEL_SCORE_OUTPUT,
              }
            : { type },
        ),
      setInstructions: (instructions) => set({ instructions }),
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

          if (definition.type === EvalTemplateTypeEnum.DECISION_MODEL) {
            return {
              type: definition.type,
              instructions: definition.prompt,
              scoreOutput: toScoreOutputFormState(definition.outputDefinition),
              activeMapping: null,
              modelMode: "custom",
              selectedModel,
              modelParams: null,
            };
          }

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
