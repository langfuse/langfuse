import preview from "../../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { IN_APP_AGENT_CREATE_ROUTINE_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import { InAppAgentCreateRoutineApprovalCard } from "./InAppAgentCreateRoutineApprovalCard";

const createRoutineArgs = {
  name: "Monday error scan",
  prompt: "Check every Monday for failure patterns.",
  cron: "0 9 * * 1",
  timezone: "Europe/Berlin",
};

const meta = preview.meta({
  component: InAppAgentCreateRoutineApprovalCard,
});

export const Pending = meta.story({
  args: {
    isCompact: true,
    isDisabled: false,
    tool: {
      type: "tool",
      name: IN_APP_AGENT_CREATE_ROUTINE_TOOL_NAME,
      status: "running",
      args: JSON.stringify(createRoutineArgs),
      approval: { id: "approval-routine-1", status: "pending" },
    },
    onApproveToolCall: fn(),
    onRejectToolCall: fn(),
  },
});

export const Disabled = meta.story({
  args: {
    ...Pending.args,
    isDisabled: true,
  },
});

export const EditPromptAndApprove = meta.story({
  name: "(Test) Edit prompt and approve",
  args: {
    ...Pending.args,
    onApproveToolCall: fn(),
    onRejectToolCall: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const prompt = canvas.getByLabelText("Routine prompt");
    await userEvent.clear(prompt);
    await userEvent.type(
      prompt,
      "Look for 5xx spikes and summarize the top traces.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await expect(args.onApproveToolCall).toHaveBeenCalledWith(
      "approval-routine-1",
      {
        ...createRoutineArgs,
        prompt: "Look for 5xx spikes and summarize the top traces.",
      },
    );
  },
});
