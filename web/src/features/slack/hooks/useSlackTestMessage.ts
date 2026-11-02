import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { type SlackChannel } from "@/src/features/slack/components/ChannelSelector";
import { api } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

/** useSlackTestMessage sends a test message to a Slack channel and reports the outcome in a toast unless `shouldToast` is false. */
export function useSlackTestMessage({
  projectId,
  onSuccess,
  onError,
  shouldToast = true,
}: {
  projectId: string;
  shouldToast?: boolean;
  onSuccess?: (channelInfo: {
    id: string;
    name?: string;
    isPrivate?: boolean;
  }) => void;
  onError?: (error: Error) => void;
}) {
  const testMessageMutation = api.slack.sendTestMessage.useMutation({
    onSuccess: (data) => {
      if (shouldToast) {
        showSuccessToast({
          operation: "slack.test_message_send",
          title: "Test Message Sent",
          description:
            "Test message sent successfully to the selected channel.",
        });
      }
      onSuccess?.(data.channelInfo);
    },
    onError: (error) => {
      if (shouldToast) {
        showErrorToast(
          "Failed to Send Test Message",
          error.message,
          classifyTrpcToastError(error, "slack.test_message_send"),
        );
      }
      onError?.(new Error(error.message));
    },
  });

  /** sendTestMessage resolves to the channel as Slack reports it, or to the reason sending failed. */
  const sendTestMessage = async (
    channel: SlackChannel,
  ): Promise<SlackTestMessageResult> => {
    try {
      const result = await testMessageMutation.mutateAsync({
        projectId,
        channelId: channel.id,
        channelName: channel.name ?? undefined,
      });
      return { status: "sent", channel: result.channelInfo };
    } catch (error) {
      // The mutation's onError already reported it.
      return { status: "failed", message: errorMessage(error) };
    }
  };

  return { sendTestMessage, isPending: testMessageMutation.isPending };
}

/** errorMessage is the human-readable reason of a failed request. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Failed to send the test message.";
}

/** SlackTestMessageResult is the outcome of one test message. */
export type SlackTestMessageResult =
  | {
      status: "sent";
      channel: { id: string; name?: string; isPrivate?: boolean };
    }
  | { status: "failed"; message: string };
