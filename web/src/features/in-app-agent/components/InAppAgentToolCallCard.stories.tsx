import preview from "../../../../.storybook/preview";
import { expect, fn, within } from "storybook/test";
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
      status: "succeeded",
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
      status: "failed",
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
      status: "running",
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

const conversationGrantArgs = {
  isCompact: true,
  tool: {
    type: "tool",
    name: "langfuse_createDashboardWidget",
    status: "running",
    args: JSON.stringify(
      { dashboardId: "dash-1", name: "p95 latency" },
      null,
      2,
    ),
    approval: {
      id: "approval-1",
      status: "pending",
    },
  },
} as const;

export const ApprovalWithConversationGrant = meta.story({
  args: {
    ...conversationGrantArgs,
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const ApprovalSubmitting = meta.story({
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      status: "running",
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

export const ApprovalDisabled = meta.story({
  args: {
    isCompact: true,
    isDisabled: true,
    tool: {
      type: "tool",
      name: "langfuse_upsertDataset",
      status: "running",
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
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "Confirm" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Reject" })).toBeDisabled();
  },
});

export const AlwaysAllowsForConversation = meta.story({
  name: "(Test) Always allows for conversation",
  args: {
    ...conversationGrantArgs,
    onApproveToolCall: fn(),
    onAlwaysAllowToolCall: fn(() => new Promise<void>(() => undefined)),
    onRejectToolCall: fn(),
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const confirm = canvas.getByRole("button", { name: "Confirm" });
    const alwaysAllow = canvas.getByRole("button", { name: "Always allow" });
    const reject = canvas.getByRole("button", { name: "Reject" });

    await userEvent.click(alwaysAllow);

    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledOnce();
    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledWith("approval-1");
    await expect(args.onApproveToolCall).not.toHaveBeenCalled();
    await expect(args.onRejectToolCall).not.toHaveBeenCalled();
    await expect(alwaysAllow).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();
    await expect(alwaysAllow).toBeDisabled();
    await expect(reject).toBeDisabled();
  },
});
