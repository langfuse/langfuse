import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TRPCClientError } from "@trpc/client";
import { History, Trash2 } from "lucide-react";
import {
  observationVariableMappingList,
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
import { EvaluatorSetupFooter } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupFooter/EvaluatorSetupFooter";
import { SampleObservationSelectorContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/SampleObservationSelectorContainer/SampleObservationSelectorContainer";
import { EvaluatorTestPanelContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/EvaluatorTestPanelContainer/EvaluatorTestPanelContainer";
import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import type { NormalizedEvaluatorDefinition } from "../server/evaluators/evaluatorTypes";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { detailPageListKeys } from "@/src/features/navigate-detail-pages/context";
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
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useProject } from "@/src/features/projects/hooks";
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

type InitialEvaluator = {
  id: string;
  name: string;
  description: string | null;
  type: EvalTemplateType;
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

export function getEvaluatorVersionDefinition(
  version: EvaluatorVersion,
): NormalizedEvaluatorDefinition {
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
        initialType: EvalTemplateType;
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
  const scoreDataType = initialEvaluator
    ? initialEvaluator.definition.type === "LLM_AS_JUDGE"
      ? toScoreOutputFormState(initialEvaluator.definition.outputDefinition)
          .dataType
      : getFirstCodeEvaluatorScoreDataType(
          initialEvaluator.definition.sourceCode,
        )
    : undefined;
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
  useEffect(() => {
    evaluatorSetupStore
      .getState()
      .actions.setDefaultModel(projectDefaultModel.defaultModel);
  }, [evaluatorSetupStore, projectDefaultModel.defaultModel]);
  const codeDraft = useStore(
    evaluatorSetupStore,
    useShallow((state) => ({
      type: state.type,
      sourceCode: state.sourceCode,
      sourceCodeLanguage: state.sourceCodeLanguage,
    })),
  );
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
  const hasRequestedName = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
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
      initialEvaluator?.type === "LLM_AS_JUDGE" ? version.promptMessages : null,
    provider: version.provider,
    model: version.model,
    modelParams: version.modelParams as EvaluatorVersion["modelParams"],
    vars: version.vars,
    variableMapping: version.variableMapping,
    outputDefinition: version.outputDefinition,
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
    return state.type === "LLM_AS_JUDGE"
      ? { type: state.type, promptMessages: state.promptMessages }
      : { type: state.type, sourceCode: state.sourceCode };
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
    const isNameStep = step === (state.type === "LLM_AS_JUDGE" ? 3 : 2);
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

  const save = async () => {
    try {
      let state = evaluatorSetupStore.getState();
      const metadata = await prepareEvaluatorMetadataForSave({
        currentName: state.name,
        currentDescription: state.description,
        generateName: nameAIAssistanceAvailable ? generateNameSuggestion : null,
        generateDescription:
          nameAIAssistanceAvailable && !initialEvaluator
            ? async () => {
                try {
                  return await generateDescriptionSuggestion();
                } catch (error) {
                  trpcErrorToast(error);
                  return null;
                }
              }
            : null,
        setName: state.actions.setName,
        setDescription: state.actions.setDescription,
      });
      if (!metadata) {
        showErrorToast(
          "Evaluator name required",
          "We couldn't generate a name. Please enter one manually and try again.",
        );
        return;
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
          return;
        }
      }
      const { definition } = prepareEvaluatorDraft(state);
      if (!definition) return;
      const { name, description } = metadata;

      if (props.mode === "edit") {
        const evaluator = await update.mutateAsync({
          projectId,
          evaluatorId: props.initialEvaluator.id,
          name,
          description,
          definition,
        });
        capture("evaluators:update", {
          evaluatorType: state.type,
          filterExperience,
          ...(definition.type === "LLM_AS_JUDGE"
            ? getJudgePromptAnalyticsProperties(definition.promptMessages)
            : {}),
        });
        showSuccessToast({
          title: "Evaluator saved",
          description: "Your evaluator changes are saved.",
        });
        initialSnapshot.current = getCurrentSnapshot(state);
        await utils.evalsV2.filterOptions.invalidate({ projectId });
        await router.push(`/project/${projectId}/evals/${evaluator.id}`);
        return;
      }

      const evaluator = await create.mutateAsync({
        projectId,
        evaluatorId,
        name,
        description,
        definition,
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
      });
      initialSnapshot.current = getCurrentSnapshot(state);
      await utils.evalsV2.filterOptions.invalidate({ projectId });
      if (!shouldOfferRuleAttachment(evaluator)) {
        await router.push(`/project/${projectId}/evals/${evaluator.id}`);
        return;
      }
      setSavedEvaluator({
        id: evaluator.id,
        name,
        type: state.type,
        defaultVariableMapping: observationVariableMappingList
          .catch([])
          .parse(definition.variableMapping),
        sampleFilter: state.sampleFilter,
        hasCompletedTestCall,
        testRunCostUsd: lastTestRunCostUsd,
      });
    } catch (error) {
      if (
        initialEvaluator &&
        error instanceof TRPCClientError &&
        error.data?.code === "CONFLICT"
      ) {
        setVersionConflictOpen(true);
      } else {
        trpcErrorToast(error);
      }
    }
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
      store={evaluatorSetupStore}
      isEditing={Boolean(initialEvaluator)}
      defaultModel={projectDefaultModel.defaultModel}
      providerGroups={projectDefaultModel.providerGroups}
      providerAdapters={projectDefaultModel.providerAdapters}
      canSetProjectDefault={projectDefaultModel.canUpdate}
      onConfigureProviders={projectDefaultModel.openProviderSettings}
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
                onGenerate: () =>
                  requestNameSuggestion(true).catch(trpcErrorToast),
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
            if (observation.traceId) {
              sampleTracePeekNavigation.openPeek(observation.traceId);
            }
          }}
        />
      }
      testResult={testResult}
      testPending={testEvaluator.isPending}
      rawResultOpen={rawResultOpen}
      onRawResultOpenChange={setRawResultOpen}
      onRunTest={runTest}
      onOpenExecutionTrace={(traceId) =>
        sampleTracePeekNavigation.openPeek(traceId)
      }
    />
  );

  return (
    <Page
      headerProps={{
        title: initialEvaluator ? "Configure evaluator" : "New evaluator",
        breadcrumb: [
          { name: "Evaluators", href: `/project/${projectId}/evals` },
        ],
        actionButtonsRight: initialEvaluator ? (
          <div className="flex gap-2">
            <EvaluatorRuleRelationships
              projectId={projectId}
              evaluatorId={initialEvaluator.id}
              evaluatorName={initialEvaluator.name}
              evaluatorType={initialEvaluator.type}
              evaluatorDefaultVariableMapping={
                initialEvaluator.definition.variableMapping
              }
            />
            <EvaluatorAlertButton
              scope="evaluator"
              projectId={projectId}
              evaluatorId={initialEvaluator.id}
              evaluatorType={initialEvaluator.type}
              scoreDataType={scoreDataType}
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
      <div className="flex min-h-0 flex-1 flex-col">
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
        {initialEvaluator?.blockedAt ? (
          <div className="mx-3 mt-3">
            <EvaluatorBlockedBanner
              projectId={projectId}
              blockedAt={initialEvaluator.blockedAt}
              blockReason={initialEvaluator.blockReason}
              blockMessage={initialEvaluator.blockMessage}
              canReactivate={canReactivate}
              reactivationPending={reactivate.isPending}
              onReactivate={() => {
                capture("evaluators:reactivate", {
                  blockReason:
                    initialEvaluator.blockReason ?? "EVAL_MODEL_CONFIG_INVALID",
                });
                reactivate.mutate({
                  projectId,
                  evaluatorId: initialEvaluator.id,
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
          isSaving={
            create.isPending ||
            update.isPending ||
            suggestName.isPending ||
            suggestDescription.isPending
          }
          nameAIAssistanceAvailable={nameAIAssistanceAvailable}
          codeValidation={
            codeDraft.type === "CODE"
              ? {
                  isValid: codeValidation.isValid,
                  isPending: codeValidation.isPending,
                }
              : null
          }
          onClose={requestClose}
          onSave={save}
        />
      </div>
      {initialEvaluator ? (
        <EvaluatorVersionHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          evaluatorName={initialEvaluator.name}
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
