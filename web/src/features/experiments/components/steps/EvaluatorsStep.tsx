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
import { ExperimentEvaluatorSelectorContent } from "@/src/features/experiments/components/ExperimentEvaluatorSelector";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { ChevronDown } from "lucide-react";

export const EvaluatorsStep: React.FC<EvaluatorsStepProps> = ({
  projectId,
  datasetId,
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
            ? "Evaluators with variables mapped to experiment columns."
            : "Configure evaluators to automatically score experiment results. You can add multiple evaluators to assess different aspects of your LLM outputs."
        }
      />

      <FormItem>
        <FormLabel>Evaluators</FormLabel>
        {hasEvalReadAccess && (evaluatorState.version === "v2" || datasetId) ? (
          evaluatorState.version === "v2" ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between px-2 font-normal"
                >
                  {evaluatorState.evaluatorOptions.length > 0
                    ? `${evaluatorState.evaluatorOptions.length} ${evaluatorState.evaluatorOptions.length === 1 ? "evaluator" : "evaluators"}`
                    : "No experiment evaluators"}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <ExperimentEvaluatorSelectorContent
                projectId={projectId}
                evaluatorOptions={evaluatorState.evaluatorOptions}
                search={evaluatorState.search}
                onSearchChange={evaluatorState.onSearchChange}
              />
            </Popover>
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
