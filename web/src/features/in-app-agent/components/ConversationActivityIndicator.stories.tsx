import preview from "../../../../.storybook/preview";
import { ConversationActivityIndicator } from "./ConversationActivityIndicator";
import type { InAppAgentActivityState } from "@/src/features/in-app-agent/lib/inAppAgentActivity";

const meta = preview.meta({
  component: ConversationActivityIndicator,
});

export const ApprovalRequired = meta.story({
  args: { state: "approval" },
});

export const Running = meta.story({
  args: { state: "running" },
});

export const UnreadFailure = meta.story({
  args: { state: "failed-unread" },
});

export const UnreadSuccess = meta.story({
  args: { state: "done-unread" },
});

const STATES: readonly { state: InAppAgentActivityState; label: string }[] = [
  { state: "approval", label: "Needs your approval" },
  { state: "running", label: "Queued or running" },
  { state: "failed-unread", label: "Failed, unread" },
  { state: "done-unread", label: "Finished, unread" },
];

/**
 * Top to bottom is the priority order a conversation row applies: only the
 * first matching state is ever rendered.
 */
export const VariantMatrix = meta.story({
  args: { state: "approval" },
  render: () => (
    <div className="flex flex-col gap-2">
      {STATES.map(({ state, label }) => (
        <div key={state} className="flex items-center gap-2 text-sm">
          <ConversationActivityIndicator state={state} />
          <span className="text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  ),
});
