import React from "react";
import { Button } from "@/src/components/ui/button";
import { Zap } from "lucide-react";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type SlackChannel } from "./ChannelSelector";
import { useTranslation } from "react-i18next";

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
  buttonText,
  onSuccess,
  onError,
  showText = true,
  hasAccess = true,
}) => {
  const { t } = useTranslation();
  // Test message mutation
  const testMessageMutation = api.slack.sendTestMessage.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: t("automation.slack.testMessage.sent"),
        description: t("automation.slack.testMessage.sentDescription"),
      });
      onSuccess?.();
    },
    onError: (error) => {
      showErrorToast(
        t("automation.slack.testMessage.failedToSend"),
        error.message,
      );
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
    } catch (error) {
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
          {showText && <span>{t("automation.slack.testMessage.sending")}</span>}
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          {showText && (
            <span>
              {buttonText || t("automation.slack.testMessage.sendTestMessage")}
            </span>
          )}
        </>
      )}
    </Button>
  );
};
