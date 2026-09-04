import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { InAppAgentToolCallCard } from "./InAppAgentToolCallCard";

const meta = preview.meta({
  component: InAppAgentToolCallCard,
});

const showToolCall = async ({
  canvasElement,
}: {
  canvasElement: HTMLElement;
}) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByText("Show"));
  return canvas;
};

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

export const SandboxBash = meta.story({
  name: "(Test) Sandbox bash",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "bash",
      status: "succeeded",
      args: JSON.stringify({ command: "pnpm test -- changed.test.ts" }),
      result: JSON.stringify({
        stdout: "Tests  4 passed (4)\n",
        stderr: "",
        exitCode: 0,
        startedAt: "2026-08-19T08:00:00.000Z",
        completedAt: "2026-08-19T08:00:01.000Z",
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("$")).toBeVisible();
    await expect(
      canvas.queryByText("Exited with code 0"),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Arguments")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxRead = meta.story({
  name: "(Test) Sandbox read",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "read",
      status: "succeeded",
      args: JSON.stringify({ path: "src/example.ts" }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        content: "export const answer = 42;\n",
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Read")).toBeVisible();
    await expect(canvas.getByText("export const answer = 42;")).toBeVisible();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxWrite = meta.story({
  name: "(Test) Sandbox write",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "write",
      status: "succeeded",
      args: JSON.stringify({
        path: "src/example.ts",
        content: "export const answer = 42;\n",
      }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        bytesWritten: 26,
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Write")).toBeVisible();
    await expect(canvas.queryByText(/Written/)).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
  },
});

export const SandboxEdit = meta.story({
  name: "(Test) Sandbox edit",
  args: {
    isCompact: true,
    tool: {
      type: "tool",
      name: "edit",
      status: "succeeded",
      args: JSON.stringify({
        path: "src/example.ts",
        oldText: "export const answer = 41;\n",
        newText: "export const answer = 42;\n",
      }),
      result: JSON.stringify({
        path: "/workspace/src/example.ts",
        replaced: true,
      }),
    },
  },
  play: async (context) => {
    const canvas = await showToolCall(context);
    await expect(canvas.getByText("Edit")).toBeVisible();
    await expect(canvas.queryByText("Applied")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Result")).not.toBeInTheDocument();
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
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const ApprovalDisabled = meta.story({
  name: "(Test) Approval disabled",
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
    onAlwaysAllowToolCall: fn(),
    onRejectToolCall: fn(),
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "Approve" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", {
        name: "Always approve for this conversation",
      }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Decline" }),
    ).toBeDisabled();
  },
});
