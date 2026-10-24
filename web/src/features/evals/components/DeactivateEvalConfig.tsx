/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { useHasProjectAccess } from "@/src/features/rbac";
import { EvaluatorStatus } from "@/src/features/evals/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";

export function DeactivateEvalConfig({
  projectId,
  evalConfig,
  onStatusChange,
}: {
  projectId: string;
  evalConfig: RouterOutputs["evals"]["configById"];
  /** Called when the user confirms an activate/deactivate toggle. */
  onStatusChange?: () => void;
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });
  const { allowLegacy } = useEvalCapabilities(projectId);
  const capture = usePostHogClientCapture();
  const isActive = evalConfig?.status === EvaluatorStatus.ACTIVE;
  // Where new legacy setups are not allowed (cloud), deactivating a legacy
  // evaluator is a one-way door: reactivating it would amount to setting up
  // a legacy eval again.
  const reactivationBlocked =
    !isActive &&
    isLegacyEvalTarget(evalConfig?.targetObject ?? "") &&
    !allowLegacy;

  const mutEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: () => {
      utils.evals.invalidate();
    },
  });

  const onConfirm = async () => {
    if (!projectId) {
      console.error("Project ID is missing");
      return;
    }
    if (reactivationBlocked) {
      return;
    }

    const prevStatus = evalConfig?.status;

    try {
      await mutEvaluator.mutateAsync({
        projectId,
        evalConfigId: evalConfig?.id ?? "",
        config: {
          status: isActive ? EvaluatorStatus.INACTIVE : EvaluatorStatus.ACTIVE,
        },
      });
    } catch (error) {
      // The default mutation error toast reports the failure; the status is
      // unchanged, so keep the dialog open and skip the change callbacks.
      throw error;
    }
    capture(
      prevStatus === EvaluatorStatus.ACTIVE
        ? "eval_config:deactivate"
        : "eval_config:activate",
    );
    onStatusChange?.();
  };

  return (
    <ConfirmationDialogController
      title={isActive ? "Deactivate evaluator?" : "Activate evaluator?"}
      text={
        isActive
          ? "This action will deactivate the evaluator. No more traces will be evaluated based on this evaluator."
          : "This action will activate the evaluator. New traces will be evaluated based on this evaluator."
      }
      confirmLabel={isActive ? "Deactivate" : "Activate"}
      variant={isActive ? "destructive" : "default"}
      loading={mutEvaluator.isPending}
      onConfirm={onConfirm}
    >
      {({ openDialog }) => (
        <div className="flex items-center">
          <Switch
            disabled={
              !hasAccess ||
              reactivationBlocked ||
              (evalConfig?.timeScope?.length === 1 &&
                evalConfig.timeScope[0] === "EXISTING")
            }
            checked={isActive}
            color="green"
            onClick={openDialog}
            {...(reactivationBlocked && {
              title:
                "Deprecated evaluators cannot be reactivated. Migrate to the new evaluators instead.",
            })}
          />
        </div>
      )}
    </ConfirmationDialogController>
  );
}
