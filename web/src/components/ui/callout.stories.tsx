import { Bot } from "lucide-react";
import preview from "../../../.storybook/preview";
import { Button } from "./button";
import { Callout } from "./callout";

const meta = preview.meta({
  component: Callout,
});

// Message and actions share a row from `sm` up; below that the actions drop
// under the full-width message so it is not squeezed into a narrow column
// (LFE-14490). Dismiss keeps its corner either way. Resize the Storybook canvas
// across 640px to see the switch (CSS-only; jsdom story tests do not apply
// media queries).
export const WithActions = meta.story({
  args: {
    id: "callout-story:with-actions",
    variant: "info",
    align: "middle",
    actions: () => (
      <Button size="sm" variant="secondary">
        Learn more
      </Button>
    ),
    children: (
      <div className="flex items-start gap-2 sm:items-center">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
        <span>
          <span className="font-bold">
            Langfuse works great with your AI coding agents.
          </span>{" "}
          Connect Claude Code, Codex, and other agents to your data with the
          Langfuse Agent Skill, MCP server, and CLI.
        </span>
      </div>
    ),
  },
});

// Without actions the message keeps the full width at every size, minus the
// dismiss control.
export const WarningWithoutActions = meta.story({
  args: {
    id: "callout-story:no-actions",
    variant: "warning",
    align: "top",
    children: (
      <span>
        <span className="font-bold">Heads up:</span> this workspace is close to
        its ingestion limit for the current billing period.
      </span>
    ),
  },
});
