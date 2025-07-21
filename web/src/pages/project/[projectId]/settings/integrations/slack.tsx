import ContainerPage from "@/src/components/layouts/container-page";
import Header from "@/src/components/layouts/header";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { SlackConnectionCard } from "@/src/features/slack/components/SlackConnectionCard";
import {
  ChannelSelector,
  type SlackChannel,
} from "@/src/features/slack/components/ChannelSelector";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useState } from "react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Zap } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export default function SlackIntegrationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data: integrationStatus, isInitialLoading } =
    api.slack.getIntegrationStatus.useQuery(
      { projectId },
      { enabled: !!projectId },
    );

  const status = isInitialLoading
    ? undefined
    : integrationStatus?.isConnected
      ? "active"
      : "inactive";

  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(
    null,
  );

  // Check user permissions
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  // Test message mutation
  const testMessageMutation = api.slack.sendTestMessage.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Test Message Sent",
        description: "Test message sent successfully to the selected channel.",
      });
    },
    onError: (error) => {
      showErrorToast("Failed to Send Test Message", error.message);
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

  return (
    <ContainerPage
      headerProps={{
        title: "Slack Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: <>{status && <StatusBadge type={status} />}</>,
        actionButtonsRight: <AutomationButton projectId={projectId} />,
      }}
    >
      <p className="mb-4 text-sm text-primary">
        Connect a Slack workspace and create channel automations to receive
        Langfuse alerts natively in Slack.
      </p>

      {/* Connection card */}
      <SlackConnectionCard projectId={projectId} />

      {integrationStatus?.isConnected && (
        <>
          <Header title="Test Channel" className="mt-8" />
          <p className="mb-2 text-sm text-primary">
            Select a channel to send a test message.
          </p>
          <div className="max-w-md">
            <ChannelSelector
              projectId={projectId}
              selectedChannelId={selectedChannel?.id}
              onChannelSelect={setSelectedChannel}
            />
          </div>
        </>
      )}

      {selectedChannel && (
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium">Channel Information</h4>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Channel Name</p>
                <p className="text-sm text-muted-foreground">
                  #{selectedChannel.name}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Channel Type</p>
                <Badge variant="outline" className="text-xs">
                  {selectedChannel.isPrivate ? "Private" : "Public"}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium">Bot Access</p>
                <Badge
                  variant={selectedChannel.isMember ? "default" : "secondary"}
                  className="text-xs"
                >
                  {selectedChannel.isMember ? "Member" : "Not a member"}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium">Channel ID</p>
                <p className="font-mono text-sm text-muted-foreground">
                  {selectedChannel.id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleTestMessage}
                disabled={
                  !hasAccess ||
                  testMessageMutation.isLoading ||
                  !selectedChannel.isMember
                }
                className="flex items-center gap-2"
              >
                {testMessageMutation.isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Send Test Message
                  </>
                )}
              </Button>
              {!selectedChannel.isMember && (
                <p className="text-sm text-muted-foreground">
                  The bot needs to be added to this channel to send messages.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedChannel && (
        <div className="border-t pt-4">
          <h4 className="mb-2 font-medium">Channel Information</h4>
          <p className="text-sm text-muted-foreground">
            Select a channel above to view its details and test message
            delivery.
          </p>
        </div>
      )}
    </ContainerPage>
  );
}
