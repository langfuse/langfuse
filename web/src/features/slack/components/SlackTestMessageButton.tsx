import React from "react";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { Zap } from "@langfuse/icons";
import { type SlackChannel } from "./ChannelSelector";
import { useSlackTestMessage } from "@/src/features/slack/hooks/useSlackTestMessage";

/**
 * Props for the SlackTestMessageButton component
 */
interface SlackTestMessageButtonProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Selected channel to send test message to */
  selectedChannel: SlackChannel | null;
  /** Whether the button should be disabled */
  disabled?: boolean;
  /** Button variant */
  variant?: ButtonProps["variant"];
  /** Button size */
  size?: ButtonProps["size"];
  /** Custom button text */
  buttonText?: string;
  /** Callback when test message is sent successfully, receives the resolved channel info */
  onSuccess?: (channelInfo: {
    id: string;
    name?: string;
    isPrivate?: boolean;
  }) => void;
  /** Callback when test message fails */
  onError?: (error: Error) => void;
  /** Whether to show the button text */
  showText?: boolean;
  /** Whether the user has access to send test messages */
  hasAccess?: boolean;
}

/**
 * Reusable Slack Test Message Button
 *
 * Sends a test message to the selected Slack channel to verify the integration
 * is working properly. Includes proper loading states and error handling.
 */
export const SlackTestMessageButton: React.FC<SlackTestMessageButtonProps> = ({
  projectId,
  selectedChannel,
  disabled = false,
  variant = "default",
  size = "default",
  buttonText = "Send Test Message",
  onSuccess,
  onError,
  showText = true,
  hasAccess = true,
}) => {
  const { sendTestMessage, isPending } = useSlackTestMessage({
    projectId,
    onSuccess,
    onError,
  });

  const handleTestMessage = async () => {
    if (!selectedChannel) return;
    await sendTestMessage(selectedChannel);
  };

  // Determine if button should be disabled
  const isDisabled = disabled || !hasAccess || isPending || !selectedChannel;

  return (
    <Button
      onClick={handleTestMessage}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className="flex items-center gap-2"
    >
      {isPending ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {showText && <span>Sending...</span>}
        </>
      ) : (
        <>
          <Zap size="base" />
          {showText && <span>{buttonText}</span>}
        </>
      )}
    </Button>
  );
};
