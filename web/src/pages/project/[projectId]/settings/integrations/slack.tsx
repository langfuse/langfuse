import ContainerPage from "@/src/components/layouts/container-page";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { AutomationButton } from "@/src/features/automations/components/AutomationButton";
import { SlackConnectionCard } from "@/src/features/slack/components/SlackConnectionCard";
import {
  ChannelSelector,
  type SlackChannel,
} from "@/src/features/slack/components/ChannelSelector";
import { SlackTestMessageButton } from "@/src/features/slack/components/SlackTestMessageButton";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { Badge } from "@/src/components/ui/badge";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";

export default function SlackIntegrationSettings() {
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
                <h4 className="mb-2 text-sm font-medium">
                  Select Test Channel
                </h4>
                <div className="max-w-md">
                  <ChannelSelector
                    projectId={projectId}
                    selectedChannelId={selectedChannel?.id}
                    onChannelSelect={setSelectedChannel}
                    placeholder="Choose a channel to test"
                    showRefreshButton={true}
                  />
                </div>
              </div>

              {selectedChannel && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <h4 className="mb-3 text-sm font-medium">
                      Channel Information
                    </h4>
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
                        <p className="text-sm font-medium">Channel ID</p>
                        <p className="font-mono text-sm text-muted-foreground">
                          {selectedChannel.id}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <SlackTestMessageButton
                      projectId={projectId}
                      selectedChannel={selectedChannel}
                      hasAccess={hasAccess}
                      disabled={false}
                    />
                  </div>
                </div>
              )}

              {!selectedChannel && (
                <div className="text-sm text-muted-foreground">
                  Select a channel above to view its details and test message
                  delivery.
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContainerPage>
  );
}
