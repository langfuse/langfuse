import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api, type RouterOutputs } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";

type Rule = RouterOutputs["evalsV2"]["rules"]["list"]["rules"][number];

export function RuleActiveSwitchCell({
  rule,
  projectId,
  hasWriteAccess,
}: {
  rule: Rule;
  projectId: string;
  hasWriteAccess: boolean;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const setEnabled = api.evalsV2.rules.setEnabled.useMutation({
    onError: trpcErrorToast,
    onSuccess: async (_result, variables) => {
      capture("evaluation_rules:status_change", {
        isEnabled: variables.enabled,
        ruleCount: 1,
      });
      await utils.evalsV2.rules.list.invalidate({ projectId });
    },
  });
  const onStatusChange = async (enabled: boolean) => {
    await setEnabled.mutateAsync({
      projectId,
      ruleId: rule.id,
      enabled,
    });
  };
  const isLegacy = isLegacyEvalTarget(rule.targetObject);
  const legacyDisabledReason =
    isLegacy && !rule.enabled
      ? "Legacy rules cannot be re-enabled because trace- and dataset-level evaluations are deprecated. Create an observation-based rule instead."
      : null;

  const switchControl = (
    <Switch
      color="green"
      checked={rule.enabled}
      disabled={
        !hasWriteAccess || Boolean(legacyDisabledReason) || setEnabled.isPending
      }
      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
      onCheckedChange={(enabled) => {
        if (!hasWriteAccess) return;
        onStatusChange(enabled).catch(() => undefined);
      }}
    />
  );

  return (
    <div onClick={(event) => event.stopPropagation()}>
      {legacyDisabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-not-allowed [&>button]:pointer-events-none">
              {switchControl}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {legacyDisabledReason}
          </TooltipContent>
        </Tooltip>
      ) : (
        switchControl
      )}
    </div>
  );
}
