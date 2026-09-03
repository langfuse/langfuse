import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "zustand";
import {
  type BatchActionQuery,
  type BatchEvalSourceTable,
  BatchEvalSourceTable as SourceTable,
  extractVariables,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { ChevronLeft, ExternalLink, Plus } from "lucide-react";
import {
  EvaluatorSelectionStep,
  type BatchEvaluator,
} from "./EvaluatorSelectionStep";
import { EvaluatorMappingStep } from "./EvaluatorMappingStep";
import { ConfirmationStep } from "./ConfirmationStep";
import {
  buildQueryWithSelectedIds,
  getBatchEvalCostObservationCount,
  getCreateEvaluatorHref,
  hasCompleteBatchEvalMappings,
} from "./utils";
import { BATCH_EVAL_EVALUATOR_LIMIT } from "@/src/features/batch-actions/validation";
import {
  buildSelectedSampleObject,
  createRuleSetupStore,
} from "@/src/features/evals";
import { coverEvaluatorPromptVariables } from "@/src/features/evals/v2/fns/variableMapping/coverEvaluatorPromptVariables";
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
      limit: BATCH_EVAL_EVALUATOR_LIMIT,
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
        .map((evaluator) => {
          const prepared = prepareModernRuleVariableMapping(
            evaluator.latestVersion?.variableMapping,
            evaluator.type,
          );
          const requiredVariables =
            evaluator.type === "CODE"
              ? []
              : extractVariables(evaluator.latestVersion?.prompt ?? "");

          return {
            id: evaluator.id,
            name: evaluator.name,
            type: evaluator.type,
            updatedAt: evaluator.updatedAt,
            createdByUser: evaluator.createdByUser,
            defaultVariableMapping: coverEvaluatorPromptVariables(
              prepared.defaultVariableMapping,
              requiredVariables,
            ),
            initialVariableMapping: prepared.initialVariableMapping,
            requiredVariables,
          };
        }),
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

  const selectedCount = showMappingEditor
    ? mappingAssignments.length
    : selectedEvaluators.length;
  const mappingsComplete = hasCompleteBatchEvalMappings(mappingAssignments);
  const costObservationCount = getBatchEvalCostObservationCount({
    displayCount,
    sourceTable,
  });
  const mappingRunDisabledReason =
    selectedCount === 0
      ? "Attach at least one evaluator."
      : mappingsComplete
        ? null
        : "Map every evaluator variable to a source column before running.";

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
    if (showMappingEditor && !mappingsComplete) {
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
                  projectId={projectId}
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
                  costObservationCount={costObservationCount}
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
                />
              )
            ) : (
              <ConfirmationStep
                projectId={projectId}
                displayCount={displayCount}
                evaluators={selectedEvaluators.map((evaluator) => ({
                  id: evaluator.id,
                  name: evaluator.scoreName,
                }))}
                hideCount={sourceTable !== SourceTable.EVENTS}
                sourceTable={sourceTable}
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

            <div className="flex items-center gap-2">
              {step !== "confirm" ? (
                <CreateEvaluatorButton href={createEvaluatorHref} />
              ) : null}
              {showMappingEditor ? (
                <MappingRunButton
                  disabledReason={mappingRunDisabledReason}
                  selectedCount={selectedCount}
                  loading={runEvaluationMutation.isPending}
                  onClick={onSubmit}
                />
              ) : step === "select-evaluator" ? (
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateEvaluatorButton({ href }: { href: string }) {
  return (
    <Button variant="secondary" className="gap-1.5" asChild>
      <Link
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="Create new Evaluator (opens in a new tab)"
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        Create new Evaluator
        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      </Link>
    </Button>
  );
}

function MappingRunButton({
  disabledReason,
  selectedCount,
  loading,
  onClick,
}: {
  disabledReason: string | null;
  selectedCount: number;
  loading: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      loading={loading}
      className={disabledReason ? "pointer-events-none" : undefined}
    >
      Run Evaluation
      {selectedCount > 0 ? ` with ${selectedCount} evaluator(s)` : null}
    </Button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed" tabIndex={0}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
