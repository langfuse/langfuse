import { type UseFormReturn } from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import {
  ChannelSelectorView,
  type ChannelSelectorViewProps,
  type SlackChannel,
} from "@/src/features/slack";
import { type MonitorAutomationFormValues } from "../fns/monitorAutomationFormSchema";
import { FieldGroup } from "./FieldGroup";
import { InlineCode } from "./InlineCode";

/** SlackActionFields picks the channel of a connected workspace, or offers to connect one. */
export function SlackActionFields({
  form,
  slack,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
  slack: SlackFieldsState;
}) {
  if (slack.status === "disconnected") {
    return <SlackConnectField slack={slack} />;
  }
  return <SlackChannelFields form={form} slack={slack} />;
}

/** SlackConnectField starts the Slack workspace connection. */
function SlackConnectField({
  slack,
}: {
  slack: Extract<SlackFieldsState, { status: "disconnected" }>;
}) {
  return (
    <FieldGroup label="Slack channel">
      <p className="text-muted-foreground text-sm">
        Connect your Slack workspace to enable real-time notifications for your
        automations.
        {!slack.canManageIntegration &&
          " Ask a project admin to connect Slack."}
      </p>
      <div className="flex">
        <Button
          type="button"
          variant="secondary"
          text={connectLabel(slack.isConnecting)}
          loading={slack.isConnecting}
          disabled={!slack.canConnect}
          onClick={slack.onConnect}
        />
      </div>
    </FieldGroup>
  );
}

/** SlackChannelFields selects the channel and tests it once one is chosen; testing also resolves a typed #name. */
function SlackChannelFields({
  form,
  slack,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
  slack: Exclude<SlackFieldsState, { status: "disconnected" }>;
}) {
  const channelId = form.watch("slack.channelId");
  const channelName = form.watch("slack.channelName");
  const selectedChannel = selectedSlackChannel(channelId, channelName);
  const selectChannel = (channel: SlackChannel) => {
    form.setValue("slack.channelId", channel.id);
    form.setValue("slack.channelName", channel.name);
  };

  return (
    <>
      <Form.Field
        control={form.control}
        name="slack.channelId"
        label="Slack channel"
        description={
          <>
            Select the Slack channel where notifications will be sent. Private
            channels appear only for the person who connected Slack, and only if
            both they and the app are members. Invite the app with{" "}
            <InlineCode isShaded>/invite @Langfuse</InlineCode>.
          </>
        }
      >
        {() => (
          <ChannelSelectorView
            {...channelSelectorData(slack)}
            selectedChannelId={channelId}
            selectedChannel={selectedChannel}
            onChannelSelect={selectChannel}
            placeholder="Select a channel"
          />
        )}
      </Form.Field>
      {selectedChannel && slack.status === "connected" && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            text="Test channel"
            loading={slack.isTesting}
            onClick={async () => {
              const resolved = await slack.onTestChannel(selectedChannel);
              if (resolved) {
                selectChannel({
                  ...selectedChannel,
                  id: resolved.id,
                  name: resolved.name ?? selectedChannel.name,
                });
              }
            }}
          />
          <p className="text-muted-foreground text-sm">
            Test this channel to verify the bot can send messages.
          </p>
        </div>
      )}
    </>
  );
}

/** connectLabel reflects a pending Slack OAuth popup. */
function connectLabel(isConnecting: boolean): string {
  if (isConnecting) return "Connecting…";
  return "Connect Slack";
}

/** selectedSlackChannel is the channel the form holds, if one is chosen. */
function selectedSlackChannel(
  channelId: string,
  channelName: string,
): SlackChannel | null {
  if (!channelId) return null;
  return { id: channelId, name: channelName };
}

/** channelSelectorData is the channel list state, empty and loading until the integration status is known. */
function channelSelectorData(
  slack: Exclude<SlackFieldsState, { status: "disconnected" }>,
): SlackChannelSelectorData {
  if (slack.status === "connected") return slack.channelSelector;
  return {
    channelsData: null,
    isLoading: true,
    hasError: false,
    isRefreshing: false,
    onRefresh: () => {},
    disabled: true,
  };
}

/** SlackFieldsState is what the Slack fields need to know about the project's Slack integration. */
export type SlackFieldsState =
  | { status: "loading" }
  | {
      status: "disconnected";
      canManageIntegration: boolean;
      canConnect: boolean;
      isConnecting: boolean;
      onConnect: () => void;
    }
  | {
      status: "connected";
      channelSelector: SlackChannelSelectorData;
      isTesting: boolean;
      onTestChannel: (
        channel: SlackChannel,
      ) => Promise<{ id: string; name?: string } | undefined>;
    };

/** SlackChannelSelectorData is the channel list state ChannelSelectorView renders, without the selection. */
type SlackChannelSelectorData = Omit<
  ChannelSelectorViewProps,
  "selectedChannelId" | "selectedChannel" | "onChannelSelect" | "placeholder"
>;
