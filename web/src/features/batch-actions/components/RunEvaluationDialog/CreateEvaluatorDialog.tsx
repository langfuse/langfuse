import { useState } from "react";
import { EvalTargetObject } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { EvaluatorSelector } from "@/src/features/evals/components/evaluator-selector";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { ChevronLeft } from "lucide-react";

type CreateEvaluatorDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateEvaluatorDialog(props: CreateEvaluatorDialogProps) {
  const { projectId, open, onOpenChange } = props;
  const [templateId, setTemplateId] = useState<string | null>(null);
  const utils = api.useUtils();

  const templatesQuery = api.evals.allTemplates.useQuery(
    {
      projectId,
      limit: 500,
      page: 0,
    },
    {
      enabled: open,
    },
  );

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setTemplateId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-screen-md pb-0">
        <DialogHeader>
          <DialogTitle>
            Create Evaluator for batched observation runs
          </DialogTitle>
          <DialogDescription>
            This form creates an evaluator for batched observation runs.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[72vh] overflow-y-auto pb-0 pr-1">
          {!templateId ? (
            <div className="space-y-4 px-1 pb-1">
              <p className="text-sm text-muted-foreground">
                Select an evaluator template to configure.
              </p>
              {templatesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading templates...
                </p>
              ) : templatesQuery.isError ? (
                <p className="text-sm text-destructive">
                  Failed to load templates: {templatesQuery.error.message}
                </p>
              ) : (
                <div className="max-h-[55vh] overflow-y-auto rounded-md border p-2">
                  <EvaluatorSelector
                    projectId={projectId}
                    evalTemplates={templatesQuery.data?.templates ?? []}
                    selectedTemplateId={undefined}
                    onTemplateSelect={(id) => setTemplateId(id)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="pb-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTemplateId(null)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to template selection
              </Button>
              <EvaluatorForm
                useDialog
                projectId={projectId}
                evalTemplates={templatesQuery.data?.templates ?? []}
                templateId={templateId}
                hideTargetSelection
                hidePreviewTable
                defaultRunOnLive={false}
                onFormSuccess={() => {
                  handleClose(false);
                  void utils.evals.jobConfigsByTarget.invalidate({
                    projectId,
                    targetObject: EvalTargetObject.EVENT,
                  });
                  showSuccessToast({
                    title: "Evaluator created",
                    description:
                      "Select it in the previous step to run it on selected observations.",
                  });
                }}
                preprocessFormValues={(values) => ({
                  ...values,
                  target: EvalTargetObject.EVENT,
                  timeScope: ["NEW"],
                  ...(values.runOnLive
                    ? {}
                    : {
                        filter: [],
                        sampling: 1,
                        delay: 0,
                      }),
                })}
              />
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
