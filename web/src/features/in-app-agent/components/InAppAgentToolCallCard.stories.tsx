import { useState, useSyncExternalStore } from "react";
import { InAppAgentRunStatus } from "@langfuse/shared";
import preview from "../../../../.storybook/preview";
import { expect, fn, within } from "storybook/test";
import { InAppAgentToolCallCard } from "./InAppAgentToolCallCard";
import { BackgroundExecutionSessionController } from "../lib/backgroundExecutionSession";
import { createInAppAgentDisplayState } from "../lib/display";

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

export const ReviewsParallelApprovals = meta.story({
  name: "(Test) Reviews parallel approvals",
  args: {
    ...conversationGrantArgs,
    onApproveToolCall: fn(() => new Promise<void>(() => undefined)),
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
  render: function Render(args) {
    const [controller] = useState(
      () =>
        new BackgroundExecutionSessionController({
          agent: {
            messages: [],
            setMessages: () => undefined,
            subscribe: () => ({ unsubscribe: () => undefined }),
            runAgent: async () => undefined,
            connectAgent: async () => undefined,
            abortRun: () => undefined,
            setCursor: () => undefined,
          },
          hydrate: async () => ({
            messages: [],
            displayState: createInAppAgentDisplayState(),
            eventCursor: 0,
            currentRun: null,
            pendingToolApprovals: [],
          }),
          cancelRun: async () => undefined,
          decideApproval: async ({ resume }) => {
            await args.onApproveToolCall?.(JSON.stringify(resume));
          },
          initialView: {
            currentRun: {
              id: "run-1",
              status: InAppAgentRunStatus.AWAITING_APPROVAL,
              errorCode: null,
              cancelRequested: false,
            },
            pendingToolApprovals: [
              ["approval-1", "langfuse_createDashboard"],
              ["approval-2", "langfuse_createDashboardWidget"],
              ["approval-3", "langfuse_createDashboardWidget"],
              ["approval-4", "langfuse_createDashboardWidget"],
            ].map(([toolCallId, toolName]) => ({
              runId: "run-1",
              status: "pending" as const,
              approvalRequest: {
                type: "tool_approval_request" as const,
                toolCallId,
                toolName,
                runId: "run-1",
              },
            })),
          },
        }),
    );
    const snapshot = useSyncExternalStore(
      (listener) => controller.subscribe(listener),
      () => controller.getSnapshot(),
    );

    return (
      <div className="flex max-w-lg flex-col gap-2">
        {snapshot.pendingToolApprovals.map((approval, index) => (
          <InAppAgentToolCallCard
            {...args}
            key={approval.approvalRequest.toolCallId}
            tool={{
              type: "tool",
              name: approval.approvalRequest.toolName,
              status: "running",
              args: JSON.stringify({ widget: index + 1 }),
              approval: {
                id: approval.approvalRequest.toolCallId,
                status: approval.status,
                decision: approval.decision,
                position: approval.position,
                total: approval.total,
              },
            }}
            onRejectToolCall={async (approvalId) => {
              await args.onRejectToolCall?.(approvalId);
              await controller.decide({
                runId: approval.runId,
                toolCallId: approvalId,
                approved: false,
              });
            }}
            onAlwaysAllowToolCall={async (approvalId) => {
              await args.onAlwaysAllowToolCall?.(approvalId);
              await controller.decide({
                runId: approval.runId,
                toolCallId: approvalId,
                approved: true,
                approvalScope: "conversation",
              });
            }}
          />
        ))}
      </div>
    );
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("1 of 4")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    await expect(canvas.getByText("Rejected createDashboard")).toBeVisible();
    await expect(canvas.getByText("2 of 4")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Always allow" }));
    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledOnce();
    await expect(args.onAlwaysAllowToolCall).toHaveBeenCalledWith("approval-2");
    await expect(canvas.getAllByText("Submitting")).toHaveLength(3);
    await expect(canvas.queryByRole("button", { name: "Confirm" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Reject" })).toBeNull();
    await expect(args.onApproveToolCall).toHaveBeenCalledOnce();
    await expect(args.onRejectToolCall).toHaveBeenCalledOnce();
    await expect(args.onRejectToolCall).toHaveBeenCalledWith("approval-1");
  },
});
