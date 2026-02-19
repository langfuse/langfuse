import { useMemo, useState } from "react";
import { EvalTargetObject, type BatchActionQuery } from "@langfuse/shared";
import { api } from "@/src/utils/api";
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
import { EvaluatorSelectionStep } from "./EvaluatorSelectionStep";
import { ConfirmationStep } from "./ConfirmationStep";
import { CreateEvaluatorDialog } from "./CreateEvaluatorDialog";
import { buildQueryWithSelectedIds } from "./utils";

type RunEvaluationDialogProps = {
  projectId: string;
  selectedObservationIds: string[];
  query: BatchActionQuery;
  selectAll: boolean;
  totalCount: number;
  onClose: () => void;
};

type DialogStep = "select-evaluator" | "confirm";

export function RunEvaluationDialog(props: RunEvaluationDialogProps) {
  const { projectId, selectedObservationIds, query, selectAll, totalCount } =
    props;

  const [step, setStep] = useState<DialogStep>("select-evaluator");
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<string[]>(
    [],
  );
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const evaluatorsQuery = api.evals.jobConfigsByTarget.useQuery({
    projectId,
    targetObject: EvalTargetObject.EVENT,
  });

  const runEvaluationMutation =
    api.batchAction.runEvaluation.create.useMutation({
      onError: (error) => {
        showErrorToast("Failed to schedule evaluation", error.message);
      },
    });

  const displayCount = selectAll ? totalCount : selectedObservationIds.length;

  const previewFilter = useMemo(
    () =>
      buildQueryWithSelectedIds({ query, selectAll, selectedObservationIds })
        .filter ?? [],
    [query, selectAll, selectedObservationIds],
  );

  const previewObservationSeedQuery = api.events.all.useQuery(
    {
      projectId,
      filter: previewFilter,
      searchQuery: selectAll ? (query.searchQuery ?? null) : null,
      searchType: selectAll ? (query.searchType ?? ["id", "content"]) : [],
      page: 1,
      limit: 1,
      orderBy: query.orderBy,
    },
    {
      enabled: displayCount > 0,
    },
  );

  const previewObservationSeed =
    previewObservationSeedQuery.data?.observations?.[0];

  const previewObservationQuery = api.observations.byId.useQuery(
    {
      projectId,
      observationId: previewObservationSeed?.id ?? "",
      traceId: previewObservationSeed?.traceId ?? "",
      startTime: previewObservationSeed?.startTime ?? null,
    },
    {
      enabled: Boolean(
        previewObservationSeed?.id && previewObservationSeed?.traceId,
      ),
    },
  );

  const eligibleEvaluators = useMemo(() => {
    return (evaluatorsQuery.data ?? []).filter(
      (evaluator) => evaluator.targetObject === EvalTargetObject.EVENT,
    );
  }, [evaluatorsQuery.data]);

  const selectedEvaluators = useMemo(
    () =>
      eligibleEvaluators.filter((evaluator) =>
        selectedEvaluatorIds.includes(evaluator.id),
      ),
    [eligibleEvaluators, selectedEvaluatorIds],
  );

  const toggleEvaluatorSelection = (evaluatorId: string) => {
    setSelectedEvaluatorIds((previous) =>
      previous.includes(evaluatorId)
        ? previous.filter((id) => id !== evaluatorId)
        : [...previous, evaluatorId],
    );
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
      });
    } catch {
      return;
    }

    showSuccessToast({
      title: "Evaluation queued",
      description: `Scheduled evaluation for ${displayCount} selected ${displayCount === 1 ? "observation" : "observations"} and ${selectedEvaluators.length} ${selectedEvaluators.length === 1 ? "evaluator" : "evaluators"}.`,
      link: {
        href: `/project/${projectId}/settings/batch-actions`,
        text: "View batch actions",
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
              Evaluate {displayCount} observation
              {displayCount === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              {step === "confirm"
                ? "Review your evaluation configuration before running."
                : "Select one or more observation-scoped evaluators."}
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
                previewObservation={previewObservationQuery.data}
                isPreviewLoading={
                  previewObservationSeedQuery.isLoading ||
                  previewObservationQuery.isLoading
                }
                selectedEvaluatorIds={selectedEvaluatorIds}
                evaluatorSearchQuery={evaluatorSearchQuery}
                onSearchQueryChange={setEvaluatorSearchQuery}
                onToggleEvaluator={toggleEvaluatorSelection}
                onCreateEvaluator={() => setShowCreateDialog(true)}
              />
            ) : (
              <ConfirmationStep
                projectId={projectId}
                displayCount={displayCount}
                evaluators={selectedEvaluators.map((e) => ({
                  id: e.id,
                  name: e.scoreName,
                }))}
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
                disabled={selectedEvaluators.length === 0}
              >
                Continue{" "}
                {selectedEvaluators.length > 0
                  ? `with ${selectedEvaluators.length} evaluator(s)`
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

      <CreateEvaluatorDialog
        projectId={projectId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </>
  );
}
