import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { type SlackChannel } from "@/src/features/slack/components/ChannelSelector";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

/** useSlackTestMessage sends a test message to a Slack channel and reports the outcome in a toast. */
export function useSlackTestMessage({
  projectId,
  onSuccess,
  onError,
}: {
  projectId: string;
  onSuccess?: (channelInfo: {
    id: string;
    name?: string;
    isPrivate?: boolean;
  }) => void;
  onError?: (error: Error) => void;
}) {
  const testMessageMutation = api.slack.sendTestMessage.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        operation: "slack.test_message_send",
        title: "Test Message Sent",
        description: "Test message sent successfully to the selected channel.",
      });
      onSuccess?.(data.channelInfo);
    },
    onError: (error) => {
      showErrorToast(
        "Failed to Send Test Message",
        error.message,
        classifyTrpcToastError(error, "slack.test_message_send"),
      );
      onError?.(new Error(error.message));
    },
  });

  const sendTestMessage = async (channel: SlackChannel) => {
    try {
      await testMessageMutation.mutateAsync({
        projectId,
        channelId: channel.id,
        channelName: channel.name ?? undefined,
      });
    } catch {
      // The mutation's onError already reported it.
    }
  };

  return { sendTestMessage, isPending: testMessageMutation.isPending };
}
