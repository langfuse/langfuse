import preview from "../../../../../.storybook/preview";
import { fn } from "storybook/test";
import { InAppAgentToolCallCard } from "./InAppAgentToolCallCard";

const meta = preview.meta({
  component: InAppAgentToolCallCard,
});

export const Default = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_queryMetrics",
      args: JSON.stringify(
        {
          view: "observations",
          metrics: [{ measure: "count", aggregation: "count" }],
        },
        null,
        2,
      ),
      result: JSON.stringify({ data: [{ count_count: 42 }] }, null, 2),
    },
  },
});

export const Error = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_getTraces",
      args: JSON.stringify({ limit: 10 }, null, 2),
      error: "Failed to load traces: missing project access.",
    },
  },
});

export const ApprovalRequired = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      args: JSON.stringify(
        {
          name: "regression-examples",
          description: "Examples used for release regression tests",
        },
        null,
        2,
      ),
      approval: {
        id: "approval-1",
        status: "pending",
      },
    },
    onApproveToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const ApprovalSubmitting = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      args: JSON.stringify(
        {
          name: "regression-examples",
          description: "Examples used for release regression tests",
        },
        null,
        2,
      ),
      approval: {
        id: "approval-1",
        status: "submitting",
      },
    },
    onApproveToolCall: fn(),
    onRejectToolCall: fn(),
  },
});
