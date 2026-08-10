import { useCallback } from "react";
import { useRouter } from "next/router";

import { InAppAgentDetailLauncher } from "./InAppAgentDetailLauncher";
import { useInAppAiAgent } from "./InAppAiAgentProvider";
import { getInAppAgentScreenContextDescription } from "@/src/features/in-app-agent/context";
import {
  getInAppAgentFocusedQuickActions,
  getInAppAgentQuickActionContext,
  type InAppAgentQuickAction,
} from "@/src/features/in-app-agent/quickActions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const NO_QUICK_ACTIONS: readonly InAppAgentQuickAction[] = [];

/**
 * Wires {@link InAppAgentDetailLauncher} to the assistant controller. The
 * entitlement gate lives in the peek that renders this, so the launcher's
 * appearance is a parent render decision the peek header can plan around.
 */
export function ControlledInAppAgentDetailLauncher() {
  const router = useRouter();
  const { open, setOpen, openAssistant, submit, isRunning, isSubmitting } =
    useInAppAiAgent();
  const capture = usePostHogClientCapture();
  // Same derivation as ControlledInAppAgentWindow, so the launcher's chips and
  // the window's own picker never disagree. `?peek=` / `?observation=` URLs
  // already resolve to trace / observation.
  const screenContextType = getInAppAgentScreenContextDescription(
    router.asPath,
  ).type;
  const quickActions =
    getInAppAgentFocusedQuickActions(screenContextType) ?? NO_QUICK_ACTIONS;
  const quickActionCategory = getInAppAgentQuickActionContext(router.asPath);

  const toggleAssistant = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    openAssistant("detail_header");
  }, [open, openAssistant, setOpen]);

  const runQuickAction = useCallback(
    (action: InAppAgentQuickAction, position: number) => {
      if (!openAssistant("detail_header")) {
        return;
      }

      capture("in_app_agent:quick_action_started", {
        quickActionKey: action.id,
        quickActionCategory,
        position,
      });

      // `newConversation` is required: the selected conversation persists in
      // sessionStorage across panel close/reopen, so without it this framed
      // prompt would be appended to whatever unrelated thread was last open.
      submit(action.prompt, {
        quickAction: { key: action.id, category: quickActionCategory },
        newConversation: true,
      }).catch(() => undefined);
    },
    [capture, openAssistant, quickActionCategory, submit],
  );

  return (
    <InAppAgentDetailLauncher
      isOpen={open}
      isDisabled={isRunning || isSubmitting}
      quickActions={quickActions}
      onToggle={toggleAssistant}
      onSelectQuickAction={runQuickAction}
    />
  );
}
