import { Send } from "@langfuse/icons";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { Button } from "@/src/components/design-system/Button/Button";
import { PagerDutyTestEventDialogController } from "./PagerDutyTestEventDialogController";
import { useHasProjectAccess } from "@/src/features/rbac";

/** PagerDutyTestEventButton sends a test event to the typed routing key, or to the stored key of the action. */
export function PagerDutyTestEventButton({
  projectId,
  region,
  routingKey,
  actionId,
  disabled = false,
}: {
  projectId: string;
  region: PagerDutyRegion;
  routingKey: string | undefined;
  actionId: string | undefined;
  disabled?: boolean;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const hasKey = Boolean(routingKey || actionId);

  return (
    <PagerDutyTestEventDialogController projectId={projectId}>
      {({ openDialog }) => (
        <Button
          type="button"
          text="Send test event"
          variant="secondary"
          size="sm"
          icon={Send}
          disabled={disabled || !hasAccess || !hasKey}
          onClick={() => openDialog({ region, routingKey, actionId })}
        />
      )}
    </PagerDutyTestEventDialogController>
  );
}
