import {
  DeleteButton,
  type DeleteButtonProps,
} from "@/src/components/deleteButton";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type ReferencingEvaluator = {
  id: string;
  scoreName: string;
};

type DeleteEvalTemplateButtonProps = DeleteButtonProps & {
  // Usage count from already-loaded table data; lets the blocked state render
  // instantly while the usage query is in flight.
  initialUsageCount?: number;
  // The template name; doubles as the type-to-confirm string.
  deleteConfirmation: string;
};

export function DeleteEvalTemplateButton(props: DeleteEvalTemplateButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "evalTemplate:CUD",
    invalidateFunc = () => utils.evals.invalidate(),
    initialUsageCount,
    deleteConfirmation: templateName,
  } = props;

  const templateMutation = api.evals.deleteEvalTemplate.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Evaluator deleted",
        description: `Evaluator "${templateName}" was deleted.`,
      });
      utils.evals.invalidate();
    },
    onError: (error) =>
      showErrorToast("Failed to delete evaluator", error.message),
  });

  // Only fetch usage once the user actually opens the delete popover. Once
  // deletion starts, the query must go inactive so post-delete invalidation
  // does not refetch it and surface a NOT_FOUND.
  const [hasOpenedPopover, setHasOpenedPopover] = useState(false);
  const usage = api.evals.evalTemplateUsage.useQuery(
    { projectId, evalTemplateId: itemId },
    {
      enabled:
        hasOpenedPopover &&
        !templateMutation.isPending &&
        !templateMutation.isSuccess,
    },
  );
  const referencingEvaluators = usage.data;
  const usageCount = referencingEvaluators?.length ?? initialUsageCount ?? 0;

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await templateMutation.mutateAsync({
        evalTemplateId: itemId,
        projectId,
      });
      onSuccess();
    } catch {
      // Surfaced via the mutation's onError toast.
    }
  };

  const renderEvaluatorLink = (evaluator: ReferencingEvaluator) => (
    <Link
      href={`/project/${projectId}/evals?peek=${evaluator.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
    >
      {evaluator.scoreName}
      <ExternalLinkIcon className="h-3 w-3" />
    </Link>
  );

  const deleteBlocker =
    usageCount > 0 ? (
      <>
        <h2 className="mb-3 font-semibold">Cannot delete</h2>
        <p className="mb-3 max-w-72 text-sm">
          This evaluator is used by {usageCount} running evaluator
          {usageCount === 1 ? "" : "s"}. Delete those running evaluators first.
        </p>
        {referencingEvaluators && referencingEvaluators.length > 0 ? (
          referencingEvaluators.length === 1 ? (
            <div className="max-w-72 text-sm">
              {renderEvaluatorLink(referencingEvaluators[0])}
            </div>
          ) : (
            <ul className="max-h-40 max-w-72 list-inside list-disc overflow-y-auto text-sm">
              {referencingEvaluators.map((evaluator) => (
                <li key={evaluator.id}>{renderEvaluatorLink(evaluator)}</li>
              ))}
            </ul>
          )
        ) : null}
      </>
    ) : undefined;

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("eval_templates:delete_form_open", {
          source: isTableAction ? "table-single-row" : "template",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("eval_templates:delete_template_button_click", {
          source: isTableAction ? "table-single-row" : "template",
        })
      }
      entityToDeleteName="evaluator"
      customDeletePrompt="This action cannot be undone. It permanently deletes all versions of this evaluator. Scores already produced by it will not be deleted."
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={templateMutation.isPending}
      deleteBlocker={deleteBlocker}
      onPopoverOpenChange={(open) => {
        if (open) setHasOpenedPopover(true);
      }}
    />
  );
}
