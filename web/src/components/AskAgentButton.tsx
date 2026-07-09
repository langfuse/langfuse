import { useEffect, useState } from "react";
import { BotMessageSquare } from "lucide-react";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { copyTextToClipboard } from "@/src/utils/clipboard";

export interface AskAgentButtonProps extends Omit<
  ButtonProps,
  "onClick" | "asChild"
> {
  /** Submitted to the in-app agent as the first message of a new conversation. */
  prompt: string;
  /** Called when the prompt is handed to the agent or copied to the clipboard. */
  onStart?: () => void;
}

/**
 * Multi-purpose "hand this task to the AI assistant" button. Opens the in-app
 * agent window, starts a fresh conversation, and submits the prompt. When the
 * agent is unavailable (no entitlement or AI features disabled), it degrades
 * to copying the prompt to the clipboard.
 */
export function AskAgentButton({
  prompt,
  onStart,
  children,
  ...buttonProps
}: AskAgentButtonProps) {
  const { organization } = useQueryProjectOrOrganization();
  const {
    isAvailable,
    isRunning,
    isSubmitting,
    selectedConversationId,
    selectConversation,
    setOpen,
    submit,
  } = useInAppAiAgent();
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const aiFeaturesDisabled = !!organization && !organization.aiFeaturesEnabled;
  const canUseAgent = isAvailable && !aiFeaturesDisabled;

  // submit() reads selectedConversationId from provider state, so submitting
  // into a fresh conversation only works one render after
  // selectConversation(null) has taken effect.
  useEffect(() => {
    if (!pendingPrompt || selectedConversationId || isRunning || isSubmitting) {
      return;
    }
    setPendingPrompt(null);
    submit(pendingPrompt);
  }, [pendingPrompt, selectedConversationId, isRunning, isSubmitting, submit]);

  const handleClick = () => {
    onStart?.();

    if (!canUseAgent) {
      copyTextToClipboard(prompt);
      showSuccessToast({
        title: "Prompt copied",
        description:
          "The AI assistant is not available here. The prompt was copied to your clipboard instead.",
      });
      return;
    }

    setOpen(true);
    if (isRunning) {
      // Don't interrupt an active run; the window is open so the user sees it.
      return;
    }
    selectConversation(null);
    setPendingPrompt(prompt);
  };

  return (
    <Button type="button" onClick={handleClick} {...buttonProps}>
      <BotMessageSquare className="mr-1.5 h-4 w-4" />
      {children ?? "Ask AI assistant"}
    </Button>
  );
}
