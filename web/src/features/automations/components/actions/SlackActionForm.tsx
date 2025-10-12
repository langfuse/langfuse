import { Input } from "@/src/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { type UseFormReturn } from "react-hook-form";
import { type ActionDomain } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { SlackConnectionCard } from "@/src/features/slack/components/SlackConnectionCard";
import {
  ChannelSelector,
  type SlackChannel,
} from "@/src/features/slack/components/ChannelSelector";
import { SlackTestMessageButton } from "@/src/features/slack/components/SlackTestMessageButton";
import { useState } from "react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(
    null,
  );

  // Get Slack integration status
  const { data: integrationStatus } = api.slack.getIntegrationStatus.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Check user permissions
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  // Handle channel selection
  const handleChannelSelect = (channel: SlackChannel) => {
    form.setValue("slack.channelId", channel.id);
    form.setValue("slack.channelName", channel.name);
    setSelectedChannel(channel);
  };

  // Handle connection status change
  const handleConnectionChange = (connected: boolean) => {
    if (!connected) {
      // Clear channel selection when disconnected
      form.setValue("slack.channelId", "");
      form.setValue("slack.channelName", "");
      setSelectedChannel(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Slack Connection Card */}
      <SlackConnectionCard
        projectId={projectId}
        disabled={disabled}
        onConnectionChange={handleConnectionChange}
        showConnectButton={true}
      />

      {/* Channel Selection - Only show when connected */}
      {integrationStatus?.isConnected && (
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="slack.channelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("automation.actions.slackAction.channel")}
                </FormLabel>
                <FormControl>
                  <div className="max-w-md">
                    <ChannelSelector
                      projectId={projectId}
                      selectedChannelId={field.value}
                      onChannelSelect={handleChannelSelect}
                      disabled={disabled}
                      placeholder={t(
                        "automation.actions.slackAction.selectChannel",
                      )}
                      showRefreshButton={true}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  {t("automation.actions.slackAction.channelDescription")}
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

          {/* Test Message Button - Only show when a channel is selected */}
          {selectedChannel && (
            <div className="flex items-center gap-3 pt-2">
              <SlackTestMessageButton
                projectId={projectId}
                selectedChannel={selectedChannel}
                hasAccess={hasAccess}
                disabled={disabled}
                size="sm"
                buttonText={t("automation.actions.slackAction.testChannel")}
              />
              <p className="text-sm text-muted-foreground">
                {t("automation.actions.slackAction.testChannelDescription")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
