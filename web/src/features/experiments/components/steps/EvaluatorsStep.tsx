import React from "react";
import { FormItem, FormLabel, FormMessage } from "@/src/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Card, CardDescription } from "@/src/components/ui/card";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import type { EvalTemplate } from "@langfuse/shared";
import { type PartialConfig } from "@/src/features/evals/types";

interface EvaluatorData {
  templateId: string;
  evaluator: PartialConfig & { evalTemplate: EvalTemplate };
}

export interface EvaluatorsStepProps {
  projectId: string;
  datasetId: string | null;
  evalTemplates: EvalTemplate[];
  activeEvaluators: string[];
  inActiveEvaluators: string[];
  selectedEvaluatorData: EvaluatorData | null;
  showEvaluatorForm: boolean;
  hasEvalReadAccess: boolean;
  hasEvalWriteAccess: boolean;
  handleConfigureEvaluator: (templateId: string) => void;
  handleSelectEvaluator: (templateId: string) => void;
  handleCloseEvaluatorForm: () => void;
  handleEvaluatorSuccess: () => void;
  handleEvaluatorToggled: () => void;
  preprocessFormValues: (values: any) => any;
}

export const EvaluatorsStep: React.FC<EvaluatorsStepProps> = ({
  projectId,
  datasetId,
  evalTemplates,
  activeEvaluators,
  inActiveEvaluators,
  selectedEvaluatorData,
  showEvaluatorForm,
  hasEvalReadAccess,
  hasEvalWriteAccess,
  handleConfigureEvaluator,
  handleSelectEvaluator,
  handleCloseEvaluatorForm,
  handleEvaluatorSuccess,
  handleEvaluatorToggled,
  preprocessFormValues,
}) => {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Evaluators (Optional)</h3>
        <p className="text-sm text-muted-foreground">
          Configure evaluators to automatically score experiment results. You
          can add multiple evaluators to assess different aspects of your LLM
          outputs.
        </p>
      </div>

      <FormItem>
        <FormLabel>Select Evaluators</FormLabel>
        <Card className="p-4">
          {hasEvalReadAccess && datasetId ? (
            <TemplateSelector
              projectId={projectId}
              datasetId={datasetId}
              evalTemplates={evalTemplates}
              onConfigureTemplate={handleConfigureEvaluator}
              onSelectEvaluator={handleSelectEvaluator}
              onEvaluatorToggled={handleEvaluatorToggled}
              activeTemplateIds={activeEvaluators}
              inactiveTemplateIds={inActiveEvaluators}
              disabled={!hasEvalWriteAccess}
            />
          ) : (
            <CardDescription>
              {!hasEvalReadAccess
                ? "You don't have permission to manage evaluators"
                : "Please select a dataset first to configure evaluators"}
            </CardDescription>
          )}
        </Card>
        <FormMessage />
      </FormItem>

      {/* Dialog for configuring evaluators */}
      {selectedEvaluatorData && (
        <Dialog
          open={showEvaluatorForm}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEvaluatorForm();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedEvaluatorData.evaluator.id ? "Edit" : "Configure"}{" "}
                Evaluator
              </DialogTitle>
            </DialogHeader>
            <EvaluatorForm
              useDialog={true}
              projectId={projectId}
              evalTemplates={evalTemplates}
              templateId={selectedEvaluatorData.templateId}
              existingEvaluator={selectedEvaluatorData.evaluator}
              mode={selectedEvaluatorData.evaluator.id ? "edit" : "create"}
              hideTargetSection={!selectedEvaluatorData.evaluator.id}
              onFormSuccess={handleEvaluatorSuccess}
              preprocessFormValues={preprocessFormValues}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
