import { useState } from "react";
import { CircleCheck, Send } from "@langfuse/icons";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { Button } from "@/src/components/design-system/Button/Button";
import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  PagerDutyTestEventDialogController,
  type PagerDutyTestEventTarget,
} from "./PagerDutyTestEventDialogController";

/** PagerDutyTestEventButtons triggers a critical test alert, then offers to resolve it. */
export function PagerDutyTestEventButtons({
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
  const [isTestAlertOpen, setIsTestAlertOpen] = useState(false);
  const isDisabled = disabled || !hasAccess || !(routingKey || actionId);
  const target = { region, routingKey, actionId };

  return (
    <PagerDutyTestEventDialogController
      projectId={projectId}
      onSent={() => setIsTestAlertOpen(true)}
    >
      {({ openDialog }) => (
        <TestEventButton
          projectId={projectId}
          target={target}
          disabled={isDisabled}
          isTestAlertOpen={isTestAlertOpen}
          onSend={() => openDialog(target)}
          onResolved={() => setIsTestAlertOpen(false)}
        />
      )}
    </PagerDutyTestEventDialogController>
  );
}

/** TestEventButton shows the send button, or the resolve button while the test alert is open. */
function TestEventButton({
  projectId,
  target,
  disabled,
  isTestAlertOpen,
  onSend,
  onResolved,
}: {
  projectId: string;
  target: PagerDutyTestEventTarget;
  disabled: boolean;
  isTestAlertOpen: boolean;
  onSend: () => void;
  onResolved: () => void;
}) {
  if (isTestAlertOpen) {
    return (
      <ResolveTestEventButton
        projectId={projectId}
        target={target}
        disabled={disabled}
        onResolved={onResolved}
      />
    );
  }
  return (
    <Button
      type="button"
      text="Send test event"
      variant="secondary"
      size="sm"
      icon={Send}
      disabled={disabled}
      onClick={onSend}
    />
  );
}

/** ResolveTestEventButton resolves the open test alert. */
function ResolveTestEventButton({
  projectId,
  target,
  disabled,
  onResolved,
}: {
  projectId: string;
  target: PagerDutyTestEventTarget;
  disabled: boolean;
  onResolved: () => void;
}) {
  const resolveTestEvent = useResolveTestEvent(onResolved);

  return (
    <Button
      type="button"
      text="Resolve test event"
      variant="secondary"
      size="sm"
      icon={CircleCheck}
      disabled={disabled || resolveTestEvent.isPending}
      onClick={() =>
        resolveTestEvent.mutate({ projectId, ...target, step: "resolve" })
      }
    />
  );
}

/** useResolveTestEvent resolves the test alert and reports it. */
function useResolveTestEvent(onResolved: () => void) {
  return api.automations.sendPagerDutyTestEvent.useMutation({
    onSuccess: () => {
      onResolved();
      showSuccessToast({
        operation: "automations.sendPagerDutyTestEvent",
        title: "Test event resolved",
        description: "PagerDuty accepted the resolve of the test alert.",
      });
    },
  });
}
