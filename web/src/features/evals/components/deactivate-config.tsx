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
import { Switch } from "@/src/components/ui/switch";

export function DeactivateEvalConfig({
  projectId,
  evalConfig,
}: {
  projectId: string;
  evalConfig: RouterOutputs["evals"]["configById"];
}) {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const isActive = evalConfig?.status === EvaluatorStatus.ACTIVE;

  const mutEvaluator = api.evals.updateEvalJob.useMutation({
    onSuccess: () => {
      void utils.evals.invalidate();
    },
  });

  const onClick = () => {
    if (!projectId) {
      console.error("Project ID is missing");
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
              (evalConfig?.timeScope?.length === 1 &&
                evalConfig.timeScope[0] === "EXISTING")
            }
            checked={isActive}
            className={isActive ? "data-[state=checked]:bg-dark-green" : ""}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent>
        <h2 className="text-md mb-3 font-semibold">Please confirm</h2>
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
            loading={mutEvaluator.isLoading}
            onClick={onClick}
          >
            {evalConfig?.status === "ACTIVE" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
