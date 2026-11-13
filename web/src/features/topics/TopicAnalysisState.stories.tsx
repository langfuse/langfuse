import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicAnalysisState } from "./TopicAnalysisState";

const meta = preview.meta({
  component: TopicAnalysisState,
  args: {
    status: "running" as const,
    outcome: "pending",
    traceCount: 245,
    onViewRun: fn(),
  },
});

export const Running = meta.story({});

// A new snapshot learns its trace count only when the run reaches a question.
export const Queued = meta.story({
  args: { status: "queued" as const, traceCount: 0 },
});

export const NotEnoughTraces = meta.story({
  name: "(Test) A question's own result stands when a later question failed the snapshot",
  args: { status: "failed" as const, outcome: "insufficient_data" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Not enough traces in this snapshot"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "View run" }));
    await expect(args.onViewRun).toHaveBeenCalled();
  },
});

export const NoClearTopics = meta.story({
  args: { status: "completed" as const, outcome: "no_topics" },
});

export const Failed = meta.story({
  args: { status: "failed" as const, outcome: "pending" },
});
