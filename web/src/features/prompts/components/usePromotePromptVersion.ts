import { useRef } from "react";
import { PRODUCTION_LABEL } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showSuccessToast } from "@/src/features/notifications";
import { labelsWithProduction } from "@/src/features/prompts/utils";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export function usePromotePromptVersion({
  projectId,
  promptId,
  labels,
  version,
}: {
  projectId: string;
  promptId: string;
  labels: readonly string[];
  version: number;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const inFlight = useRef(false);
  const isProduction = labels.includes(PRODUCTION_LABEL);

  const mutation = api.prompts.setLabels.useMutation();

  const promote = () => {
    if (!hasAccess || isProduction || inFlight.current) return;

    inFlight.current = true;
    mutation.mutate(
      {
        projectId,
        promptId,
        labels: labelsWithProduction(labels),
      },
      {
        onSuccess: () => {
          utils.prompts.invalidate();
          capture("prompt_detail:promote_to_production", { version });
          showSuccessToast({
            operation: "prompts.setLabels",
            title: "Promoted to production",
            description: `Version #${version} is now served by default.`,
          });
        },
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  return {
    promote,
    isPending: mutation.isPending,
    hasAccess,
  };
}
