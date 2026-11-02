import { useState } from "react";

import { type PagerDutyRegion } from "@langfuse/shared/pagerduty";
import { showSuccessToast } from "@/src/features/notifications";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

/** usePagerDutyTestEvent triggers a critical test alert for the project and resolves it once it is open. */
export function usePagerDutyTestEvent(
  projectId: string,
): PagerDutyTestEventState {
  const canSend = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const [isTestAlertOpen, setIsTestAlertOpen] = useState(false);
  const sendTestEvent = api.automations.sendPagerDutyTestEvent.useMutation({
    meta: { silentAllErrors: true },
  });
  const resolveTestEvent = api.automations.sendPagerDutyTestEvent.useMutation({
    onSuccess: () => {
      setIsTestAlertOpen(false);
      showSuccessToast({
        operation: "automations.sendPagerDutyTestEvent",
        title: "Test event resolved",
        description: "PagerDuty accepted the resolve of the test alert.",
      });
    },
  });

  return {
    canSend,
    isTestAlertOpen,
    isSending: sendTestEvent.isPending,
    sendError: sendTestEvent.error?.message,
    onSend: async (target) => {
      await sendTestEvent.mutateAsync({
        projectId,
        ...target,
        step: "trigger",
      });
      setIsTestAlertOpen(true);
      showSuccessToast({
        operation: "automations.sendPagerDutyTestEvent",
        title: "Test event sent",
        description: "PagerDuty accepted the critical test alert.",
      });
    },
    onResetSend: () => sendTestEvent.reset(),
    isResolving: resolveTestEvent.isPending,
    onResolve: (target) =>
      resolveTestEvent.mutate({ projectId, ...target, step: "resolve" }),
  };
}

/** PagerDutyTestEventTarget is the key a test event goes to: the typed key, else the action's stored key. */
export type PagerDutyTestEventTarget = {
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
};

/** PagerDutyTestEventState is what the test event buttons show and do. */
export type PagerDutyTestEventState = {
  canSend: boolean;
  isTestAlertOpen: boolean;
  isSending: boolean;
  sendError: string | undefined;
  onSend: (target: PagerDutyTestEventTarget) => Promise<void>;
  onResetSend: () => void;
  isResolving: boolean;
  onResolve: (target: PagerDutyTestEventTarget) => void;
};
