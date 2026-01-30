import React from "react";
import { Button } from "@/src/components/ui/button";
import { Zap } from "lucide-react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type SlackChannel } from "./ChannelSelector";

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
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Button size */
  size?: "default" | "sm" | "lg";
  /** Custom button text */
  buttonText?: string;
  /** Callback when test message is sent successfully */
  onSuccess?: () => void;
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
  // Test message mutation
  const testMessageMutation = api.slack.sendTestMessage.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Test Message Sent",
        description: "Test message sent successfully to the selected channel.",
      });
      onSuccess?.();
    },
    onError: (error) => {
      showErrorToast("Failed to Send Test Message", error.message);
      onError?.(new Error(error.message));
    },
  });

  // Handle test message
  const handleTestMessage = async () => {
    if (!selectedChannel) return;

    try {
      await testMessageMutation.mutateAsync({
        projectId,
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
      });
    } catch {
      // Error handling is done in the mutation
    }
  };

  // Determine if button should be disabled
  const isDisabled =
    disabled || !hasAccess || testMessageMutation.isPending || !selectedChannel;

  return (
    <Button
      onClick={handleTestMessage}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className="flex items-center gap-2"
    >
      {testMessageMutation.isPending ? (
        <>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {showText && <span>Sending...</span>}
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          {showText && <span>{buttonText}</span>}
        </>
      )}
    </Button>
  );
};
