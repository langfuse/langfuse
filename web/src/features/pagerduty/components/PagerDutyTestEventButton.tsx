import { Send } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { PagerDutyTestEventDialogController } from "@/src/features/pagerduty/components/PagerDutyTestEventDialogController";
import { useHasProjectAccess } from "@/src/features/rbac";

/** PagerDutyTestEventButton sends a test event to the selected routing key. */
export function PagerDutyTestEventButton({
  projectId,
  pagerDutyIntegrationId,
  disabled = false,
}: {
  projectId: string;
  pagerDutyIntegrationId: string | undefined;
  disabled?: boolean;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  return (
    <PagerDutyTestEventDialogController projectId={projectId}>
      {({ openDialog }) => (
        <Button
          type="button"
          text="Send test event"
          variant="secondary"
          size="sm"
          icon={Send}
          disabled={disabled || !hasAccess || !pagerDutyIntegrationId}
          onClick={() => {
            if (pagerDutyIntegrationId) openDialog(pagerDutyIntegrationId);
          }}
        />
      )}
    </PagerDutyTestEventDialogController>
  );
}
