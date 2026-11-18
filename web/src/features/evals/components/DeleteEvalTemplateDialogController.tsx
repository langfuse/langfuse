import { ExternalLinkIcon } from "@langfuse/icons";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

type ReferencingEvaluator = {
  id: string;
  scoreName: string;
};

const EvaluatorLink = ({
  projectId,
  evaluator,
}: {
  projectId: string;
  evaluator: ReferencingEvaluator;
}) => (
  <Link
    href={`/project/${projectId}/evals/legacy?peek=${evaluator.id}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
  >
    {evaluator.scoreName}
    <ExternalLinkIcon size="sm" />
  </Link>
);

type TemplateSelection = {
  templateId: string;
  templateName: string;
  initialUsageCount?: number;
};

export function DeleteEvalTemplateDialogController({
  projectId,
  children,
  onSuccess,
}: {
  projectId: string;
  children: (control: {
    openDialog: (selection: TemplateSelection) => void;
  }) => ReactNode;
  // Called after successful deletion; the caller owns follow-up side effects
  // like analytics, redirects, or extra cache invalidation.
  onSuccess?: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <DialogController<TemplateSelection>
      onBeforeClose={() => !isDeleting}
      renderDialog={({
        state: { templateId, templateName, initialUsageCount },
        isOpen,
        closeDialog,
      }) => (
        <ConnectedDeleteEvalTemplateDialogContent
          projectId={projectId}
          templateId={templateId}
          templateName={templateName}
          open={isOpen}
          initialUsageCount={initialUsageCount}
          onDeletingChange={setIsDeleting}
          onSuccess={() => {
            closeDialog();
            onSuccess?.();
          }}
        />
      )}
    >
      {children}
    </DialogController>
  );
}

function ConnectedDeleteEvalTemplateDialogContent({
  projectId,
  templateId,
  templateName,
  open,
  initialUsageCount,
  onDeletingChange,
  onSuccess,
}: {
  projectId: string;
  templateId: string;
  templateName: string;
  open: boolean;
  initialUsageCount?: number;
  onDeletingChange: (deleting: boolean) => void;
  onSuccess: () => void;
}) {
  const utils = api.useUtils();
  const templateMutation = api.evals.deleteEvalTemplate.useMutation({
    onError: (error) =>
      showErrorToast(
        "Failed to delete evaluator",
        error.message,
        classifyTrpcToastError(error, "evaluator.delete"),
      ),
  });
  const loading = templateMutation.isPending;
  const [confirmationInput, setConfirmationInput] = useState("");
  // Do not refetch usage after deletion while invalidating evaluator queries.
  const usage = api.evals.evalTemplateUsage.useQuery(
    { projectId, evalTemplateId: templateId },
    {
      enabled: open && !loading && !templateMutation.isSuccess,
    },
  );
  const referencingEvaluators = usage.data;
  const usageCount = referencingEvaluators?.length ?? initialUsageCount ?? 0;
  const isBlocked = usageCount > 0;

  return (
    <Dialog
      closeOnInteractionOutside
      size="md"
      title={isBlocked ? "Cannot delete" : "Please confirm"}
      actions={[
        {
          label: "Delete evaluator",
          variant: "destructive",
          loading,
          disabled: isBlocked || confirmationInput !== templateName,
          onClick: async () => {
            if (loading) return;
            onDeletingChange(true);
            try {
              await templateMutation.mutateAsync({
                evalTemplateId: templateId,
                projectId,
              });
            } catch {
              return;
            } finally {
              onDeletingChange(false);
            }
            showSuccessToast({
              operation: "evaluator.delete",
              title: "Evaluator deleted",
              description: `Evaluator "${templateName}" was deleted.`,
            });
            utils.evals.invalidate();
            onSuccess();
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground">
          {isBlocked
            ? `This evaluator is used by ${usageCount} running evaluator${usageCount === 1 ? "" : "s"}. Delete those running evaluators first.`
            : "This action cannot be undone. It permanently deletes all versions of this evaluator. Scores already produced by it will not be deleted."}
        </p>
        {isBlocked && referencingEvaluators?.length ? (
          <ul className="max-h-40 list-inside list-disc overflow-y-auto text-sm">
            {referencingEvaluators.map((evaluator) => (
              <li key={evaluator.id}>
                <EvaluatorLink projectId={projectId} evaluator={evaluator} />
              </li>
            ))}
          </ul>
        ) : null}
        {!isBlocked ? (
          <div className="grid w-full gap-1.5">
            <Label htmlFor="delete-evaluator-confirmation">
              Type &quot;{templateName}&quot; to confirm
            </Label>
            <Input
              id="delete-evaluator-confirmation"
              value={confirmationInput}
              disabled={loading}
              onChange={(e) => setConfirmationInput(e.target.value)}
            />
          </div>
        ) : null}
      </Dialog.Body>
    </Dialog>
  );
}
