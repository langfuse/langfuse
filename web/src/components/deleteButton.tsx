import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { TrashIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

interface DeleteButtonProps {
  itemId: string;
  projectId: string;
  isTableAction?: boolean;
  scope: ProjectScope;
  invalidateFunc: () => void;
  type: "trace" | "dataset" | "evaluator" | "template";
  redirectUrl?: string;
  deleteConfirmation?: string;
  icon?: boolean;
  enabled?: boolean;
}

export function DeleteButton({
  itemId,
  projectId,
  isTableAction = false,
  scope,
  invalidateFunc,
  type,
  redirectUrl,
  deleteConfirmation,
  icon = false,
  enabled = true,
}: DeleteButtonProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");

  const hasAccess = useHasProjectAccess({ projectId, scope: scope });

  const onDeleteSuccess = useMemo(() => {
    return () => {
      setIsDeleted(true);
      !isTableAction && redirectUrl
        ? void router.push(redirectUrl)
        : invalidateFunc();
    };
  }, [isTableAction, redirectUrl, invalidateFunc, router]);

  const traceMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Trace deleted",
        description:
          "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
      onDeleteSuccess();
    },
  });
  const datasetMutation = api.datasets.deleteDataset.useMutation({
    onSuccess: onDeleteSuccess,
  });
  const evaluatorMutation = api.evals.deleteEvalJob.useMutation({
    onSuccess: onDeleteSuccess,
  });
  const templateMutation = api.evals.deleteEvalTemplate.useMutation({
    onSuccess: onDeleteSuccess,
  });

  return (
    <Popover key={itemId}>
      <PopoverTrigger asChild>
        <Button
          variant={icon ? "outline" : "ghost"}
          size={icon ? "icon" : "default"}
          disabled={!hasAccess || !enabled}
          onClick={(e) => {
            e.stopPropagation();
            type === "trace"
              ? capture("trace:delete_form_open", {
                  source: isTableAction ? "table-single-row" : "trace detail",
                })
              : type === "dataset"
                ? capture("datasets:delete_form_open", {
                    source: "dataset",
                  })
                : type === "template"
                  ? capture("eval_templates:delete_form_open", {
                      source: "template detail",
                    })
                  : capture("eval_config:delete_form_open", {
                      source: "evaluator detail",
                    });
          }}
        >
          {icon ? (
            <TrashIcon className="h-4 w-4" />
          ) : (
            <>
              <TrashIcon className="mr-2 h-4 w-4" />
              Delete
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent onClick={(e) => e.stopPropagation()}>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
        <p className="mb-3 text-sm">
          This action cannot be undone and removes all the data associated with
          this {type}.
        </p>
        {deleteConfirmation && (
          <div className="mb-4 grid w-full gap-1.5">
            <Label htmlFor="delete-confirmation">
              Type &quot;{deleteConfirmation}&quot; to confirm
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
            />
          </div>
        )}
        <div className="flex justify-end space-x-4">
          {type === "trace" ? (
            <Button
              type="button"
              variant="destructive"
              loading={traceMutation.isLoading || isDeleted}
              onClick={() => {
                if (
                  deleteConfirmation &&
                  deleteConfirmationInput !== deleteConfirmation
                ) {
                  alert("Please type the correct confirmation");
                  return;
                }
                void traceMutation.mutateAsync({
                  traceIds: [itemId],
                  projectId,
                });
                capture("trace:delete", {
                  source: isTableAction ? "table-single-row" : "trace",
                });
              }}
            >
              Delete trace
            </Button>
          ) : type === "dataset" ? (
            <Button
              type="button"
              variant="destructive"
              loading={datasetMutation.isLoading || isDeleted}
              onClick={() => {
                if (
                  deleteConfirmation &&
                  deleteConfirmationInput !== deleteConfirmation
                ) {
                  alert("Please type the correct confirmation");
                  return;
                }
                void datasetMutation.mutateAsync({
                  projectId,
                  datasetId: itemId,
                });
                capture("datasets:delete_dataset_button_click", {
                  source: isTableAction ? "table-single-row" : "dataset",
                });
              }}
            >
              Delete dataset
            </Button>
          ) : type === "evaluator" ? (
            <Button
              type="button"
              variant="destructive"
              loading={evaluatorMutation.isLoading || isDeleted}
              onClick={() => {
                if (
                  deleteConfirmation &&
                  deleteConfirmationInput !== deleteConfirmation
                ) {
                  alert("Please type the correct confirmation");
                  return;
                }
                void evaluatorMutation.mutateAsync({
                  projectId,
                  evalConfigId: itemId,
                });
                capture("eval_config:delete_evaluator_button_click", {
                  source: "evaluator detail",
                });
              }}
            >
              Delete evaluator
            </Button>
          ) : type === "template" ? (
            <Button
              type="button"
              variant="destructive"
              loading={templateMutation.isLoading || isDeleted}
              onClick={() => {
                if (
                  deleteConfirmation &&
                  deleteConfirmationInput !== deleteConfirmation
                ) {
                  alert("Please type the correct confirmation");
                  return;
                }
                void templateMutation.mutateAsync({
                  projectId,
                  evalTemplateId: itemId,
                });
                capture("eval_templates:delete_template_button_click", {
                  source: "template detail",
                });
              }}
            >
              Delete template
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
