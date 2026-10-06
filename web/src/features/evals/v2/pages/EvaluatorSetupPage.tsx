/* eslint-disable no-nested-ternary */
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TRPCClientError } from "@trpc/client";
import { History, Trash2 } from "lucide-react";
import {
  observationVariableMappingList,
  isEvaluatorBlockReasonRecoverableByDefinitionUpdate,
  type EvaluatorBlockReason,
  type EvalTemplateType,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import Page from "@/src/components/layouts/page";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import useLocalStorage from "@/src/components/useLocalStorage";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";
import { EvaluatorVersionHistorySheet } from "../components/Evaluators/EvaluatorVersionHistorySheet/EvaluatorVersionHistorySheet";
import type { EvaluatorVersion } from "../components/Evaluators/EvaluatorVersionHistorySheet/types";
import { EvaluatorVersionConflictDialog } from "../components/Evaluators/EvaluatorVersionConflictDialog/EvaluatorVersionConflictDialog";
import { EvaluatorSetupEditor } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/EvaluatorSetupEditor";
import { getEvaluatorNameStep } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/evaluatorSetupSteps";
import { EvaluatorSetupFooter } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupFooter/EvaluatorSetupFooter";
import { SampleObservationSelectorContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/SampleObservationSelectorContainer/SampleObservationSelectorContainer";
import { EvaluatorTestPanelContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/EvaluatorTestPanelContainer/EvaluatorTestPanelContainer";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { draftsToQuestions } from "@/src/features/evals/v2/fns/evaluators/decisionModelQuestions";
import type { NormalizedEvaluatorDefinition } from "../server/evaluators/evaluatorTypes";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { detailPageListKeys } from "@/src/features/navigate-detail-pages";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import {
  createEvaluatorSetupStore,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { EvaluatorSetupDraft } from "@/src/features/evals/v2/types/templateGallery";
import { EvaluatorRuleRelationships } from "@/src/features/evals/v2/components/Rules/EvaluatorRuleRelationships/EvaluatorRuleRelationships";
import { DefaultModelChangeConfirmationDialog } from "@/src/features/evals/v2/components/Evaluators/ProjectDefaultModel/DefaultModelChangeConfirmationDialog";
import { useProjectDefaultModel } from "@/src/features/evals/v2/hooks/useProjectDefaultModel";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";
import { EvaluatorSavedDialogContainer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSavedDialogContainer/EvaluatorSavedDialogContainer";
import { EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY } from "@/src/features/evals/v2/constants/evaluatorFilterExperience";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useProject } from "@/src/features/projects";
import { EvaluatorBlockedBanner } from "@/src/features/evals/v2/components/Evaluators/EvaluatorBlockedBanner/EvaluatorBlockedBanner";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { prepareEvaluatorMetadataForSave } from "@/src/features/evals/v2/fns/prepareEvaluatorMetadataForSave";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useEvaluatorAlerts } from "@/src/features/evals/v2/hooks/useEvaluatorAlerts";
import { useCodeEvalSourceValidation } from "@/src/features/evals/hooks/useCodeEvalSourceValidation";
import { EvaluatorAlertButton } from "@/src/features/evals/v2/components/Evaluators/EvaluatorAlertButton/EvaluatorAlertButton";
import { toScoreOutputFormState } from "@/src/features/evals/v2/fns/scoreOutput/toScoreOutputFormState";
import { getFirstCodeEvaluatorScoreDataType } from "@/src/features/evals/v2/fns/evaluators/getFirstCodeEvaluatorScoreDataType";
import {
  getEvaluatorCreationAnalyticsProperties,
  getJudgePromptAnalyticsProperties,
  type EvaluatorCreationSource,
} from "@/src/features/evals/v2/fns/evaluators/getEvaluatorCreationAnalyticsProperties";
import {
  useInAppAiAgent,
  useIsInAppAgentLauncherVisible,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { createInAppAgentConversationId } from "@/src/features/in-app-agent/ids";
import { evaluatorAssistantTestResultStore } from "@/src/features/evals/v2/store/evaluatorAssistantTestResultStore";
import { getEvaluatorAssistantSampleObservation } from "@/src/features/evals/v2/fns/getEvaluatorAssistantSampleObservation";
import { startCodeEvaluatorAssistantHandoff } from "@/src/features/evals/v2/fns/startCodeEvaluatorAssistantHandoff";
import { startJudgeEvaluatorAssistantHandoff } from "@/src/features/evals/v2/fns/startJudgeEvaluatorAssistantHandoff";
import { useEvaluatorSamplePageContext } from "@/src/features/evals/v2/hooks/useEvaluatorSamplePageContext";
import { useEvaluatorAssistantTestResultSync } from "@/src/features/evals/v2/hooks/useEvaluatorAssistantTestResultSync";
import { useEvaluatorAssistantTestUpdateSignal } from "@/src/features/evals/v2/store/evaluatorAssistantUpdateSignalStore";
import { getFilterAnalyticsProperties } from "@/src/features/evals/v2/fns/getFilterAnalyticsProperties";
import { EvaluatorAssistantDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorAssistantDialog/EvaluatorAssistantDialog";
import { createEvalOnboardingAnalytics } from "@/src/features/evals/v2/fns/createEvalOnboardingAnalytics";
import { EvalOnboardingAnalyticsProvider } from "@/src/features/evals/v2/contexts/EvalOnboardingAnalyticsContext";
import { isJudgeModelAvailable } from "@/src/features/evals/v2/judgeModel";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";

export function getEvaluatorSetupHeaderState() {
  return { title: "Configure evaluator" } as const;
}

export function getEvaluatorAssistantMode({
  mode,
  isScratchCreation,
  evaluatorType,
  isAssistantAvailable,
}: {
  mode: "create" | "edit";
  isScratchCreation: boolean;
  evaluatorType: Exclude<EvalTemplateType, "FACET">;
  isAssistantAvailable: boolean;
}) {
  if (!isAssistantAvailable || evaluatorType === "DECISION_MODEL") return null;
  if (mode === "edit") return "edit";
  return isScratchCreation ? "create" : null;
}

type InitialEvaluator = {
  id: string;
  name: string;
  description: string | null;
  type: Exclude<EvalTemplateType, "FACET">;
  definition: NormalizedEvaluatorDefinition;
  blockedAt: Date | null;
  blockReason: EvaluatorBlockReason | null;
  blockMessage: string | null;
  sampleFilter?: FilterState;
};

export function shouldOfferRuleAttachment(evaluator: {
  blockedAt: Date | null;
}) {
  return evaluator.blockedAt === null;
}

export function applyEvaluatorSuggestion(
  suggestion: string | null,
  setSuggestion: (suggestion: string) => void,
) {
  if (!suggestion) return false;
  setSuggestion(suggestion);
  return true;
}

export async function navigateToEvaluatorDetail({
  projectId,
  evaluatorId,
  prefetchEvaluator,
  prefetchRoute,
  replace,
}: {
  projectId: string;
  evaluatorId: string;
  prefetchEvaluator: () => Promise<unknown>;
  prefetchRoute: (path: string) => Promise<unknown>;
  replace: (path: string) => Promise<unknown>;
}) {
  const path = `/project/${projectId}/evals/${evaluatorId}`;
  await Promise.allSettled([prefetchEvaluator(), prefetchRoute(path)]);
  await replace(path);
}

export function getEvaluatorVersionDefinition(
  version: EvaluatorVersion,
): NormalizedEvaluatorDefinition {
  if (version.type === "FACET") {
    throw new Error("Facets cannot be edited as evaluators");
  }
  if (version.type === "CODE") {
    return {
      type: version.type,
      sourceCode: version.sourceCode ?? "",
      sourceCodeLanguage: version.sourceCodeLanguage ?? "TYPESCRIPT",
    };
  }

  type LlmEvaluatorDefinition = Extract<
    NormalizedEvaluatorDefinition,
    { type: "LLM_AS_JUDGE" }
  >;

  if (version.type === "DECISION_MODEL") {
    type DecisionModelDefinition = Extract<
      NormalizedEvaluatorDefinition,
      { type: "DECISION_MODEL" }
    >;
    return {
      type: version.type,
      questions: version.questions as DecisionModelDefinition["questions"],
      provider: version.provider ?? "",
      model: version.model ?? "",
      vars: version.vars,
      variableMapping:
        version.variableMapping as DecisionModelDefinition["variableMapping"],
    };
  }

  return {
    type: version.type,
    promptMessages: version.promptMessages!,
    provider: version.provider,
    model: version.model,
    modelParams: version.modelParams,
    vars: version.vars,
    variableMapping:
      version.variableMapping as LlmEvaluatorDefinition["variableMapping"],
    outputDefinition:
      version.outputDefinition as LlmEvaluatorDefinition["outputDefinition"],
  };
}

export function restoreEvaluatorVersion({
  store,
  version,
  resetTestState,
}: {
  store: EvaluatorSetupStore;
  version: EvaluatorVersion;
  resetTestState: () => void;
}) {
  store
    .getState()
    .actions.applyDefinition(getEvaluatorVersionDefinition(version));
  resetTestState();
}

export function EvaluatorSetupPage(
  props:
    | {
        mode: "create";
        projectId: string;
        initialDraft: EvaluatorSetupDraft | null;
        initialType: Exclude<EvalTemplateType, "FACET">;
        creationSource: EvaluatorCreationSource;
      }
    | {
        mode: "edit";
        projectId: string;
        initialEvaluator: InitialEvaluator;
      },
) {
  const { projectId } = props;
  const isMobile = useIsMobile();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useProject(projectId);
  const nameAIAssistanceAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled);
  const initialEvaluator =
    props.mode === "edit" ? props.initialEvaluator : null;
  const initialDraft = props.mode === "create" ? props.initialDraft : null;
  const [evaluatorId] = useState(
    () => initialEvaluator?.id ?? safeRandomUUID(),
  );
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const {
    openAssistant,
    selectedConversationId,
    submit: submitToAssistant,
  } = useInAppAiAgent();
  const isAssistantLauncherVisible = useIsInAppAgentLauncherVisible();
  const [filterExperience] = useLocalStorage<EvaluatorFilterExperience>(
    EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY,
    "query",
  );
  const canReactivate = useHasProjectAccess({
    projectId,
    scope: "evaluator:CUD",
  });
  const evaluatorAlerts = useEvaluatorAlerts({
    scope: "evaluator",
    projectId,
    evaluatorId: initialEvaluator?.id ?? null,
  });
  const initialScoreDataType = (() => {
    if (initialEvaluator?.definition.type === "CODE") {
      return getFirstCodeEvaluatorScoreDataType(
        initialEvaluator.definition.sourceCode,
      );
    }
    if (initialEvaluator?.definition.type === "LLM_AS_JUDGE") {
      return toScoreOutputFormState(
        initialEvaluator.definition.outputDefinition,
      ).dataType;
    }
    return undefined;
  })();
  const [persistedEvaluatorUi, setPersistedEvaluatorUi] = useState(() =>
    initialEvaluator
      ? {
          name: initialEvaluator.name,
          type: initialEvaluator.type,
          defaultVariableMapping: initialEvaluator.definition.variableMapping,
          scoreDataType: initialScoreDataType,
          blockedAt: initialEvaluator.blockedAt,
          blockReason: initialEvaluator.blockReason,
          blockMessage: initialEvaluator.blockMessage,
        }
      : null,
  );
  const projectDefaultModel = useProjectDefaultModel({
    projectId,
    source: "editor",
  });
  const [evaluatorSetupStore] = useState(() =>
    createEvaluatorSetupStore({
      initialEvaluator: initialEvaluator ?? initialDraft,
      initialSampleFilter: initialEvaluator?.sampleFilter,
      initialType: props.mode === "create" ? props.initialType : undefined,
      defaultModel: projectDefaultModel.defaultModel,
      mode: props.mode,
    }),
  );
  useEvaluatorSamplePageContext({
    projectId,
    evaluatorId,
    selectedConversationId,
    store: evaluatorSetupStore,
  });
  const [onboardingAnalytics] = useState(() =>
    props.mode === "create"
      ? createEvalOnboardingAnalytics({
          capture,
          getEvaluatorType: () => evaluatorSetupStore.getState().type,
        })
      : null,
  );
  useEffect(() => {
    evaluatorSetupStore
      .getState()
      .actions.setDefaultModel(projectDefaultModel.defaultModel);
  }, [evaluatorSetupStore, projectDefaultModel.defaultModel]);
  const modelDraft = useStore(
    evaluatorSetupStore,
    useShallow((state) => ({
      type: state.type,
      modelMode: state.modelMode,
      defaultModel: state.defaultModel,
      selectedModel: state.selectedModel,
      hasChangedModelSelection: state.hasChangedModelSelection,
    })),
  );
  const effectiveDraftModel =
    modelDraft.type === "CODE"
      ? null
      : modelDraft.type === "LLM_AS_JUDGE" && modelDraft.modelMode === "default"
        ? modelDraft.defaultModel
        : modelDraft.selectedModel;
  const draftResolvesEvaluatorBlock = Boolean(
    initialEvaluator?.blockedAt &&
    isEvaluatorBlockReasonRecoverableByDefinitionUpdate(
      initialEvaluator.blockReason,
    ) &&
    !projectDefaultModel.connectionsPending &&
    isJudgeModelAvailable(
      effectiveDraftModel,
      projectDefaultModel.providerGroups,
    ) &&
    (modelDraft.hasChangedModelSelection ||
      initialEvaluator.blockReason === "DEFAULT_EVAL_MODEL_MISSING"),
  );
  const codeDraft = useStore(
    evaluatorSetupStore,
    useShallow((state) => ({
      type: state.type,
      sourceCode: state.sourceCode,
      sourceCodeLanguage: state.sourceCodeLanguage,
    })),
  );
  const assistantEvaluatorType =
    codeDraft.type === "DECISION_MODEL" ? null : codeDraft.type;
  const isScratchCreation =
    props.mode === "create" && props.creationSource.type === "scratch";
  const assistantDialogMode = getEvaluatorAssistantMode({
    mode: props.mode,
    isScratchCreation,
    evaluatorType: codeDraft.type,
    isAssistantAvailable: isAssistantLauncherVisible,
  });
  const codeValidation = useCodeEvalSourceValidation({
    enabled: codeDraft.type === "CODE",
    sourceCode: codeDraft.sourceCode,
    sourceCodeLanguage: codeDraft.sourceCodeLanguage,
  });
  const getCurrentSnapshot = (state = evaluatorSetupStore.getState()) =>
    JSON.stringify({
      name: state.name.trim(),
      description: state.description.trim() || null,
      definition: prepareEvaluatorDraft(state).definition,
    });
  const initialSnapshot = useRef(getCurrentSnapshot());
  const assistantPersistedEvaluatorIdRef = useRef<string | null>(null);
  const testPanelOpen = useStore(
    evaluatorSetupStore,
    (state) => state.testPanelOpen,
  );
  const [testResult, setTestResult] = useState<unknown>(null);
  const [hasCompletedTestCall, setHasCompletedTestCall] = useState(false);
  const [lastTestRunCostUsd, setLastTestRunCostUsd] = useState<number | null>(
    null,
  );
  const [rawResultOpen, setRawResultOpen] = useState(false);
  const assistantTestResult = useEvaluatorAssistantTestResultSync({
    projectId,
    evaluatorId,
    store: evaluatorSetupStore,
    setHasCompletedTestCall,
    setLastTestRunCostUsd,
    setRawResultOpen,
  });
  const assistantTestUpdateId = useEvaluatorAssistantTestUpdateSignal(
    projectId,
    evaluatorId,
  );
  const hasRequestedName = useRef(false);
  const saveInFlightRef = useRef(false);
  const hasCreatedRef = useRef(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [assistantDialogOpen, setAssistantDialogOpen] = useState(false);
  const assistantDialogTriggerRef = useRef<HTMLButtonElement>(null);
  const [versionConflictOpen, setVersionConflictOpen] = useState(false);
  const [savedEvaluator, setSavedEvaluator] = useState<{
    id: string;
    name: string;
    type: EvalTemplateType;
    defaultVariableMapping: ObservationVariableMapping[];
    sampleFilter: FilterState;
    hasCompletedTestCall: boolean;
    testRunCostUsd: number | null;
  } | null>(null);
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  // Keep relative ranges stable across unrelated renders so the observations
  // query only changes when the selected range changes.
  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );
  const sampleTracePeekNavigation = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    tableName: "evaluators-v2",
    isV4: true,
    extractParamsValuesFromRow: (observation: SampleObservation) => ({
      observation: observation.id,
      traceId: observation.traceId ?? "",
      timestamp: observation.startTime.toISOString(),
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      reader: "trace",
    },
  });
  const sampleTracePeekConfig = {
    itemType: "TRACE" as const,
    detailNavigationKey: detailPageListKeys.traces,
    ...sampleTracePeekNavigation,
  };
  const versionHistory = api.evalsV2.versions.useInfiniteQuery(
    {
      projectId,
      evaluatorId: initialEvaluator?.id ?? "",
      limit: 50,
    },
    {
      enabled: Boolean(initialEvaluator && historyOpen),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const versions: EvaluatorVersion[] = (
    versionHistory.data?.pages.flatMap((page) => page.data) ?? []
  ).map((version) => ({
    id: version.id,
    version: version.version,
    createdAt: version.createdAt,
    type: initialEvaluator?.type ?? "LLM_AS_JUDGE",
    sourceCode: version.sourceCode,
    sourceCodeLanguage: version.sourceCodeLanguage,
    promptMessages:
      initialEvaluator?.type === "CODE" ? null : version.promptMessages,
    provider: version.provider,
    model: version.model,
    modelParams: version.modelParams as EvaluatorVersion["modelParams"],
    vars: version.vars,
    variableMapping: version.variableMapping,
    outputDefinition: version.outputDefinition,
    questions: version.questions,
    createdByUser: version.createdByUser,
  }));

  const create = api.evalsV2.create.useMutation();
  const update = api.evalsV2.update.useMutation();
  const reactivate = api.evalsV2.reactivate.useMutation({
    onSuccess: async () => {
      showSuccessToast({
        title: "Evaluator reactivated",
        description:
          "The model test succeeded and the evaluator is active again.",
      });
      setPersistedEvaluatorUi((current) =>
        current
          ? {
              ...current,
              blockedAt: null,
              blockReason: null,
              blockMessage: null,
            }
          : current,
      );
      if (initialEvaluator) {
        await utils.evalsV2.get.invalidate({
          projectId,
          evaluatorId: initialEvaluator.id,
        });
      }
    },
    onError: (error) => {
      showErrorToast("Reactivation failed", error.message);
    },
  });
  const deleteEvaluator = api.evalsV2.delete.useMutation({
    onError: trpcErrorToast,
    onSuccess: async () => {
      capture("evaluators:delete", {
        source: "detail",
        evaluatorCount: 1,
        isAllMatching: false,
      });
      showSuccessToast({
        title: "Evaluator deleted",
        description: "The evaluator and all of its versions were deleted.",
      });
      await router.push(`/project/${projectId}/evals`);
    },
  });
  const testEvaluator = api.evalsV2.test.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      if ("executionTraceId" in result) setHasCompletedTestCall(true);
      if ("success" in result && result.success) {
        onboardingAnalytics?.completeStep({ stepName: "evaluator_tested" });
      }
      setLastTestRunCostUsd(
        "estimatedCostUsd" in result &&
          typeof result.estimatedCostUsd === "number"
          ? result.estimatedCostUsd
          : null,
      );
    },
    onError: (error) => {
      setTestResult({ requestError: error.message });
      trpcErrorToast(error);
    },
  });
  const suggestName = api.evalsV2.suggestName.useMutation();
  const suggestDescription = api.evalsV2.suggestDescription.useMutation();

  const getSuggestionDefinition = () => {
    const state = evaluatorSetupStore.getState();
    switch (state.type) {
      case "LLM_AS_JUDGE":
        return { type: state.type, promptMessages: state.promptMessages };
      case "CODE":
        return { type: state.type, sourceCode: state.sourceCode };
      case "DECISION_MODEL":
        return {
          type: state.type,
          questions: draftsToQuestions(state.questions) ?? [],
        };
    }
  };

  const generateNameSuggestion = async () => {
    if (!nameAIAssistanceAvailable) return null;
    return suggestName.mutateAsync({
      projectId,
      definition: getSuggestionDefinition(),
    });
  };

  const generateDescriptionSuggestion = async () => {
    if (!nameAIAssistanceAvailable) return null;
    return suggestDescription.mutateAsync({
      projectId,
      definition: getSuggestionDefinition(),
    });
  };

  const requestNameSuggestion = async (showFailureToast = false) => {
    hasRequestedName.current = true;
    try {
      const name = await generateNameSuggestion();
      const applied = applyEvaluatorSuggestion(
        name,
        evaluatorSetupStore.getState().actions.setName,
      );
      if (!applied && showFailureToast) {
        showErrorToast(
          "Couldn't generate an evaluator name",
          "Please enter a name manually.",
        );
      }
    } catch (error) {
      if (!showFailureToast) throw error;
      showErrorToast(
        "Couldn't generate an evaluator name",
        "Please enter a name manually.",
      );
    }
  };

  const requestDescriptionSuggestion = async () => {
    try {
      const description = await generateDescriptionSuggestion();
      const applied = applyEvaluatorSuggestion(
        description,
        evaluatorSetupStore.getState().actions.setDescription,
      );
      if (applied) return;
    } catch {
      // The field-specific message below is more actionable than the request error.
    }
    showErrorToast(
      "Couldn't generate an evaluator description",
      "Please enter a description manually.",
    );
  };

  const setStepOpen = (step: number, open: boolean) => {
    const state = evaluatorSetupStore.getState();
    state.actions.setStepOpen(step, open);
    const isNameStep = step === getEvaluatorNameStep(state.type);
    if (
      nameAIAssistanceAvailable &&
      open &&
      isNameStep &&
      !state.name &&
      !hasRequestedName.current
    ) {
      requestNameSuggestion().catch(trpcErrorToast);
    }
  };

  const close = async () => {
    await router.push(`/project/${projectId}/evals`);
  };
  const requestClose = () => {
    const currentSnapshot = getCurrentSnapshot();
    if (currentSnapshot !== initialSnapshot.current) setDiscardOpen(true);
    else close().catch(trpcErrorToast);
  };

  const save = async (
    intent: "manual" | "assistant" = "manual",
  ): Promise<string | null> => {
    const stateAtRequest = evaluatorSetupStore.getState();
    const isAssistantHandoff = intent === "assistant";
    if (
      isAssistantHandoff &&
      props.mode === "create" &&
      assistantPersistedEvaluatorIdRef.current
    ) {
      return assistantPersistedEvaluatorIdRef.current;
    }
    if (
      isAssistantHandoff &&
      initialEvaluator &&
      getCurrentSnapshot(stateAtRequest) === initialSnapshot.current
    ) {
      return initialEvaluator.id;
    }
    if (saveInFlightRef.current || hasCreatedRef.current) return null;
    saveInFlightRef.current = true;
    setSaveInFlight(true);
    try {
      let state = evaluatorSetupStore.getState();
      const metadata = await prepareEvaluatorMetadataForSave({
        currentName: state.name,
        currentDescription: state.description,
        generateName:
          !isAssistantHandoff && nameAIAssistanceAvailable
            ? generateNameSuggestion
            : null,
        generateDescription:
          !isAssistantHandoff && nameAIAssistanceAvailable && !initialEvaluator
            ? async () => {
                try {
                  return await generateDescriptionSuggestion();
                } catch (error) {
                  trpcErrorToast(error);
                  return null;
                }
              }
            : null,
        fallbackName: isAssistantHandoff
          ? state.type === "LLM_AS_JUDGE"
            ? "Draft LLM-as-a-judge evaluator"
            : "Draft code evaluator"
          : undefined,
        setName: state.actions.setName,
        setDescription: state.actions.setDescription,
      });
      if (!metadata) {
        showErrorToast(
          "Evaluator name required",
          "We couldn't generate a name. Please enter one manually and try again.",
        );
        return null;
      }
      state = evaluatorSetupStore.getState();
      if (state.type === "CODE") {
        const validatedSourceCode = state.sourceCode;
        const validatedSourceCodeLanguage = state.sourceCodeLanguage;
        const isValid = await codeValidation.validate({
          sourceCode: validatedSourceCode,
          sourceCodeLanguage: validatedSourceCodeLanguage,
        });
        state = evaluatorSetupStore.getState();
        if (
          !isValid ||
          state.type !== "CODE" ||
          state.sourceCode !== validatedSourceCode ||
          state.sourceCodeLanguage !== validatedSourceCodeLanguage
        ) {
          return null;
        }
      }
      const { definition } = prepareEvaluatorDraft(state);
      if (!definition) return null;
      const { name, description } = metadata;

      if (props.mode === "edit") {
        const evaluator = await update.mutateAsync({
          projectId,
          evaluatorId: props.initialEvaluator.id,
          name,
          description,
          definition,
        });
        setPersistedEvaluatorUi({
          name,
          type: state.type,
          defaultVariableMapping: definition.variableMapping,
          scoreDataType:
            state.type === "LLM_AS_JUDGE"
              ? state.scoreOutput.dataType
              : state.type === "CODE"
                ? getFirstCodeEvaluatorScoreDataType(state.sourceCode)
                : undefined,
          blockedAt: evaluator.blockedAt,
          blockReason: evaluator.blockReason,
          blockMessage: evaluator.blockMessage,
        });
        capture("evaluators:update", {
          evaluatorType: state.type,
          filterExperience,
          ...getFilterAnalyticsProperties(state.sampleFilter),
          ...(definition.type === "LLM_AS_JUDGE"
            ? getJudgePromptAnalyticsProperties(definition.promptMessages)
            : {}),
        });
        if (!isAssistantHandoff) {
          showSuccessToast({
            title: "Evaluator saved",
            description: "Your evaluator changes are saved.",
          });
        }
        initialSnapshot.current = getCurrentSnapshot(state);
        utils.evalsV2.get.setData(
          { projectId, evaluatorId: evaluator.id },
          (current) =>
            current
              ? {
                  ...current,
                  blockedAt: evaluator.blockedAt,
                  blockReason: evaluator.blockReason,
                  blockMessage: evaluator.blockMessage,
                }
              : current,
        );
        await Promise.all([
          utils.evalsV2.filterOptions.invalidate({ projectId }),
          utils.evalsV2.versions.invalidate({
            projectId,
            evaluatorId: evaluator.id,
          }),
        ]);
        return evaluator.id;
      }

      const evaluator = await create.mutateAsync({
        projectId,
        evaluatorId,
        name,
        description,
        definition,
      });
      hasCreatedRef.current = true;
      onboardingAnalytics?.completeStep({
        stepName: "evaluator_saved",
        isBlocked: !shouldOfferRuleAttachment(evaluator),
      });
      capture("evaluators:create", {
        ...getEvaluatorCreationAnalyticsProperties({
          evaluatorType: state.type,
          creationSource: props.creationSource,
          sourceCodeLanguage:
            state.type === "CODE" ? state.sourceCodeLanguage : undefined,
          variableMapping:
            definition.type === "LLM_AS_JUDGE"
              ? definition.variableMapping
              : undefined,
          promptMessages:
            definition.type === "LLM_AS_JUDGE"
              ? definition.promptMessages
              : undefined,
          evaluatorConfig:
            state.type === "LLM_AS_JUDGE"
              ? {
                  usesDefaultModel: state.modelMode === "default",
                  hasCustomModelParams:
                    state.modelMode === "custom" &&
                    Object.keys(state.modelParams ?? {}).length > 0,
                  scoreType: state.scoreOutput.dataType,
                }
              : undefined,
        }),
        filterExperience,
        ...getFilterAnalyticsProperties(state.sampleFilter),
      });
      initialSnapshot.current = getCurrentSnapshot(state);
      await utils.evalsV2.filterOptions.invalidate({ projectId });
      if (isAssistantHandoff) {
        assistantPersistedEvaluatorIdRef.current = evaluator.id;
        return evaluator.id;
      }
      if (!shouldOfferRuleAttachment(evaluator)) {
        await navigateToEvaluatorDetail({
          projectId,
          evaluatorId: evaluator.id,
          prefetchEvaluator: () =>
            utils.evalsV2.get.prefetch({
              projectId,
              evaluatorId: evaluator.id,
            }),
          prefetchRoute: (path) => router.prefetch(path),
          replace: (path) => router.replace(path),
        });
        return evaluator.id;
      }
      setSavedEvaluator({
        id: evaluator.id,
        name,
        type: state.type,
        defaultVariableMapping: observationVariableMappingList
          .catch([])
          .parse(
            definition.type === "LLM_AS_JUDGE"
              ? definition.variableMapping
              : undefined,
          ),
        sampleFilter: state.sampleFilter,
        hasCompletedTestCall,
        testRunCostUsd: lastTestRunCostUsd,
      });
      return evaluator.id;
    } catch (error) {
      hasCreatedRef.current = false;
      if (
        initialEvaluator &&
        error instanceof TRPCClientError &&
        error.data?.code === "CONFLICT"
      ) {
        setVersionConflictOpen(true);
      } else {
        trpcErrorToast(error);
      }
      return null;
    } finally {
      saveInFlightRef.current = false;
      setSaveInFlight(false);
    }
  };

  const submitEvaluatorAssistantRequest = async (
    request: string,
    evaluatorType: "CODE" | "LLM_AS_JUDGE",
  ) => {
    setTestResult(null);
    const conversationId = createInAppAgentConversationId();
    const sampleObservation = getEvaluatorAssistantSampleObservation(
      evaluatorSetupStore.getState().selectedObservation,
    );
    const persistEvaluator = async () => {
      const persistedEvaluatorId = await save("assistant");
      if (!persistedEvaluatorId) {
        showErrorToast(
          "Couldn't save evaluator",
          "Review the evaluator for validation errors, then try again.",
        );
      } else {
        evaluatorAssistantTestResultStore.expect({
          projectId,
          evaluatorId: persistedEvaluatorId,
          conversationId,
          observationId: sampleObservation?.observationId ?? null,
        });
      }
      return persistedEvaluatorId;
    };
    const handoff =
      evaluatorType === "CODE"
        ? await startCodeEvaluatorAssistantHandoff({
            request,
            sampleObservation,
            conversationId,
            openAssistant: () => openAssistant("evaluator_editor"),
            persistEvaluator,
            submitToAssistant,
          })
        : await startJudgeEvaluatorAssistantHandoff({
            request,
            sampleObservation,
            conversationId,
            openAssistant: () => openAssistant("evaluator_editor"),
            persistEvaluator,
            submitToAssistant,
          });
    if (!handoff) return false;

    if (!handoff.started) {
      evaluatorAssistantTestResultStore.clear(projectId, handoff.evaluatorId);
      showErrorToast(
        "Assistant didn't start",
        "The evaluator was saved. Open Edit with AI and try again.",
      );
    }

    if (props.mode === "create") {
      await navigateToEvaluatorDetail({
        projectId,
        evaluatorId: handoff.evaluatorId,
        prefetchEvaluator: () =>
          utils.evalsV2.get.prefetch({
            projectId,
            evaluatorId: handoff.evaluatorId,
          }),
        prefetchRoute: (path) => router.prefetch(path),
        replace: (path) => router.replace(path),
      });
    }

    return handoff.started;
  };

  const discardConflictingChanges = async () => {
    if (!initialEvaluator) return;
    setVersionConflictOpen(false);
    await utils.evalsV2.get.invalidate({
      projectId,
      evaluatorId: initialEvaluator.id,
    });
  };

  const overrideConflictingChanges = async () => {
    setVersionConflictOpen(false);
    await save();
  };

  const runTest = () => {
    evaluatorAssistantTestResultStore.clear(projectId, evaluatorId);
    const state = evaluatorSetupStore.getState();
    const { definition } = prepareEvaluatorDraft(state);
    const selectedObservation = state.selectedObservation;
    if (!definition || !selectedObservation?.traceId) return;
    capture("evaluators:test", {
      evaluatorType: state.type,
      isEditing: Boolean(initialEvaluator),
    });
    testEvaluator.mutate({
      projectId,
      evaluatorId,
      definition,
      observationId: selectedObservation.id,
      traceId: selectedObservation.traceId,
      startTime: selectedObservation.startTime,
    });
  };

  const evaluatorEditor = (
    <EvaluatorSetupEditor
      projectId={projectId}
      evaluatorId={evaluatorId}
      store={evaluatorSetupStore}
      isEditing={Boolean(initialEvaluator)}
      defaultModel={projectDefaultModel.defaultModel}
      providerGroups={projectDefaultModel.providerGroups}
      providerAdapters={projectDefaultModel.providerAdapters}
      connectionsPending={projectDefaultModel.connectionsPending}
      canSetProjectDefault={projectDefaultModel.canUpdate}
      onConfigureProviders={() => {
        onboardingAnalytics?.track(
          "eval:onboarding_llm_connection_tab_opened",
          {},
        );
        projectDefaultModel.openProviderSettings();
      }}
      onSetProjectDefault={projectDefaultModel.update.requestUpdate}
      codeValidationResult={
        codeValidation.isPending ? null : codeValidation.validationResult
      }
      onStepOpenChange={setStepOpen}
      nameAIAssistance={
        !nameAIAssistanceAvailable
          ? { state: "unavailable" }
          : suggestName.isPending
            ? { state: "generating" }
            : {
                state: "idle",
                onGenerate: () => {
                  onboardingAnalytics?.track(
                    "eval:onboarding_ai_generate_requested",
                    { field: "name" },
                  );
                  requestNameSuggestion(true).catch(trpcErrorToast);
                },
              }
      }
      descriptionAIAssistance={
        !nameAIAssistanceAvailable
          ? { state: "unavailable" }
          : suggestDescription.isPending
            ? { state: "generating" }
            : {
                state: "idle",
                // requestDescriptionSuggestion reports its own failures.
                onGenerate: () => {
                  onboardingAnalytics?.track(
                    "eval:onboarding_ai_generate_requested",
                    { field: "description" },
                  );
                  requestDescriptionSuggestion();
                },
              }
      }
    />
  );

  const evaluatorTestPanel = (
    <EvaluatorTestPanelContainer
      projectId={projectId}
      store={evaluatorSetupStore}
      sampleSelector={
        <SampleObservationSelectorContainer
          store={evaluatorSetupStore}
          projectId={projectId}
          timeRange={absoluteTimeRange}
          onOpenTrace={(observation) => {
            onboardingAnalytics?.track(
              "eval:onboarding_sample_observation_previewed",
              {},
            );
            if (observation.traceId) {
              sampleTracePeekNavigation.openPeek(observation.id, observation);
            }
          }}
        />
      }
      testResult={assistantTestResult?.result ?? testResult}
      assistantUpdateId={assistantTestUpdateId}
      testPending={!assistantTestResult && testEvaluator.isPending}
      rawResultOpen={rawResultOpen}
      onRawResultOpenChange={setRawResultOpen}
      onRunTest={runTest}
      onOpenExecutionTrace={(traceId) =>
        sampleTracePeekNavigation.openPeek(traceId)
      }
    />
  );
  const isSaving =
    saveInFlight ||
    create.isPending ||
    update.isPending ||
    suggestName.isPending ||
    suggestDescription.isPending;
  const headerState = getEvaluatorSetupHeaderState();

  return (
    <Page
      headerProps={{
        title: headerState.title,
        breadcrumb: [
          { name: "Evaluators", href: `/project/${projectId}/evals` },
        ],
        actionButtonsRight:
          initialEvaluator && persistedEvaluatorUi ? (
            <div className="flex gap-2">
              <EvaluatorRuleRelationships
                projectId={projectId}
                evaluatorId={initialEvaluator.id}
                evaluatorName={persistedEvaluatorUi.name}
                evaluatorType={persistedEvaluatorUi.type}
                evaluatorDefaultVariableMapping={
                  persistedEvaluatorUi.defaultVariableMapping
                }
              />
              <EvaluatorAlertButton
                scope="evaluator"
                projectId={projectId}
                evaluatorId={initialEvaluator.id}
                evaluatorType={persistedEvaluatorUi.type}
                scoreDataType={persistedEvaluatorUi.scoreDataType}
                {...evaluatorAlerts}
              />
              <Button
                type="button"
                variant="outline"
                title="View version history"
                onClick={() => {
                  capture("evaluators:version_history_interaction", {
                    action: "open",
                  });
                  setHistoryOpen(true);
                }}
              >
                <History className="mr-2 h-4 w-4" />
                Version history
              </Button>
              <Button
                type="button"
                variant="outline"
                title="Delete evaluator"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </div>
          ) : undefined,
      }}
    >
      <EvalOnboardingAnalyticsProvider value={onboardingAnalytics}>
        <div className="flex min-h-0 flex-1 flex-col">
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
          {persistedEvaluatorUi?.blockedAt && !draftResolvesEvaluatorBlock ? (
            <div className="mx-3 mt-3">
              <EvaluatorBlockedBanner
                projectId={projectId}
                blockedAt={persistedEvaluatorUi.blockedAt}
                blockReason={persistedEvaluatorUi.blockReason}
                blockMessage={persistedEvaluatorUi.blockMessage}
                canReactivate={canReactivate}
                reactivationPending={reactivate.isPending}
                onReactivate={() => {
                  capture("evaluators:reactivate", {
                    blockReason:
                      persistedEvaluatorUi.blockReason ??
                      "EVAL_MODEL_CONFIG_INVALID",
                  });
                  reactivate.mutate({
                    projectId,
                    evaluatorId,
                  });
                }}
              />
            </div>
          ) : null}
          {isMobile ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div>{evaluatorEditor}</div>
              <div className="border-t [&>aside]:h-auto">
                {evaluatorTestPanel}
              </div>
            </div>
          ) : (
            <ResizableSplitLayout
              className="h-auto min-h-0 flex-1"
              primaryContent={evaluatorEditor}
              secondaryContent={evaluatorTestPanel}
              open={testPanelOpen}
              defaultPrimarySize={60}
              defaultSecondarySize={40}
              minPrimarySize={30}
              minSecondarySize="360px"
              collapsedSecondarySize="48px"
              onOpenChange={
                evaluatorSetupStore.getState().actions.setTestPanelOpen
              }
              persistId="evaluator-test-panel"
            />
          )}
          <EvaluatorSetupFooter
            store={evaluatorSetupStore}
            initialSnapshot={initialSnapshot.current}
            isEditing={Boolean(initialEvaluator)}
            isSaving={isSaving}
            nameAIAssistanceAvailable={nameAIAssistanceAvailable}
            codeValidation={
              codeDraft.type === "CODE"
                ? {
                    isValid: codeValidation.isValid,
                    isPending: codeValidation.isPending,
                  }
                : null
            }
            assistantAction={
              assistantDialogMode
                ? {
                    label:
                      assistantDialogMode === "create"
                        ? "Create with AI"
                        : "Edit with AI",
                    triggerRef: assistantDialogTriggerRef,
                    onClick: () => {
                      capture("evaluators:assistant_entry_interaction", {
                        action:
                          assistantDialogMode === "create"
                            ? "open_create"
                            : "open_edit",
                        evaluatorType: codeDraft.type,
                      });
                      setAssistantDialogOpen(true);
                    },
                  }
                : null
            }
            onClose={requestClose}
            onSave={save}
          />
        </div>
      </EvalOnboardingAnalyticsProvider>
      {assistantDialogMode && assistantEvaluatorType ? (
        <EvaluatorAssistantDialog
          open={assistantDialogOpen}
          mode={assistantDialogMode}
          evaluatorType={assistantEvaluatorType === "CODE" ? "code" : "judge"}
          returnFocusRef={assistantDialogTriggerRef}
          onOpenChange={setAssistantDialogOpen}
          onAssistantSubmit={(request) => {
            capture("evaluators:assistant_entry_interaction", {
              action:
                assistantDialogMode === "create"
                  ? "submit_create"
                  : "submit_edit",
              evaluatorType: assistantEvaluatorType,
              requestLength: request.length,
            });
            return submitEvaluatorAssistantRequest(
              request,
              assistantEvaluatorType,
            );
          }}
        />
      ) : null}
      {initialEvaluator ? (
        <EvaluatorVersionHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          evaluatorName={persistedEvaluatorUi?.name ?? initialEvaluator.name}
          versions={versions}
          currentVersionId={versions[0]?.id ?? ""}
          defaultModel={projectDefaultModel.defaultModel}
          onVersionExpansionChange={(versionId) => {
            capture("evaluators:version_history_interaction", {
              action:
                versionId === null ? "collapse_version" : "expand_version",
            });
          }}
          onRestoreVersion={(version) => {
            evaluatorAssistantTestResultStore.clear(projectId, evaluatorId);
            restoreEvaluatorVersion({
              store: evaluatorSetupStore,
              version,
              resetTestState: () => {
                setTestResult(null);
                setHasCompletedTestCall(false);
                setLastTestRunCostUsd(null);
                setRawResultOpen(false);
              },
            });
            capture("evaluators:version_history_interaction", {
              action: "restore_version",
            });
          }}
          isLoading={versionHistory.isPending}
          hasMore={versionHistory.hasNextPage}
          isLoadingMore={versionHistory.isFetchingNextPage}
          onLoadMore={() => versionHistory.fetchNextPage()}
        />
      ) : null}
      {initialEvaluator ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete evaluator?"
          description="This deletes the evaluator and its complete version history. This action cannot be undone."
          confirmLabel="Delete evaluator"
          onConfirm={() =>
            deleteEvaluator.mutate({
              projectId,
              evaluatorId: initialEvaluator.id,
            })
          }
        />
      ) : null}
      <TablePeekViewTraceDetail
        {...sampleTracePeekConfig}
        projectId={projectId}
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard unsaved changes?"
        description="Your evaluator changes will be lost."
        confirmLabel="Discard changes"
        onConfirm={close}
      />
      <EvaluatorVersionConflictDialog
        open={versionConflictOpen}
        onOpenChange={setVersionConflictOpen}
        isOverriding={update.isPending}
        onDiscard={discardConflictingChanges}
        onOverride={overrideConflictingChanges}
      />
      {savedEvaluator ? (
        <EvaluatorSavedDialogContainer
          projectId={projectId}
          evaluator={savedEvaluator}
          onboardingAnalytics={onboardingAnalytics}
          onDismiss={async () => {
            await router.push(
              `/project/${projectId}/evals/${savedEvaluator.id}`,
            );
          }}
          onFinish={async () => {
            await router.push(`/project/${projectId}/evals`);
          }}
        />
      ) : null}
      {projectDefaultModel.defaultModel &&
      projectDefaultModel.update.pendingModel ? (
        <DefaultModelChangeConfirmationDialog
          open
          currentModel={projectDefaultModel.defaultModel}
          nextModel={projectDefaultModel.update.pendingModel}
          loading={projectDefaultModel.update.isPending}
          onOpenChange={(open) => {
            if (!open) projectDefaultModel.update.dismissConfirmation();
          }}
          onConfirm={projectDefaultModel.update.confirmUpdate}
        />
      ) : null}
    </Page>
  );
}
