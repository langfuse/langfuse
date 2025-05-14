import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import { EvaluatorSelector } from "./EvaluatorSelector";
import { EvalTemplateForm } from "./template-form";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

interface SelectEvaluatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelectEvaluator: (templateId: string) => void;
}

export function SelectEvaluatorDialog({
  open,
  onOpenChange,
  projectId,
  onSelectEvaluator,
}: SelectEvaluatorDialogProps) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);

  // Fetch templates
  const templates = api.evals.allTemplates.useQuery(
    {
      projectId,
    },
    {
      enabled: Boolean(projectId) && open,
    },
  );

  const utils = api.useUtils();

  const handleOpenCreateEvaluator = () => {
    setIsCreateTemplateOpen(true);
  };

  const handleSelectEvaluator = () => {
    if (selectedTemplateId) {
      onSelectEvaluator(selectedTemplateId);
      onOpenChange(false);
      router.push(
        `/project/${projectId}/evals/new?evaluator=${selectedTemplateId}`,
      );
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Select evaluator</DialogTitle>
          </DialogHeader>

          <div className="mt-2">
            {templates.isLoading ? (
              <div className="py-8 text-center">Loading evaluators...</div>
            ) : templates.isError ? (
              <div className="py-8 text-center text-destructive">
                Error: {templates.error.message}
              </div>
            ) : templates.data?.templates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No evaluators found. Create a new evaluator to get started.
              </div>
            ) : (
              <div>
                <EvaluatorSelector
                  evalTemplates={templates.data?.templates || []}
                  selectedTemplateId={selectedTemplateId || undefined}
                  onTemplateSelect={(templateId) =>
                    handleTemplateSelect(templateId)
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <div className="flex justify-end gap-2">
              <Button onClick={handleOpenCreateEvaluator} variant="outline">
                <PlusIcon className="mr-2 h-4 w-4" />
                Create Custom Evaluator
              </Button>
              <Button
                onClick={handleSelectEvaluator}
                disabled={!selectedTemplateId}
              >
                Use Selected Evaluator
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
          <DialogTitle>Create new evaluator</DialogTitle>
          <EvalTemplateForm
            projectId={projectId}
            preventRedirect={true}
            isEditing={true}
            onFormSuccess={(newTemplate) => {
              setIsCreateTemplateOpen(false);
              void utils.evals.allTemplates.invalidate();
              if (newTemplate) {
                setSelectedTemplateId(newTemplate.id);
              }
              showSuccessToast({
                title: "Evaluator created successfully",
                description: "You can now use this evaluator.",
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
