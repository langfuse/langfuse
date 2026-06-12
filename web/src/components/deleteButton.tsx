import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { ExternalLinkIcon, LockIcon, TrashIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ProjectScope } from "@/src/features/rbac/constants/projectAccessRights";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

export type DeleteButtonProps = {
  itemId: string;
  projectId: string;
  isTableAction?: boolean;
  scope?: ProjectScope;
  invalidateFunc?: () => void;
  redirectUrl?: string;
  deleteConfirmation?: string;
  icon?: boolean;
  enabled?: boolean;
  variant?: ButtonProps["variant"];
  title?: string;
  className?: string;
};

type BaseDeleteButtonProps = Omit<DeleteButtonProps, "itemId"> & {
  variant?: ButtonProps["variant"];
  scope: NonNullable<DeleteButtonProps["scope"]>;
  invalidateFunc: NonNullable<DeleteButtonProps["invalidateFunc"]>;
  captureDeleteOpen: (
    capture: ReturnType<typeof usePostHogClientCapture>,
    isTableAction: boolean,
  ) => void;
  captureDeleteSuccess: (
    capture: ReturnType<typeof usePostHogClientCapture>,
    isTableAction: boolean,
  ) => void;
  entityToDeleteName: string;
  customDeletePrompt?: string;
  executeDeleteMutation: (onSuccess: () => void) => Promise<void>;
  isDeleteMutationLoading: boolean;
  itemId?: string;
  // when set, the popover explains why deletion is blocked instead of asking for confirmation
  deleteBlocker?: React.ReactNode;
  onPopoverOpenChange?: (open: boolean) => void;
};

export function DeleteButton({
  variant,
  itemId,
  projectId,
  isTableAction = false,
  scope,
  invalidateFunc,
  redirectUrl,
  deleteConfirmation,
  icon = false,
  enabled = true,
  title,
  className,
  captureDeleteOpen,
  captureDeleteSuccess,
  entityToDeleteName,
  executeDeleteMutation,
  isDeleteMutationLoading,
  customDeletePrompt,
  deleteBlocker,
  onPopoverOpenChange,
}: BaseDeleteButtonProps) {
  const [isDeleted, setIsDeleted] = useState(false);
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");

  const hasAccess = useHasProjectAccess({ projectId, scope: scope });

  const onDeleteSuccess = useMemo(() => {
    return () => {
      setIsDeleted(true);
      captureDeleteSuccess(capture, isTableAction);
      !isTableAction && redirectUrl
        ? router.push(redirectUrl)
        : invalidateFunc();
    };
  }, [
    isTableAction,
    redirectUrl,
    invalidateFunc,
    router,
    captureDeleteSuccess,
    capture,
  ]);

  return (
    <Popover key={itemId ?? "delete-action"} onOpenChange={onPopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant={variant ?? (icon ? "outline-solid" : "ghost")}
          size={icon ? "icon" : "default"}
          title={title}
          className={className}
          disabled={!hasAccess || !enabled}
          onClick={(e) => {
            e.stopPropagation();
            captureDeleteOpen(capture, isTableAction);
          }}
        >
          {icon ? (
            <TrashIcon className="h-4 w-4" />
          ) : (
            <>
              {hasAccess ? (
                <TrashIcon className="mr-2 h-4 w-4" />
              ) : (
                <LockIcon className="mr-2 h-4 w-4" />
              )}
              Delete
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent onClick={(e) => e.stopPropagation()}>
        {deleteBlocker ?? (
          <>
            <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
            <p className="mb-3 max-w-72 text-sm">
              {customDeletePrompt ??
                `This action cannot be undone. It removes all the data associated with
            this ${entityToDeleteName}. If this is the project default, it will be deleted for all users.`}
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
              <Button
                type="button"
                variant="destructive"
                loading={isDeleteMutationLoading || isDeleted}
                onClick={() => {
                  if (
                    deleteConfirmation &&
                    deleteConfirmationInput !== deleteConfirmation
                  ) {
                    alert("Please type the correct confirmation");
                    return;
                  }
                  executeDeleteMutation(onDeleteSuccess);
                }}
              >
                Delete {entityToDeleteName}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function DeleteTraceButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "traces:delete",
    invalidateFunc = () => utils.traces.all.invalidate(),
  } = props;
  const traceMutation = api.traces.deleteMany.useMutation();
  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await traceMutation.mutateAsync({
        traceIds: [itemId],
        projectId,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    showSuccessToast({
      title: "Trace deleted",
      description:
        "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 24 hours.",
    });
    onSuccess();
  };
  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");
  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("trace:delete_form_open", {
          source: isTableAction ? "table-single-row" : "trace detail",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("trace:delete", {
          source: isTableAction ? "table-single-row" : "trace",
        })
      }
      entityToDeleteName="trace"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={traceMutation.isPending}
      enabled={hasTraceDeletionEntitlement}
    />
  );
}

export function DeleteDatasetButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "datasets:CUD",
    invalidateFunc = () => utils.datasets.invalidate(),
  } = props;
  const datasetMutation = api.datasets.deleteDataset.useMutation();
  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await datasetMutation.mutateAsync({
        datasetId: itemId,
        projectId,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    onSuccess();
  };
  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("datasets:delete_form_open", {
          source: isTableAction ? "table-single-row" : "dataset",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("datasets:delete_dataset_button_click", {
          source: isTableAction ? "table-single-row" : "dataset",
        })
      }
      entityToDeleteName="dataset"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={datasetMutation.isPending}
    />
  );
}

export function DeleteDashboardButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "dashboards:CUD",
    invalidateFunc = () => utils.dashboard.invalidate(),
  } = props;
  const dashboardMutation = api.dashboard.delete.useMutation();
  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await dashboardMutation.mutateAsync({
        dashboardId: itemId,
        projectId,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    showSuccessToast({
      title: "Dashboard deleted",
      description: "The dashboard has been deleted successfully",
    });
    onSuccess();
  };

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture) =>
        capture("dashboard:delete_dashboard_form_open")
      }
      captureDeleteSuccess={(capture) =>
        capture("dashboard:delete_dashboard_button_click")
      }
      entityToDeleteName="dashboard"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={dashboardMutation.isPending}
    />
  );
}

/** DeleteMonitorButton deletes a monitor through the shared confirm-then-delete pattern. */
export function DeleteMonitorButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "monitors:CUD",
    invalidateFunc = () => utils.monitors.invalidate(),
  } = props;
  const monitorMutation = api.monitors.delete.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Monitor deleted",
        description: "The monitor has been deleted successfully",
      });
      utils.monitors.invalidate();
    },
  });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await monitorMutation.mutateAsync({ id: itemId, projectId });
    } catch (error) {
      return Promise.reject(error);
    }
    onSuccess();
  };

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("monitors:delete_form_open", {
          source: isTableAction ? "table-single-row" : "monitor",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("monitors:delete_monitor_button_click", {
          source: isTableAction ? "table-single-row" : "monitor",
        })
      }
      entityToDeleteName="monitor"
      customDeletePrompt="This action cannot be undone. It stops all evaluations and removes the monitor's alert history."
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={monitorMutation.isPending}
    />
  );
}

