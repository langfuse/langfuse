/* eslint-disable no-nested-ternary, @repo/component-file-structure, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "zustand";
import {
  type BatchActionQuery,
  type BatchEvalSourceTable,
  BatchEvalSourceTable as SourceTable,
  extractVariables,
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
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { ExternalLink, Plus } from "@langfuse/icons";
import { EvaluatorMappingStep } from "./EvaluatorMappingStep";
import {
  buildQueryWithSelectedIds,
  getBatchEvalCostObservationCount,
  getCreateEvaluatorHref,
  hasCompleteBatchEvalMappings,
} from "./utils";
import { BATCH_EVAL_EVALUATOR_LIMIT } from "@/src/features/batch-actions/validation";
import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { coverEvaluatorPromptVariables } from "@/src/features/evals/v2/fns/variableMapping/coverEvaluatorPromptVariables";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { useDebounce } from "@/src/hooks/useDebounce";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type RunEvaluationDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
  onSuccess: () => void;
  experimentCount?: number;
  exampleObservation?: {
    id: string;
    traceId: string;
    startTime?: Date;
  };
  sourceTable?: BatchEvalSourceTable;
};

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

  const evaluatorsQuery = api.evalsV2.options.useQuery(
    {
      projectId,
      limit: BATCH_EVAL_EVALUATOR_LIMIT,
      excludeLegacyEvaluators: true,
      search: mappingSearchQuery.trim() ? mappingSearchQuery.trim() : undefined,
    },
    {
      placeholderData: (previousData) => previousData,
    },
  );

  const runEvaluationMutation =
    api.batchAction.runEvaluation.create.useMutation({
      onError: (error) => {
        showErrorToast(
          "Failed to schedule evaluation",
          error.message,
          classifyTrpcToastError(error, "evaluation.queue"),
        );
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

  const sampleObject = buildSelectedSampleObject({
    observation: props.exampleObservation?.id ? props.exampleObservation : null,
    eventDetails: previewQuery.data?.[0],
  });

  const selectedCount = mappingAssignments.length;
  const mappingsComplete = hasCompleteBatchEvalMappings(mappingAssignments);
  const costObservationCount = getBatchEvalCostObservationCount({
    displayCount,
    sourceTable,
  });
  const mappingRunDisabledReason = (() => {
    if (selectedCount === 0) {
      return "Select at least one evaluator.";
    }
    if (mappingsComplete) {
      return null;
    }
    return "Map every evaluator variable to a source column before running.";
  })();

  const onSubmit = async () => {
    if (selectedCount === 0 || !mappingsComplete) {
      return;
    }

    const finalQuery = buildQueryWithSelectedIds({
      query,
      selectAll,
      selectedObservationIds,
    });
    const evaluatorIds = mappingAssignments.map(
      (assignment) => assignment.evaluatorId,
    );
    const evaluatorMappings = mappingAssignments.map((assignment) => ({
      evaluatorId: assignment.evaluatorId,
      variableMapping: assignment.variableMapping,
    }));
    const mappingOverrideCount = evaluatorMappings.filter(
      (mapping) => mapping.variableMapping !== null,
    ).length;

    try {
      await runEvaluationMutation.mutateAsync({
        projectId,
        query: finalQuery,
        evaluatorIds,
        sourceTable,
        evalVersion: "v2",
        evaluatorMappings,
      });
    } catch {
      return;
    }

    capture("batch_eval:run", {
      evaluatorCount: evaluatorIds.length,
      mappingOverrideCount,
      sourceTable,
      isV4: true,
    });

    showSuccessToast({
      operation: "evaluation.queue",
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

    props.onSuccess();
    props.onClose();
  };

  const createEvaluatorHref = getCreateEvaluatorHref(projectId);

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !runEvaluationMutation.isPending && props.onClose()
      }
    >
      <DialogContent
        size="lg"
        className="flex max-h-[85vh] min-h-[38vh] flex-col"
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
            Select evaluators and review their variable mappings.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
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
        </DialogBody>

        <DialogFooter className="flex justify-between">
          <div />
          <div className="flex items-center gap-2">
            <CreateEvaluatorButton
              href={createEvaluatorHref}
              onClick={() => {
                capture("eval:onboarding_started", {
                  entryPoint: "batch_evaluation",
                });
              }}
            />
            <MappingRunButton
              disabledReason={mappingRunDisabledReason}
              selectedCount={selectedCount}
              loading={runEvaluationMutation.isPending}
              onClick={onSubmit}
            />
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateEvaluatorButton({
  href,
  onClick,
}: {
  href: string;
  onClick: () => void;
}) {
  return (
    <Button variant="secondary" className="gap-1.5" asChild>
      <Link
        href={href}
        onClick={onClick}
        target="_blank"
        rel="noreferrer"
        aria-label="Create new Evaluator (opens in a new tab)"
      >
        <Plus size="base" aria-hidden="true" />
        Create new Evaluator
        <ExternalLink size="base" aria-hidden="true" />
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
    <Tooltip label={disabledReason} hoverableContent={false}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          className="inline-flex cursor-not-allowed"
          tabIndex={0}
        >
          {button}
        </span>
      )}
    </Tooltip>
  );
}
