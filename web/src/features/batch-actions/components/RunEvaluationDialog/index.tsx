import { useMemo, useState } from "react";
import { useStore } from "zustand";
import {
  type BatchActionQuery,
  type BatchEvalSourceTable,
  BatchEvalSourceTable as SourceTable,
  observationVariableMappingList,
} from "@langfuse/shared";
import { api, sendAsPostOption } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { ChevronLeft } from "lucide-react";
import {
  EvaluatorSelectionStep,
  type BatchEvaluator,
} from "./EvaluatorSelectionStep";
import { EvaluatorMappingStep } from "./EvaluatorMappingStep";
import { ConfirmationStep } from "./ConfirmationStep";
import { buildQueryWithSelectedIds, getCreateEvaluatorHref } from "./utils";
import {
  buildSelectedSampleObject,
  createRuleSetupStore,
} from "@/src/features/evals";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { useDebounce } from "@/src/hooks/useDebounce";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

type RunEvaluationDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
  experimentCount?: number;
  exampleObservation?: {
    id: string;
    traceId: string;
    startTime?: Date;
  };
  sourceTable?: BatchEvalSourceTable;
};

type DialogStep = "select-evaluator" | "confirm";

/** Matches the evaluator overview page size; the forced-v3 step filters client-side. */
const BATCH_EVALUATOR_LIMIT = 100;

