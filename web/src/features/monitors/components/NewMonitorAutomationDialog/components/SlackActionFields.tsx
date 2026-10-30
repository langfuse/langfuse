import { type UseFormReturn } from "react-hook-form";

import { Button } from "@/src/components/design-system/Button/Button";
import { Form } from "@/src/components/design-system/Form/Form";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { type SlackChannel } from "@/src/features/slack";
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

/** SlackChannelFields selects the channel and tests it once one is chosen. */
function SlackChannelFields({
  form,
  slack,
}: {
  form: UseFormReturn<MonitorAutomationFormValues>;
  slack: Exclude<SlackFieldsState, { status: "disconnected" }>;
}) {
  const channels = slackChannels(slack);
  const channelId = form.watch("slack.channelId");
  const selectedChannel = channels.find((channel) => channel.id === channelId);

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
        {(field) => (
          <SelectInput<string>
            id={field.id}
            value={field.value}
            onValueChange={(nextChannelId) => {
              field.onChange(nextChannelId);
              form.setValue(
                "slack.channelName",
                channels.find((channel) => channel.id === nextChannelId)
                  ?.name ?? "",
              );
            }}
            options={channels.map((channel) => ({
              value: channel.id,
              label: `#${channel.name}`,
            }))}
            search={{ placeholder: "Search channels" }}
            placeholder="Select a channel"
            emptyMessage={channelsEmptyMessage(slack)}
            disabled={slack.status === "loading"}
            aria-describedby={field.inputDescribedById}
            aria-invalid={!!field.error}
            error={!!field.error}
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
            onClick={() => slack.onTestChannel(selectedChannel)}
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

/** slackChannels lists the loaded channels, if any. */
function slackChannels(
  slack: Exclude<SlackFieldsState, { status: "disconnected" }>,
): SlackChannel[] {
  if (slack.status === "loading") return [];
  return slack.channels;
}

/** channelsEmptyMessage explains an empty channel list. */
function channelsEmptyMessage(
  slack: Exclude<SlackFieldsState, { status: "disconnected" }>,
): string {
  if (slack.status === "connected" && slack.isLoadingChannels) {
    return "Loading channels…";
  }
  return "No channels found.";
}

/** SlackFieldsState is what the Slack fields need to know about the project's Slack integration. */
export type SlackFieldsState =
  | { status: "loading" }
  | {
      status: "disconnected";
      canConnect: boolean;
      isConnecting: boolean;
      onConnect: () => void;
    }
  | {
      status: "connected";
      channels: SlackChannel[];
      isLoadingChannels: boolean;
      isTesting: boolean;
      onTestChannel: (channel: SlackChannel) => void;
    };
