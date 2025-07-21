import React, { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { ExternalLink, Slack, CheckCircle, RefreshCw } from "lucide-react";
import { type UseFormReturn } from "react-hook-form";
import { type ActionDomain } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SlackActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
  action?: ActionDomain;
}

export const SlackActionForm: React.FC<SlackActionFormProps> = ({
  form,
  disabled,
  projectId,
}) => {
  const [isTemplateExpanded, setIsTemplateExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get Slack integration status
  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Get available channels
  const { data: channelsData, refetch: refetchChannels } =
    api.slack.getChannels.useQuery(
      { projectId },
      { enabled: integrationStatus?.isConnected },
    );

  const handleRefreshChannels = async () => {
    setIsRefreshing(true);
    await refetchChannels();
    setIsRefreshing(false);
  };

  const handleConnectSlack = () => {
    if (integrationStatus?.installUrl) {
      window.open(integrationStatus.installUrl, "_blank");
    }
  };

  const defaultTemplate = `🔔 *Langfuse Automation Alert*

*Event:* {{eventSource}} {{eventAction}}
*Project:* {{projectName}}
*Timestamp:* {{timestamp}}

{{#if trace}}
*Trace ID:* {{trace.id}}
*Trace Name:* {{trace.name}}
*User ID:* {{trace.userId}}
{{/if}}

{{#if prompt}}
*Prompt:* {{prompt.name}} (v{{prompt.version}})
{{/if}}

View in Langfuse: {{langfuseUrl}}`;

  const availableVariables = [
    "{{eventSource}}",
    "{{eventAction}}",
    "{{projectName}}",
    "{{timestamp}}",
    "{{langfuseUrl}}",
    "{{trace.id}}",
    "{{trace.name}}",
    "{{trace.userId}}",
    "{{prompt.name}}",
    "{{prompt.version}}",
  ];

  if (!integrationStatus?.isConnected) {
    return (
      <div className="space-y-4">
        <Alert>
          <Slack className="h-4 w-4" />
          <AlertDescription>
            {integrationStatus?.error ? (
              <div className="space-y-2">
                <p>Slack integration error: {integrationStatus.error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConnectSlack}
                  disabled={disabled}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Reconnect Slack
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p>
                  Connect your Slack workspace to send automation notifications.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConnectSlack}
                  disabled={disabled}
                >
                  <Slack className="mr-2 h-4 w-4" />
                  Connect Slack
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="text-sm text-muted-foreground">
          Connected to {integrationStatus.teamName}
        </span>
        <Badge variant="secondary" className="text-xs">
          {integrationStatus.teamId}
        </Badge>
      </div>

      {/* Channel Selection */}
      <FormField
        control={form.control}
        name="slack.channelId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              Channel
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRefreshChannels}
                disabled={disabled || isRefreshing}
              >
                <RefreshCw
                  className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </FormLabel>
            <Select
              onValueChange={(value) => {
                const selectedChannel = channelsData?.channels.find(
                  (c) => c.id === value,
                );
                field.onChange(value);
                if (selectedChannel) {
                  form.setValue("slack.channelName", selectedChannel.name);
                }
              }}
              value={field.value}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {channelsData?.channels.map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    <div className="flex items-center gap-2">
                      <span>{channel.isPrivate ? "🔒" : "#"}</span>
                      <span>{channel.name}</span>
                      {!channel.isMember && (
                        <Badge variant="outline" className="text-xs">
                          Not a member
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              Select the Slack channel where notifications will be sent.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Hidden field for channel name */}
      <FormField
        control={form.control}
        name="slack.channelName"
        render={({ field }) => <Input type="hidden" {...field} />}
      />

      {/* Message Template */}
      <Collapsible
        open={isTemplateExpanded}
        onOpenChange={setIsTemplateExpanded}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-auto items-center gap-2 p-0"
          >
            {isTemplateExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>Customize Message Template</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4">
          <FormField
            control={form.control}
            name="slack.messageTemplate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message Template</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={defaultTemplate}
                    rows={10}
                    {...field}
                    disabled={disabled}
                  />
                </FormControl>
                <FormDescription>
                  Customize the message template using Handlebars syntax. Leave
                  empty to use the default template.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Available Variables</CardTitle>
              <CardDescription>
                You can use these variables in your message template:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {availableVariables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="secondary"
                    className="font-mono text-xs"
                  >
                    {variable}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.setValue("slack.messageTemplate", defaultTemplate);
              }}
              disabled={disabled}
            >
              Reset to Default
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.setValue("slack.messageTemplate", "");
              }}
              disabled={disabled}
            >
              Clear Template
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
