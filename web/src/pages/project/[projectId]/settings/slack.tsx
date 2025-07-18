import React from "react";
import { useRouter } from "next/router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft, Slack, Settings, Zap } from "lucide-react";
import { api } from "@/src/utils/api";
import { SlackSettings } from "@/src/features/slack/components/SlackSettings";

/**
 * Main Slack settings page for a project.
 *
 * This page provides a comprehensive interface for managing Slack integrations,
 * including connection management, automation configuration, and integration status.
 *
 * Features:
 * - Connection status and management
 * - Automation listing and configuration
 * - Integration statistics and information
 * - Direct links to create new Slack automations
 *
 * The page is protected by authentication and project access controls.
 */
export default function SlackSettingsPage() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };

  // Get Slack integration status
  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Get automations for this project
  const { data: automations } = api.automations.getAutomations.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Filter Slack automations
  const slackAutomations =
    automations?.filter((automation) => automation.action.type === "SLACK") ||
    [];

  // Handle navigation back to settings
  const handleBack = () => {
    router.push(`/project/${projectId}/settings`);
  };

  // Handle creating new Slack automation
  const handleCreateAutomation = () => {
    router.push(
      `/project/${projectId}/settings/automations/new?actionType=SLACK`,
    );
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>

        <div className="flex items-center gap-2">
          <Slack className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">Slack Integration</h1>
            <p className="text-muted-foreground">
              Manage your Slack workspace connection and automations
            </p>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Connection Status
            </CardTitle>
            <Slack className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {integrationStatus?.isConnected ? "Connected" : "Disconnected"}
            </div>
            <p className="text-xs text-muted-foreground">
              {integrationStatus?.isConnected
                ? `Connected to ${integrationStatus.teamName}`
                : "No workspace connected"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Automations
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {
                slackAutomations.filter((a) => a.trigger.status === "ACTIVE")
                  .length
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {slackAutomations.length} total Slack automations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button
                size="sm"
                onClick={handleCreateAutomation}
                disabled={!integrationStatus?.isConnected}
                className="w-full"
              >
                Create Automation
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  router.push(`/project/${projectId}/settings/automations`)
                }
                className="w-full"
              >
                View All Automations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Settings Component */}
      <SlackSettings projectId={projectId} />

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Learn more about setting up and using Slack integrations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-medium">Getting Started</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Connect your Slack workspace</li>
                <li>• Configure automation triggers</li>
                <li>• Customize message templates</li>
                <li>• Test your notifications</li>
              </ul>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Best Practices</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Use specific channels for different alerts</li>
                <li>• Configure filters to reduce noise</li>
                <li>• Test automations before enabling</li>
                <li>• Monitor automation execution logs</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              Documentation
            </Button>
            <Button variant="outline" size="sm">
              Support
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
