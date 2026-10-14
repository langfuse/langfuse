// The slack feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
export {
  ChannelSelector,
  type SlackChannel,
} from "@/src/automation/slack/components/ChannelSelector";
export { SlackConnectionCard } from "@/src/automation/slack/components/SlackConnectionCard";
export { SlackTestMessageButton } from "@/src/automation/slack/components/SlackTestMessageButton";
