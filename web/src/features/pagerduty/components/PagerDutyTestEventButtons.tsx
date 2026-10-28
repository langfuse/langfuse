/* eslint-disable @typescript-eslint/no-use-before-define */
import { useState } from "react";
import { ArrowUp, CircleCheck, Send } from "@langfuse/icons";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { Button } from "@/src/components/design-system/Button/Button";
import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import {
  PagerDutyTestEventDialogController,
  type PagerDutyTestTriggerTarget,
} from "./PagerDutyTestEventDialogController";

/** PagerDutyTestEventButtons opens an info test alert, then offers to escalate it to critical or resolve it. */
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
        <TestEventSteps
          projectId={projectId}
          isTestAlertOpen={isTestAlertOpen}
          disabled={isDisabled}
          onTrigger={(step) => openDialog({ ...target, step })}
          onResolve={() => setIsTestAlertOpen(false)}
          target={target}
        />
      )}
    </PagerDutyTestEventDialogController>
  );
}

/** TestEventSteps shows the send button, or the escalate and resolve buttons once the test alert is open. */
function TestEventSteps({
  projectId,
  isTestAlertOpen,
  disabled,
  onTrigger,
  onResolve,
  target,
}: {
  projectId: string;
  isTestAlertOpen: boolean;
  disabled: boolean;
  onTrigger: (step: PagerDutyTestTriggerTarget["step"]) => void;
  onResolve: () => void;
  target: Omit<PagerDutyTestTriggerTarget, "step">;
}) {
  const resolveTestEvent = useResolveTestEvent(onResolve);

  if (!isTestAlertOpen) {
    return (
      <Button
        type="button"
        text="Send test event"
        variant="secondary"
        size="sm"
        icon={Send}
        disabled={disabled}
        onClick={() => onTrigger("trigger")}
      />
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        text="Escalate to critical"
        variant="secondary"
        size="sm"
        icon={ArrowUp}
        disabled={disabled || resolveTestEvent.isPending}
        onClick={() => onTrigger("escalate")}
      />
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
    </div>
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
