import { useId, useState } from "react";
import { type UseFormReturn } from "react-hook-form";
import { SiSlack } from "@langfuse/icons/si";

import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import {
  ChannelSelectorView,
  type ChannelSelectorViewProps,
  type SlackChannel,
  type SlackTestMessageResult,
} from "@/src/features/slack";
import { type MonitorAutomationFormValues } from "../helpers/monitorAutomationFormSchema";
import { FieldGroup } from "./FieldGroup";
import { InlineCode } from "./InlineCode";
import { FieldHelp } from "./FieldHelp";
import { FieldWithHelp } from "./FieldWithHelp";

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
          variant="primary"
          icon={SiSlack}
          text={connectLabel(slack.isConnecting)}
          disabled={!slack.canConnect || slack.isConnecting}
          onClick={slack.onConnect}
        />
      </div>
      {slack.connectError && (
        <p role="alert" className="text-destructive text-sm">
          {slack.connectError}
        </p>
      )}
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
  const channelHelpId = useId();
  const [testResult, setTestResult] = useState<SlackTestMessageResult>();
  const selectChannel = (channel: SlackChannel) => {
    form.setValue("slack.channelId", channel.id);
    form.setValue("slack.channelName", channel.name);
  };

  return (
    <>
      <FieldWithHelp>
        <Form.Field
          control={form.control}
          name="slack.channelId"
          label="Slack channel"
        >
          {() => (
            <ChannelSelectorView
              {...channelSelectorData(slack)}
              selectedChannelId={channelId}
              selectedChannel={selectedChannel}
              onChannelSelect={(channel) => {
                setTestResult(undefined);
                selectChannel(channel);
              }}
              placeholder="Select a channel"
            />
          )}
        </Form.Field>
        <FieldHelp id={channelHelpId}>
          Select the Slack channel where notifications will be sent. Private
          channels appear only for the person who connected Slack, and only if
          both they and the app are members. Invite the app with{" "}
          <InlineCode isShaded>/invite @Langfuse</InlineCode>.
        </FieldHelp>
      </FieldWithHelp>
      {selectedChannel && slack.status === "connected" && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            text="Test channel"
            loading={slack.isTesting}
            onClick={async () => {
              const result = await slack.onTestChannel(selectedChannel);
              setTestResult(result);
              if (result.status === "sent") {
                selectChannel({
                  ...selectedChannel,
                  id: result.channel.id,
                  name: result.channel.name ?? selectedChannel.name,
                });
              }
            }}
          />
          <TestChannelStatus result={testResult} />
        </div>
      )}
    </>
  );
}

/** TestChannelStatus explains the test, then reports how the last one went. */
function TestChannelStatus({
  result,
}: {
  result: SlackTestMessageResult | undefined;
}) {
  if (result?.status === "failed") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {result.message}
      </p>
    );
  }
  if (result?.status === "sent") {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        Test message sent. Check the channel in Slack.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm">
      Test this channel to verify the bot can send messages.
    </p>
  );
}

/** connectLabel reflects a pending Slack OAuth popup. */
function connectLabel(isConnecting: boolean): string {
  if (isConnecting) return "Connecting...";
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
      connectError?: string;
      isConnecting: boolean;
      onConnect: () => void;
    }
  | {
      status: "connected";
      channelSelector: SlackChannelSelectorData;
      isTesting: boolean;
      onTestChannel: (channel: SlackChannel) => Promise<SlackTestMessageResult>;
    };

/** SlackChannelSelectorData is the channel list state ChannelSelectorView renders, without the selection. */
type SlackChannelSelectorData = Omit<
  ChannelSelectorViewProps,
  "selectedChannelId" | "selectedChannel" | "onChannelSelect" | "placeholder"
>;
