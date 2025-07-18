import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Slack, Zap, Plus, ExternalLink } from "lucide-react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { SlackConnectionCard } from "./SlackConnectionCard";
import { ChannelSelector, type SlackChannel } from "./ChannelSelector";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

/**
 * Props for the SlackSettings component
 */
interface SlackSettingsProps {
  /** Project ID for the Slack integration */
  projectId: string;
}

/**
 * Main settings component for Slack integration management.
 *
 * This component provides a tabbed interface for managing various aspects of the Slack integration:
 * - Connection management (connect/disconnect workspace)
 * - Automation configuration and status
 * - Channel management and testing
 * - Integration statistics and logs
 *
 * The component handles permission checks and provides appropriate UI for different user roles.
 * It integrates with the existing automation system and provides quick access to create new automations.
 *
 * @param projectId - The project ID for the Slack integration
 */
export const SlackSettings: React.FC<SlackSettingsProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState("connection");
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(
    null,
  );
  const router = useRouter();

  // Check user permissions
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "automations:read",
  });

  // Get Slack integration status
  const { data: integrationStatus, refetch: refetchStatus } =
    api.slack.getIntegrationStatus.useQuery(
      { projectId },
      { enabled: !!projectId },
    );

  // Get automations for this project
  const { data: automations } = api.automations.getAutomations.useQuery(
    { projectId },
    { enabled: !!projectId && hasReadAccess },
  );

  // Filter Slack automations
  const slackAutomations =
    automations?.filter((automation) => automation.action.type === "SLACK") ||
    [];

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

  // Handle connection status change
  const handleConnectionChange = () => {
    refetchStatus();
  };

  // Handle creating new automation
  const handleCreateAutomation = () => {
    router.push(
      `/project/${projectId}/settings/automations/new?actionType=SLACK`,
    );
  };

  // Handle editing automation
  const handleEditAutomation = (automationId: string) => {
    router.push(`/project/${projectId}/settings/automations/${automationId}`);
  };

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

  // Render automation list
  const renderAutomationList = () => {
    if (!hasReadAccess) {
      return (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">
            You don&apos;t have permission to view automations.
          </p>
        </div>
      );
    }

    if (slackAutomations.length === 0) {
      return (
        <div className="py-8 text-center">
          <Zap className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">No Slack Automations</h3>
          <p className="mb-4 text-muted-foreground">
            Create your first Slack automation to get started with
            notifications.
          </p>
          {hasAccess && integrationStatus?.isConnected && (
            <Button onClick={handleCreateAutomation}>
              <Plus className="mr-2 h-4 w-4" />
              Create Automation
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Slack Automations</h3>
          {hasAccess && integrationStatus?.isConnected && (
            <Button size="sm" onClick={handleCreateAutomation}>
              <Plus className="mr-2 h-4 w-4" />
              Create Automation
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {slackAutomations.map((automation) => (
            <Card key={automation.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Slack className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h4 className="font-medium">{automation.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {automation.trigger.eventSource} •{" "}
                      {automation.trigger.eventActions.join(", ")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      automation.trigger.status === "ACTIVE"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {automation.trigger.status}
                  </Badge>

                  {hasAccess && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditAutomation(automation.id)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="pt-4 text-center">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/project/${projectId}/settings/automations`)
            }
          >
            View All Automations
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="space-y-4">
          <SlackConnectionCard
            projectId={projectId}
            disabled={!hasAccess}
            onConnectionChange={handleConnectionChange}
          />

          {integrationStatus?.isConnected && (
            <Card>
              <CardHeader>
                <CardTitle>Integration Details</CardTitle>
                <CardDescription>
                  Information about your connected Slack workspace
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Workspace</p>
                    <p className="text-sm text-muted-foreground">
                      {integrationStatus.teamName}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium">Team ID</p>
                    <p className="font-mono text-sm text-muted-foreground">
                      {integrationStatus.teamId}
                    </p>
                  </div>

                  {integrationStatus.botUserId && (
                    <div>
                      <p className="text-sm font-medium">Bot User ID</p>
                      <p className="font-mono text-sm text-muted-foreground">
                        {integrationStatus.botUserId}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <Badge className="text-xs">Connected</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="automations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Slack Automations</CardTitle>
              <CardDescription>
                Manage your Slack notification automations
              </CardDescription>
            </CardHeader>
            <CardContent>{renderAutomationList()}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Channel Management</CardTitle>
              <CardDescription>
                Browse and test Slack channels for your automations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {integrationStatus?.isConnected ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-2 font-medium">Available Channels</h4>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Select a channel to view its details and test
                      notifications.
                    </p>

                    <ChannelSelector
                      projectId={projectId}
                      selectedChannelId={selectedChannel?.id}
                      onChannelSelect={setSelectedChannel}
                      disabled={!hasReadAccess}
                    />
                  </div>

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
                              variant={
                                selectedChannel.isMember
                                  ? "default"
                                  : "secondary"
                              }
                              className="text-xs"
                            >
                              {selectedChannel.isMember
                                ? "Member"
                                : "Not a member"}
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
                              testMessageMutation.isPending ||
                              !selectedChannel.isMember
                            }
                            className="flex items-center gap-2"
                          >
                            {testMessageMutation.isPending ? (
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
                              The bot needs to be added to this channel to send
                              messages.
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
                        Select a channel above to view its details and test
                        message delivery.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Slack className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-medium">
                    Connect Slack First
                  </h3>
                  <p className="mb-4 text-muted-foreground">
                    You need to connect your Slack workspace to manage channels.
                  </p>
                  <Button onClick={() => setActiveTab("connection")}>
                    Go to Connection
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
