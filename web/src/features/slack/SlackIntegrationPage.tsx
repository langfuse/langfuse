import ContainerPage from "@/src/components/layouts/ContainerPage";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { AutomationButton } from "@/src/features/automations";
import { SlackConnectionCard } from "@/src/features/slack/components/SlackConnectionCard";
import {
  ChannelSelector,
  type SlackChannel,
} from "@/src/features/slack/components/ChannelSelector";
import { SlackTestMessageButton } from "@/src/features/slack/components/SlackTestMessageButton";
import { PrivateChannelsInfoTooltip } from "@/src/features/slack/components/PrivateChannelsInfoTooltip";
import { useSlackIntegration } from "@/src/features/slack/useSlackIntegration";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";

export default function SlackIntegrationPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Handle popup OAuth completion
  useEffect(() => {
    // Check if this page is opened in a popup window
    const isPopup = window.opener && window.opener !== window;

    if (isPopup) {
      // Check for OAuth completion parameters
      const urlParams = new URLSearchParams(window.location.search);
      const success = urlParams.get("success");
      const error = urlParams.get("error");
      const teamName = urlParams.get("team_name");

      if (success === "true") {
        // Send success message to parent window
        window.opener.postMessage(
          {
            type: "slack-oauth-success",
            teamName: teamName || "your Slack workspace",
          },
          window.location.origin,
        );

        // Close popup
        window.close();
      } else if (error) {
        // Send error message to parent window
        window.opener.postMessage(
          {
            type: "slack-oauth-error",
            error: error,
          },
          window.location.origin,
        );

        // Close popup
        window.close();
      }
    }
  }, [router.query]);

  const { query, status } = useSlackIntegration(projectId);
  const integrationStatus = query.data;

  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(
    null,
  );

  // Check user permissions
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  // Channel was typed by name rather than selected from the list
  const isManualEntry = selectedChannel?.id.startsWith("#") ?? false;

  return (
    <ContainerPage
      headerProps={{
        title: "Slack Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: status && <StatusBadge type={status} />,
        actionButtonsRight: <AutomationButton projectId={projectId} />,
      }}
    >
      <div className="space-y-6">
        {/* Connection Configuration */}
        <SlackConnectionCard projectId={projectId} showConnectButton={true} />

        {/* Test Channel Section - Only show when connected */}
        {integrationStatus?.isConnected && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Test Integration
              </CardTitle>
              <CardDescription>
                Test your Slack integration by sending a message to a channel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <h4 className="text-sm font-bold">Select Test Channel</h4>
                  <PrivateChannelsInfoTooltip />
                </div>
                <div className="max-w-md">
                  <ChannelSelector
                    projectId={projectId}
                    selectedChannelId={selectedChannel?.id}
                    selectedChannel={selectedChannel}
                    onChannelSelect={setSelectedChannel}
                    placeholder="Choose a channel to test"
                    showRefreshButton={true}
                  />
                </div>
              </div>

              {selectedChannel && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <h4 className="mb-3 text-sm font-bold">
                      Channel Information
                    </h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-bold">Channel Name</p>
                        <p className="text-muted-foreground text-sm">
                          #{selectedChannel.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">Channel Type</p>
                        {isManualEntry ? (
                          <span className="text-muted-foreground text-xs">
                            Available after sending a test message
                          </span>
                        ) : (
                          <Badge
                            color="primary"
                            text={
                              selectedChannel.isPrivate ? "Private" : "Public"
                            }
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold">Channel ID</p>
                        {isManualEntry ? (
                          <span className="text-muted-foreground text-xs">
                            Available after sending a test message
                          </span>
                        ) : (
                          <p className="text-muted-foreground font-mono text-sm">
                            {selectedChannel.id}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <SlackTestMessageButton
                      projectId={projectId}
                      selectedChannel={selectedChannel}
                      hasAccess={hasAccess}
                      disabled={false}
                      onSuccess={(channelInfo) => {
                        setSelectedChannel((prev) =>
                          prev
                            ? {
                                ...prev,
                                id: channelInfo.id,
                                name: channelInfo.name ?? prev.name,
                                isPrivate:
                                  channelInfo.isPrivate ?? prev.isPrivate,
                              }
                            : prev,
                        );
                      }}
                    />
                  </div>
                </div>
              )}

              {!selectedChannel && (
                <div className="text-muted-foreground text-sm">
                  Select a channel above to view its details and test message
                  delivery. Private channels appear only for the person who
                  connected Slack, and only if both they and the app are
                  members. Invite the app with{" "}
                  <code className="bg-muted rounded px-1 py-0.5">
                    /invite @Langfuse
                  </code>
                  .
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContainerPage>
  );
}