export function DeleteEvalConfigButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "evalJob:CUD",
    invalidateFunc = () => utils.evals.invalidate(),
  } = props;

  const evaluatorMutation = api.evals.deleteEvalJob.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Running evaluator deleted",
        description: "The running evaluator has been deleted successfully",
      });
      utils.evals.invalidate();
    },
  });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await evaluatorMutation.mutateAsync({
        evalConfigId: itemId,
        projectId,
      });
      onSuccess();
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("eval_config:delete_form_open", {
          source: isTableAction ? "table-single-row" : "eval config detail",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("eval_config:delete_evaluator_button_click", {
          source: isTableAction ? "table-single-row" : "eval config detail",
        })
      }
      customDeletePrompt="This action cannot be undone and removes all logs associated with this running evaluator. Scores produced by this evaluator will not be deleted."
      entityToDeleteName="running evaluator"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={evaluatorMutation.isPending}
    />
  );
}

export function DeleteEvaluationModelButton(
  props: Omit<DeleteButtonProps, "itemId">,
) {
  const utils = api.useUtils();
  const {
    projectId,
    scope = "evalDefaultModel:CUD",
    invalidateFunc = () => utils.defaultLlmModel.invalidate(),
  } = props;

  const { mutateAsync: deleteDefaultModel, isPending } =
    api.defaultLlmModel.deleteDefaultModel.useMutation({
      onSuccess: () => {
        showSuccessToast({
          title: "Default evaluation model deleted",
          description:
            "The default evaluation model has been deleted. Any running evaluations relying on the default model will be inactivated. Queued jobs will fail.",
        });
        utils.defaultLlmModel.fetchDefaultModel.invalidate({ projectId });
      },
    });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await deleteDefaultModel({
        projectId,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    onSuccess();
  };

  return (
    <DeleteButton
      {...props}
      variant="outline"
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("eval_config:delete_form_open", {
          source: isTableAction ? "table-single-row" : "evaluator",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("eval_config:delete_evaluator_button_click", {
          source: isTableAction ? "table-single-row" : "evaluator",
        })
      }
      entityToDeleteName="default evaluation model"
      customDeletePrompt="Deleting this model might cause running evaluators to fail. Please make sure you have no running evaluators relying on this model."
      deleteConfirmation="delete"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={isPending}
    />
  );
}

export function DeleteEvalTemplateButton(
  props: DeleteButtonProps & {
    // usage count from already-loaded table data; lets the blocked state
    // render instantly while the usage query is in flight
    initialUsageCount?: number;
    // the template name; doubles as the type-to-confirm string
    deleteConfirmation: string;
  },
) {
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

  // only fetch usage once the user actually opens the delete popover; once
  // the delete starts the query must go inactive, otherwise the post-delete
  // cache invalidation refetches it and surfaces a NOT_FOUND. Gating on
  // isPending (not just isSuccess) matters: the mutation's onSuccess — and
  // its invalidate — runs before the success state is dispatched, so the
  // query must already be disabled by then.
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
      // surfaced via the mutation's onError toast (e.g. evaluator still in use)
    }
  };

  const renderEvaluatorLink = (evaluator: {
    id: string;
    scoreName: string;
  }) => (
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
        <h2 className="text-md mb-3 font-semibold">Cannot delete</h2>
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