export function RunEvaluationDialog(props: RunEvaluationDialogProps) {
  const {
    projectId,
    selectedObservationIds,
    query,
    selectAll,
    totalCount,
    sourceTable = SourceTable.EVENTS,
  } = props;

  const capture = usePostHogClientCapture();
  const [step, setStep] = useState<DialogStep>("select-evaluator");
  const [selectedEvaluators, setSelectedEvaluators] = useState<
    BatchEvaluator[]
  >([]);
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const [mappingSearch, setMappingSearch] = useState("");
  const [mappingSearchQuery, setMappingSearchQuery] = useState("");
  const debouncedMappingSearch = useDebounce(setMappingSearchQuery, 300, false);
  const [ruleSetupStore] = useState(() =>
    createRuleSetupStore({
      name: "Batch evaluation",
      filter: [],
      sampling: 1,
      assignments: [],
    }),
  );
  const mappingAssignments = useStore(
    ruleSetupStore,
    (state) => state.assignments,
  );

  const forceV3Query = api.v4Transition.forceV3Experience.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
      staleTime: Infinity,
    },
  );
  const forceV3Experience = forceV3Query.data === true;
  const isExperiencePending = forceV3Query.isPending;
  const showMappingEditor = !isExperiencePending && !forceV3Experience;

  const evaluatorsQuery = api.evalsV2.options.useQuery(
    {
      projectId,
      limit: BATCH_EVALUATOR_LIMIT,
      excludeLegacyEvaluators: true,
      search:
        showMappingEditor && mappingSearchQuery.trim()
          ? mappingSearchQuery.trim()
          : undefined,
    },
    {
      placeholderData: (previousData) => previousData,
    },
  );

  const runEvaluationMutation =
    api.batchAction.runEvaluation.create.useMutation({
      onError: (error) => {
        showErrorToast("Failed to schedule evaluation", error.message);
      },
    });

  const displayCount = selectAll ? totalCount : selectedObservationIds.length;
  const isExperimentsSource = sourceTable === SourceTable.EXPERIMENTS;
  const scopeLabel =
    sourceTable === SourceTable.EVENTS ? "observation" : "experiment item";
  const experimentItemsExperimentCount =
    sourceTable === SourceTable.EXPERIMENT_ITEMS
      ? (props.experimentCount ?? 0)
      : 0;

  const previewQuery = api.events.batchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: props.exampleObservation?.id as string,
          traceId: props.exampleObservation?.traceId as string,
        },
      ],
      minStartTime: props.exampleObservation?.startTime as Date,
      maxStartTime: props.exampleObservation?.startTime as Date,
      truncated: false,
      includeToolCalls: true,
    },
    {
      ...sendAsPostOption,
      enabled: Boolean(
        props.exampleObservation?.id &&
        props.exampleObservation?.traceId &&
        props.exampleObservation?.startTime,
      ),
    },
  );

  const eligibleEvaluators = useMemo(
    () =>
      (evaluatorsQuery.data ?? [])
        .filter((evaluator) => evaluator.blockedAt === null)
        .map(
          (evaluator): BatchEvaluator => ({
            id: evaluator.id,
            scoreName: evaluator.name,
            variableMapping:
              observationVariableMappingList.safeParse(
                evaluator.latestVersion?.variableMapping,
              ).data ?? [],
            prompt: evaluator.latestVersion?.prompt ?? null,
          }),
        ),
    [evaluatorsQuery.data],
  );

  const evaluatorOptions = useMemo(
    () =>
      (evaluatorsQuery.data ?? [])
        .filter((evaluator) => evaluator.blockedAt === null)
        .map((evaluator) => ({
          id: evaluator.id,
          name: evaluator.name,
          type: evaluator.type,
          updatedAt: evaluator.updatedAt,
          createdByUser: evaluator.createdByUser,
          ...prepareModernRuleVariableMapping(
            evaluator.latestVersion?.variableMapping,
            evaluator.type,
          ),
        })),
    [evaluatorsQuery.data],
  );

  const selectedEvaluatorIds = useMemo(
    () => selectedEvaluators.map((evaluator) => evaluator.id),
    [selectedEvaluators],
  );

  const sampleObject = buildSelectedSampleObject({
    observation: props.exampleObservation?.id ? props.exampleObservation : null,
    eventDetails: previewQuery.data?.[0],
  });

  const selectedMappingEvaluators = mappingAssignments.map((assignment) => ({
    id: assignment.evaluatorId,
    name: assignment.evaluatorName,
  }));
  const confirmationEvaluators = showMappingEditor
    ? selectedMappingEvaluators
    : selectedEvaluators.map((evaluator) => ({
        id: evaluator.id,
        name: evaluator.scoreName,
      }));
  const selectedCount = showMappingEditor
    ? mappingAssignments.length
    : selectedEvaluators.length;

  const toggleEvaluatorSelection = (evaluatorId: string) => {
    setSelectedEvaluators((previous) => {
      if (previous.some((evaluator) => evaluator.id === evaluatorId)) {
        return previous.filter((evaluator) => evaluator.id !== evaluatorId);
      }
      const evaluator = eligibleEvaluators.find(
        (candidate) => candidate.id === evaluatorId,
      );
      return evaluator ? [...previous, evaluator] : previous;
    });
  };

  const onSubmit = async () => {
    if (selectedCount === 0) {
      return;
    }

    const finalQuery = buildQueryWithSelectedIds({
      query,
      selectAll,
      selectedObservationIds,
    });
    const evaluatorIds = showMappingEditor
      ? mappingAssignments.map((assignment) => assignment.evaluatorId)
      : selectedEvaluators.map((evaluator) => evaluator.id);
    const evaluatorMappings = showMappingEditor
      ? mappingAssignments.map((assignment) => ({
          evaluatorId: assignment.evaluatorId,
          variableMapping: assignment.variableMapping,
        }))
      : undefined;
    const mappingOverrideCount = (evaluatorMappings ?? []).filter(
      (mapping) => mapping.variableMapping !== null,
    ).length;

    try {
      await runEvaluationMutation.mutateAsync({
        projectId,
        query: finalQuery,
        evaluatorIds,
        sourceTable,
        evalVersion: "v2",
        ...(evaluatorMappings ? { evaluatorMappings } : {}),
      });
    } catch {
      return;
    }

    capture("batch_eval:run", {
      evaluatorCount: evaluatorIds.length,
      mappingOverrideCount,
      sourceTable,
      isForceV3Experience: forceV3Experience,
      isV4: true,
    });

    showSuccessToast({
      title: "Evaluation queued",
      description: isExperimentsSource
        ? `Scheduled evaluation for items from ${displayCount} selected experiment${displayCount === 1 ? "" : "s"} with ${evaluatorIds.length} ${evaluatorIds.length === 1 ? "evaluator" : "evaluators"}.`
        : sourceTable === SourceTable.EXPERIMENT_ITEMS
          ? `Scheduled evaluation for up to ${displayCount} experiment item${displayCount === 1 ? "" : "s"} across ${experimentItemsExperimentCount} experiment${experimentItemsExperimentCount === 1 ? "" : "s"} with ${evaluatorIds.length} ${evaluatorIds.length === 1 ? "evaluator" : "evaluators"}.`
          : `Scheduled evaluation for ${displayCount} selected ${scopeLabel}${displayCount === 1 ? "" : "s"} with ${evaluatorIds.length} ${evaluatorIds.length === 1 ? "evaluator" : "evaluators"}.`,
      link: {
        href: `/project/${projectId}/settings/batch-actions`,
        text: "View batch actions",
      },
    });

    props.onClose();
  };

  const createEvaluatorHref = getCreateEvaluatorHref({
    projectId,
    forceV3Experience,
  });

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && props.onClose()}>
        <DialogContent
          {...(showMappingEditor ? { size: "lg" as const } : {})}
          className={
            showMappingEditor
              ? "flex max-h-[85vh] min-h-[38vh] flex-col"
              : "flex max-h-[62vh] min-h-[38vh] max-w-2xl flex-col"
          }
        >
          <DialogHeader>
            <DialogTitle>
              {isExperimentsSource
                ? `Evaluate items from ${displayCount} experiment${displayCount === 1 ? "" : "s"}`
                : sourceTable === SourceTable.EXPERIMENT_ITEMS
                  ? `Evaluate up to ${displayCount} experiment item${displayCount === 1 ? "" : "s"} across ${experimentItemsExperimentCount} experiment${experimentItemsExperimentCount === 1 ? "" : "s"}`
                  : `Evaluate ${displayCount} ${scopeLabel}${displayCount === 1 ? "" : "s"}`}
            </DialogTitle>
            <DialogDescription>
              {step === "confirm"
                ? "Review your evaluation configuration before running."
                : showMappingEditor
                  ? "Select evaluators and review their variable mappings."
                  : "Select one or more evaluators."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody
            className={
              showMappingEditor
                ? "min-h-0 flex-1 overflow-y-auto"
                : "flex-1 overflow-hidden"
            }
          >
            {isExperiencePending ? (
              <Skeleton className="h-20 w-full" />
            ) : step === "select-evaluator" ? (
              showMappingEditor ? (
                <EvaluatorMappingStep
                  store={ruleSetupStore}
                  evaluatorOptions={evaluatorOptions}
                  isQueryLoading={evaluatorsQuery.isLoading}
                  isQueryError={evaluatorsQuery.isError}
                  queryErrorMessage={evaluatorsQuery.error?.message}
                  search={mappingSearch}
                  onSearchChange={(value) => {
                    setMappingSearch(value);
                    debouncedMappingSearch(value);
                  }}
                  sampleObject={sampleObject}
                  createEvaluatorHref={createEvaluatorHref}
                />
              ) : (
                <EvaluatorSelectionStep
                  eligibleEvaluators={eligibleEvaluators}
                  selectedEvaluators={selectedEvaluators}
                  isQueryLoading={evaluatorsQuery.isLoading}
                  isQueryError={evaluatorsQuery.isError}
                  queryErrorMessage={evaluatorsQuery.error?.message}
                  previewObservation={previewQuery.data?.[0]}
                  isPreviewLoading={previewQuery.isLoading}
                  selectedEvaluatorIds={selectedEvaluatorIds}
                  evaluatorSearchQuery={evaluatorSearchQuery}
                  onSearchQueryChange={setEvaluatorSearchQuery}
                  onToggleEvaluator={toggleEvaluatorSelection}
                  createEvaluatorHref={createEvaluatorHref}
                />
              )
            ) : (
              <ConfirmationStep
                projectId={projectId}
                displayCount={displayCount}
                evaluators={confirmationEvaluators}
                hideCount={sourceTable !== SourceTable.EVENTS}
                sourceTable={sourceTable}
                experimentCount={experimentItemsExperimentCount}
              />
            )}
          </DialogBody>

          <DialogFooter className="flex justify-between">
            {step === "confirm" ? (
              <Button
                variant="ghost"
                onClick={() => setStep("select-evaluator")}
                disabled={runEvaluationMutation.isPending}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {step === "select-evaluator" ? (
              <Button
                onClick={() => setStep("confirm")}
                disabled={isExperiencePending || selectedCount === 0}
              >
                Continue{" "}
                {selectedCount > 0
                  ? `with ${selectedCount} evaluator(s)`
                  : null}
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                loading={runEvaluationMutation.isPending}
              >
                Run Evaluation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
