import React from "react";
import { FormItem, FormLabel, FormMessage } from "@/src/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { type EvaluatorsStepProps } from "@/src/features/experiments/types/stepProps";
import { StepHeader } from "@/src/features/experiments/components/shared/StepHeader";
import { ExperimentEvaluatorAssignments } from "@/src/features/experiments/components/ExperimentEvaluatorAssignments/ExperimentEvaluatorAssignments";
import { Skeleton } from "@/src/components/ui/skeleton";

export const EvaluatorsStep: React.FC<EvaluatorsStepProps> = ({
  projectId,
  datasetId,
  datasetVersion,
  evaluatorAssignmentsRef,
  evaluatorState,
  permissions,
}) => {
  const { hasEvalReadAccess, hasEvalWriteAccess } = permissions;
  return (
    <div className="space-y-6">
      <StepHeader
        title="Evaluators (Optional)"
        description={
          evaluatorState.version === "v2"
            ? "Choose evaluators to score experiment results and review their variable mappings."
            : "Configure evaluators to automatically score experiment results. You can add multiple evaluators to assess different aspects of your LLM outputs."
        }
      />

      <FormItem className="space-y-3">
        {evaluatorState.version === "legacy" ? (
          <FormLabel>Evaluators</FormLabel>
        ) : null}
        {hasEvalReadAccess && datasetId ? (
          evaluatorState.version === "v2" ? (
            evaluatorState.isLoadingAssignments ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <ExperimentEvaluatorAssignments
                ref={evaluatorAssignmentsRef}
                showSaveButton={false}
                projectId={projectId}
                datasetId={datasetId}
                datasetVersion={datasetVersion}
                evaluatorOptions={evaluatorState.evaluatorOptions}
                initialAssignments={evaluatorState.selectedAssignments}
                search={evaluatorState.search}
                onSearchChange={evaluatorState.onSearchChange}
                onSaveAssignments={evaluatorState.onSaveAssignments}
                disabled={!hasEvalWriteAccess || evaluatorState.isUpdating}
              />
            )
          ) : (
            <TemplateSelector
              projectId={projectId}
              datasetId={datasetId!}
              evalTemplates={evaluatorState.evalTemplates}
              onConfigureTemplate={evaluatorState.handleConfigureEvaluator}
              onSelectEvaluator={evaluatorState.handleSelectEvaluator}
              disabled={!hasEvalWriteAccess}
            />
          )
        ) : (
          <p className="text-muted-foreground text-sm">
            {!hasEvalReadAccess
              ? "You don't have permission to manage evaluators"
              : "Please select a dataset first to configure evaluators"}
          </p>
        )}
        <FormMessage />
      </FormItem>

      {/* Dialog for configuring evaluators */}
      {evaluatorState.version === "legacy" &&
        evaluatorState.selectedEvaluatorData && (
          <Dialog
            open={evaluatorState.showEvaluatorForm}
            onOpenChange={(open) => {
              if (!open) {
                evaluatorState.handleCloseEvaluatorForm();
              }
            }}
          >
            <DialogContent className="max-h-[90vh] max-w-(--breakpoint-md) overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {evaluatorState.selectedEvaluatorData.evaluator.id
                    ? "Edit"
                    : "Configure"}{" "}
                  Evaluator
                </DialogTitle>
              </DialogHeader>
              <EvaluatorForm
                useDialog={true}
                projectId={projectId}
                evalTemplates={evaluatorState.evalTemplates}
                templateId={evaluatorState.selectedEvaluatorData.templateId}
                existingEvaluator={
                  evaluatorState.selectedEvaluatorData.evaluator
                }
                mode={
                  evaluatorState.selectedEvaluatorData.evaluator.id
                    ? "edit"
                    : "create"
                }
                hideTargetSection={
                  !evaluatorState.selectedEvaluatorData.evaluator.id
                }
                onFormSuccess={evaluatorState.handleEvaluatorSuccess}
                preprocessFormValues={evaluatorState.preprocessFormValues}
              />
            </DialogContent>
          </Dialog>
        )}
    </div>
  );
};
