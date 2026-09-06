import { useMemo, useState } from "react";
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
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { ChevronLeft } from "lucide-react";
import {
  EvaluatorSelectionStep,
  type BatchEvaluator,
} from "./EvaluatorSelectionStep";
import { ConfirmationStep } from "./ConfirmationStep";
import { buildQueryWithSelectedIds, getCreateEvaluatorHref } from "./utils";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";
import { useTranslations } from "next-intl";

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

/** Matches the evaluator overview page size; the step filters client-side. */
const BATCH_EVALUATOR_LIMIT = 100;

export function RunEvaluationDialog(props: RunEvaluationDialogProps) {
  const t = useTranslations("operationsUi.batchActions.runEvaluation");
  const {
    projectId,
    selectedObservationIds,
    query,
    selectAll,
    totalCount,
    sourceTable = SourceTable.EVENTS,
  } = props;

  const [step, setStep] = useState<DialogStep>("select-evaluator");
  const [selectedEvaluators, setSelectedEvaluators] = useState<
    BatchEvaluator[]
  >([]);
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const forceV3Experience = useForceV3Experience(projectId);

  // Unsearched: `EvaluatorSelectionStep` filters the list client-side, the
  // same way the overview does, so typing does not refetch.
  const evaluatorsQuery = api.evalsV2.options.useQuery({
    projectId,
    limit: BATCH_EVALUATOR_LIMIT,
    excludeLegacyEvaluators: true,
  });

  const runEvaluationMutation =
    api.batchAction.runEvaluation.create.useMutation({
      onError: (error) => {
        showErrorToast(t("failedToSchedule"), error.message);
      },
    });

  const displayCount = selectAll ? totalCount : selectedObservationIds.length;
  // For experiments source, displayCount is experiment count, not item count
  const isExperimentsSource = sourceTable === SourceTable.EXPERIMENTS;
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
      // A blocked evaluator is skipped by the scheduler, so offering it would
      // report a successful batch that produced no scores.
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

  const selectedEvaluatorIds = useMemo(
    () => selectedEvaluators.map((evaluator) => evaluator.id),
    [selectedEvaluators],
  );

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
    if (selectedEvaluators.length === 0) {
      return;
    }

    const finalQuery = buildQueryWithSelectedIds({
      query,
      selectAll,
      selectedObservationIds,
    });

    try {
      await runEvaluationMutation.mutateAsync({
        projectId,
        query: finalQuery,
        evaluatorIds: selectedEvaluators.map((evaluator) => evaluator.id),
        sourceTable,
        evalVersion: "v2",
      });
    } catch {
      return;
    }

    showSuccessToast({
      title: t("queuedTitle"),
      description: isExperimentsSource
        ? t("queuedExperiments", {
            experimentCount: displayCount,
            evaluatorCount: selectedEvaluators.length,
          })
        : sourceTable === SourceTable.EXPERIMENT_ITEMS
          ? t("queuedExperimentItems", {
              itemCount: displayCount,
              experimentCount: experimentItemsExperimentCount,
              evaluatorCount: selectedEvaluators.length,
            })
          : t("queuedObservations", {
              count: displayCount,
              evaluatorCount: selectedEvaluators.length,
            }),
      link: {
        href: `/project/${projectId}/settings/batch-actions`,
        text: t("viewBatchActions"),
      },
    });

    props.onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && props.onClose()}>
        <DialogContent className="flex max-h-[62vh] min-h-[38vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {isExperimentsSource
                ? t("titleExperiments", { count: displayCount })
                : sourceTable === SourceTable.EXPERIMENT_ITEMS
                  ? t("titleExperimentItems", {
                      itemCount: displayCount,
                      experimentCount: experimentItemsExperimentCount,
                    })
                  : t("titleObservations", { count: displayCount })}
            </DialogTitle>
            <DialogDescription>
              {step === "confirm"
                ? t("reviewDescription")
                : t("selectDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex-1 overflow-hidden">
            {step === "select-evaluator" ? (
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
                createEvaluatorHref={getCreateEvaluatorHref({
                  projectId,
                  forceV3Experience,
                })}
              />
            ) : (
              <ConfirmationStep
                projectId={projectId}
                displayCount={displayCount}
                evaluators={selectedEvaluators.map((e) => ({
                  id: e.id,
                  name: e.scoreName,
                }))}
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
                {t("back")}
              </Button>
            ) : (
              <div />
            )}

            {step === "select-evaluator" ? (
              <Button
                onClick={() => setStep("confirm")}
                disabled={selectedEvaluators.length === 0}
              >
                {selectedEvaluators.length > 0
                  ? t("continueWith", { count: selectedEvaluators.length })
                  : t("continue")}
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                loading={runEvaluationMutation.isPending}
              >
                {t("run")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
