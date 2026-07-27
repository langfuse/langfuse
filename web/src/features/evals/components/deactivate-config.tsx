import { EvaluatorStatus } from "@/src/features/evals/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";

export function DeactivateEvalConfig({
  projectId,
  evalConfig,
}: {
  projectId: string;
  evalConfig: RouterOutputs["evals"]["configById"];
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  const { allowLegacy } = useEvalCapabilities(projectId);
  const [isOpen, setIsOpen] = useState(false);
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

  const onClick = () => {
    if (!projectId) {
      console.error("Project ID is missing");
      return;
    }
    // The popover trigger wraps the switch, so guard the action itself too.
    if (reactivationBlocked) {
      setIsOpen(false);
      return;
    }

    const prevStatus = evalConfig?.status;

    mutEvaluator.mutateAsync({
      projectId,
      evalConfigId: evalConfig?.id ?? "",
      config: {
        status: isActive ? EvaluatorStatus.INACTIVE : EvaluatorStatus.ACTIVE,
      },
    });
    capture(
      prevStatus === EvaluatorStatus.ACTIVE
        ? "eval_config:deactivate"
        : "eval_config:activate",
    );
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}>
      <PopoverTrigger asChild>
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
            {...(reactivationBlocked && {
              title:
                "Deprecated evaluators cannot be reactivated. Migrate to the new evaluators instead.",
            })}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="mb-3 font-bold">Please confirm</h2>
        <p className="mb-3 text-sm">
          {evalConfig?.status === "ACTIVE"
            ? "This action will deactivate the evaluator. No more traces will be evaluated based on this evaluator."
            : "This action will activate the evaluator. New traces will be evaluated based on this evaluator."}
        </p>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant={
              evalConfig?.status === "ACTIVE" ? "destructive" : "default"
            }
            loading={mutEvaluator.isPending}
            onClick={onClick}
          >
            {evalConfig?.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
